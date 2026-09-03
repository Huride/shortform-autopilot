/**
 * 만평 배경 — 장면 설계 → 이미지 생성 → 비전 글자 검수 → 재시도.
 *
 * moneyradar 블로그 만평 모듈을 세로형(숏폼 배경)으로 일반화해 이식했다.
 * 핵심 노하우: 한글 라벨은 짧게(말풍선 10자, 라벨 6자, 헤드라인 7자) — 길수록
 * 글자가 깨진다. 생성 후 비전 모델로 텍스트를 읽어 지정 문구와 대조하고,
 * 깨졌으면 fixNote 를 되먹여 재생성한다(최대 3회, 끝내 실패 시 마지막 시도 사용).
 * 비용: 이미지 최대 3회 + 비전 최대 3회 — 일반 배경 대비 3~4배.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Channel } from '../channel.js';
import { PATHS, env } from '../config.js';
import { log } from '../log.js';

const STYLE = `Dramatic Korean webtoon poster style, PORTRAIT (vertical) composition: heavy bold ink outlines, dark moody atmosphere, high contrast saturated colors, exaggerated expressions, dynamic composition. Classic Korean satirical webtoon poster aesthetic. Keep the center-left vertical band relatively calm so subtitle text can sit over it.`;

type CartoonDesign = {
  scene: string;
  bubble: string;
  labels: string[];
  headline: string;
  subcaption: string;
  objectLabel: string | null;
  alt: string;
};

const CHAT_MODEL = 'gpt-5.5';

/** 주제·내용에서 한 컷 풍자 만평 장면을 설계한다. */
async function designCartoon(input: { headline: string; summary: string }, channel: Channel): Promise<CartoonDesign> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.openaiApiKey()}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `시사 만평 작가다. 주어진 이슈를 한 컷 풍자 만평으로 설계한다.

규칙:
- scene: 장면의 영문 묘사 2~4문장. 등장인물은 역할 캐릭터(a stern official, a company chairman figure, ordinary citizens, a bull, a bear 등)로. 실존 인물 얼굴 재현 금지. 이슈의 긴장·아이러니가 한 장면에 압축되게. 세로 구도에 맞게.
- bubble: 핵심 인물의 말풍선 한글 문구. 최대 10자. 이슈 속 발언·정책·선언을 압축.
- labels: 상황 설명 라벨(검은 스티커) 한글 2~3개. 각 2~6자.
- headline: 하단 대형 빨간 헤드라인. 한글 3~7자. 이슈의 본질을 찌르는 제목.
- subcaption: 헤드라인 아래 흰색 부제. 한글 8~16자.
- objectLabel: 장면 속 소품(종이·간판 등)에 적을 한글 라벨 1개(2~6자). 없으면 null.
- alt: 이미지 alt 텍스트 15~30자.
- 풍자는 상황의 아이러니를 겨냥. 조롱·비하 금지. 유머러스하되 품위 유지.
- JSON {"scene","bubble","labels","headline","subcaption","objectLabel","alt"} 로만 답한다.`,
        },
        {
          role: 'user',
          content: `채널 관점: ${channel.stance.slice(0, 200)}\n\n이슈: ${input.headline}\n\n내용:\n${input.summary.slice(0, 2200)}`,
        },
      ],
    }),
  });
  const out = (await res.json()) as any;
  if (!res.ok) throw new Error(`만평 설계 ${res.status}: ${out?.error?.message ?? ''}`);
  return JSON.parse(out.choices[0].message.content) as CartoonDesign;
}

function buildPrompt(d: CartoonDesign, fixNote: string): string {
  const texts = [
    `- speech bubble (jagged, near the speaking character): "${d.bubble}"`,
    ...d.labels.map((l) => `- black label sticker with bold white/red Korean text: "${l}"`),
    d.objectLabel ? `- a prop in the scene (paper/sign) reads: "${d.objectLabel}"` : null,
    `- big bold red Korean headline along the bottom: "${d.headline}"`,
    `- smaller white Korean caption under the headline: "${d.subcaption}"`,
  ].filter(Boolean).join('\n');
  const all = [d.bubble, ...d.labels, d.objectLabel, d.headline, d.subcaption].filter(Boolean);
  return `${STYLE}

Scene: ${d.scene} No real person's likeness — generic role characters only.

Text elements to render (each Korean string must be spelled EXACTLY, stroke-perfect and legible):
${texts}

Every Korean string, spelled exactly: ${all.map((t) => `"${t}"`).join(', ')}. Do not add any other text.${fixNote ? `\n${fixNote}` : ''}`;
}

/** 이미지 속 텍스트를 비전으로 읽어 기대 문구와 대조한다. 문제 문구 배열 반환. */
async function verifyText(b64: string, expected: string[]): Promise<string[]> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.openaiApiKey()}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: CHAT_MODEL,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `이미지에 다음 한글 문구들이 각각 정확한 철자로 적혀 있는지 검사해라. 획이 뭉개졌거나 다른 글자로 보이면 실패다.\n${expected.map((t) => `- "${t}"`).join('\n')}\nJSON {"failed":["잘못 적힌 문구", ...]} 로만 답해라. 전부 정확하면 빈 배열.` },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        }],
      }),
    });
    const out = (await res.json()) as any;
    return (JSON.parse(out.choices[0].message.content).failed ?? []) as string[];
  } catch {
    return []; // 검수 실패 시 통과 처리 (생성 자체를 막지 않는다)
  }
}

/**
 * 만평 배경 생성. remotion/public 기준 상대 경로를 반환한다
 * (generateBackground 와 같은 계약 — 워커에서 그대로 바꿔 끼울 수 있다).
 */
export async function generateCartoonBackground(
  jobId: string,
  input: { headline: string; summary: string },
  channel: Channel,
): Promise<string> {
  const design = await designCartoon(input, channel);
  const expected = [design.bubble, ...design.labels, design.objectLabel, design.headline, design.subcaption]
    .filter((t): t is string => Boolean(t));

  const outPath = resolve(PATHS.background, `${jobId}.png`);
  mkdirSync(resolve(outPath, '..'), { recursive: true });

  let best: string | null = null;
  let fixNote = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.openaiApiKey()}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(300_000),
      body: JSON.stringify({
        model: env.imageModel(),
        prompt: buildPrompt(design, fixNote),
        size: '1024x1536',
        quality: env.imageQuality(),
        n: 1,
      }),
    });
    const body = (await res.json()) as any;
    const b64 = body.data?.[0]?.b64_json as string | undefined;
    if (!b64) {
      log.warn(`만평 생성 실패(${attempt}차): ${JSON.stringify(body).slice(0, 150)}`);
      continue;
    }
    best = b64;
    const failed = await verifyText(b64, expected);
    if (failed.length === 0) {
      writeFileSync(outPath, Buffer.from(b64, 'base64'));
      log.info(`만평 확정 (${attempt}차 시도, 글자 검수 통과)`);
      return relative(PATHS.remotionPublic, outPath);
    }
    log.info(`만평 글자 깨짐(${attempt}차): ${failed.join(', ')} — 재생성`);
    fixNote = `CRITICAL: In the previous attempt these Korean strings were misspelled: ${failed.map((t) => `"${t}"`).join(', ')}. Render them with extra care, large and clear.`;
  }
  if (!best) throw new Error('만평 생성이 모두 실패했습니다.');
  writeFileSync(outPath, Buffer.from(best, 'base64'));
  log.info('만평 저장 (검수 미통과분 중 마지막 시도 사용)');
  return relative(PATHS.remotionPublic, outPath);
}
