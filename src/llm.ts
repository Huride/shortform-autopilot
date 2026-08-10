import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';
import { env } from './config.js';
import { log } from './log.js';

/**
 * 구조화 출력 한 겹.
 *
 * 프로바이더별 SDK 의 zod 헬퍼를 쓰지 않는 이유: OpenAI 헬퍼와 Anthropic 헬퍼가
 * 서로 다른 zod 코어(v3/v4)를 요구해 같은 스키마 객체를 양쪽에 넘길 수 없다.
 * 여기서는 zod → JSON Schema 로 한 번 변환해 두 API 에 그대로 주고,
 * 응답 검증만 zod 로 한다. 스키마 정의는 한 벌로 유지된다.
 */

/**
 * OpenAI strict 모드는 모든 object 에 additionalProperties:false 와
 * 전체 필드의 required 를 요구한다. zod 변환 결과가 항상 그렇지는 않아 보정한다.
 */
function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== 'object') return node;

  const obj = { ...(node as Record<string, unknown>) };
  for (const [key, value] of Object.entries(obj)) {
    if (key !== 'properties') obj[key] = strictify(value);
  }

  if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
    const properties = obj.properties as Record<string, unknown>;
    obj.properties = Object.fromEntries(
      Object.entries(properties).map(([k, v]) => [k, strictify(v)]),
    );
    obj.additionalProperties = false;
    obj.required = Object.keys(properties);
  }
  return obj;
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete raw.$schema;
  return strictify(raw) as Record<string, unknown>;
}

export class RefusalError extends Error {}

/**
 * 프로세스 단위 토큰 누적. 예산이 빠듯할 때 어느 단계가 비싼지 바로 보이게 한다.
 * 정확한 청구액은 프로바이더 대시보드가 기준이다 — 여기서는 규모만 본다.
 */
export const usage = { input: 0, output: 0, calls: 0 };

function record(step: string, input: number, output: number): void {
  usage.input += input;
  usage.output += output;
  usage.calls += 1;
  log.info(`  ${step} · 입력 ${input.toLocaleString()} / 출력 ${output.toLocaleString()} 토큰`);
}

export function usageSummary(): string {
  return `LLM 호출 ${usage.calls}회 · 입력 ${usage.input.toLocaleString()} / 출력 ${usage.output.toLocaleString()} 토큰`;
}

export interface StructuredRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** 스키마 이름. OpenAI 가 요구한다. 영문·숫자·밑줄만. */
  name: string;
  maxTokens?: number;
}

async function callOpenAI(
  req: StructuredRequest<unknown>,
  jsonSchema: Record<string, unknown>,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.openaiApiKey()}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model: env.openaiModel(),
      max_completion_tokens: req.maxTokens ?? 16000,
      reasoning_effort: env.openaiReasoningEffort(),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.name, strict: true, schema: jsonSchema },
      },
    }),
  });

  const body = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  }

  const choice = body.choices?.[0];
  if (choice?.message?.refusal) throw new RefusalError(String(choice.message.refusal));
  if (choice?.finish_reason === 'length') {
    throw new Error('출력이 max_completion_tokens 에서 잘렸습니다. 한도를 올리세요.');
  }
  const content = choice?.message?.content;
  if (!content) throw new Error(`빈 응답 (finish_reason: ${choice?.finish_reason}).`);
  record(req.name, body.usage?.prompt_tokens ?? 0, body.usage?.completion_tokens ?? 0);
  return content;
}

async function callAnthropic(
  req: StructuredRequest<unknown>,
  jsonSchema: Record<string, unknown>,
): Promise<string> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });
  const response = await client.messages.create({
    model: env.model(),
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: jsonSchema } },
    messages: [{ role: 'user', content: req.user }],
  });

  if (response.stop_reason === 'refusal') {
    throw new RefusalError(response.stop_details?.category ?? 'unknown');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error(`빈 응답 (stop_reason: ${response.stop_reason}).`);
  }
  record(req.name, response.usage.input_tokens, response.usage.output_tokens);
  return text.text;
}

/** 일시적 오류만 재시도한다. 스키마 오류나 거절은 재시도해도 같다. */
function isTransient(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b(429|5\d\d)\b|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg);
}

export async function generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
  const jsonSchema = toJsonSchema(req.schema);
  const provider = env.llmProvider();

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw =
        provider === 'openai'
          ? await callOpenAI(req as StructuredRequest<unknown>, jsonSchema)
          : await callAnthropic(req as StructuredRequest<unknown>, jsonSchema);
      return req.schema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof RefusalError || !isTransient(error)) throw error;
      lastError = error;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastError;
}
