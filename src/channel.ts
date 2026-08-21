import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_THEME, type Theme } from '../remotion/schema.js';
import { ROOT } from './config.js';

/**
 * 채널 성향은 코드가 아니라 설정이다.
 * 반대 성향 채널을 추가하는 일은 JSON 파일 하나를 더 두는 일이어야 한다.
 */
export interface Channel {
  id: string;
  name: string;
  /** 논조. 시스템 프롬프트에 그대로 들어간다. */
  stance: string;
  /** 이슈를 바라보는 렌즈. 대본이 어떤 각도를 잡을지 결정한다. */
  framing: string[];
  /** 주제 선정 단계에서 이 채널이 선호하는 이슈 유형. */
  topicPreference: string;
  /** 채널 생존 장치. 이걸 어기면 삭제·수익화 박탈·법적 문제로 이어진다. */
  guardrails: string[];
  /** 캡션 하단에 붙는 AI 생성 고지. */
  disclosure: string;
  /**
   * Channel sign-off — the fixed closing line of every script, anchor-style
   * (e.g. "The math, not the marketing — The Margin."). Builds recognition;
   * strongly recommended once the channel has a positioning.
   */
  signoff?: string;
  /**
   * Short brand tagline shown as an on-screen watermark and on the outro card.
   * Usually the sign-off minus the channel name.
   */
  tagline?: string;
  /**
   * One or two sentences about who actually watches (age, vocabulary level,
   * platform habits). Fed to the script prompt to calibrate language.
   */
  audienceNote?: string;
  /** 배경 이미지의 화풍. 이미지가 매번 달라도 채널 톤은 유지되게 잡는다. */
  artDirection?: string;
  /**
   * abstract = 추상·상징 (인물 전면 금지)
   * satire   = 만평풍 풍자 (익명 인물까지 허용 — 실존 인물 식별 가능 묘사는 여전히 금지)
   */
  imageStyle?: 'abstract' | 'satire';
  /** 시각 정체성. 채널마다 결과물이 달라 보여야 한다 (docs/CHANNEL.md §3-1). */
  theme: Theme;
  /**
   * TTS 목소리. 프로바이더별 식별자를 그대로 쓴다
   * (OpenAI: onyx·ash·sage 등 / ElevenLabs: voice ID).
   * 채널마다 목소리가 달라야 한다. 없으면 env 기본값.
   */
  voice?: string;
  /** 말투 지시 (OpenAI TTS 만 지원). 채널의 어조를 여기서 잡는다. */
  voiceStyle?: string;
  /** 재생 속도 (OpenAI 만, 0.25~4.0). 없으면 env 기본값(1.2). */
  voiceSpeed?: number;
  /** BGM 루프 경로 (remotion/public 기준). scripts/make-bgm.mjs 로 만든 자체 음원만. */
  bgm?: string;
  /** BGM 볼륨 (0~1, 기본 0.35). */
  bgmVolume?: number;
  /** 로컬 발행 시각 (0~23). daily 가 scheduledAt 을 여기에 맞춰 잡는다. */
  publishHour?: number;
  /**
   * 채널 로고 (remotion/public 기준 상대 경로). 아웃트로에서 원형으로 잘라 쓴다.
   * 플랫폼 핸들은 넣지 않는다 — 같은 영상이 유튜브·인스타에 함께 나간다.
   */
  logo?: string;
}

const CHANNELS_DIR = resolve(ROOT, 'channels');

export function loadChannel(id: string): Channel {
  let raw: string;
  try {
    raw = readFileSync(resolve(CHANNELS_DIR, `${id}.json`), 'utf8');
  } catch {
    throw new Error(`채널 설정을 찾을 수 없습니다: ${id} (사용 가능: ${listChannels().join(', ')})`);
  }

  const parsed = JSON.parse(raw) as Partial<Channel> & { theme?: Partial<Theme> };

  for (const field of ['id', 'name', 'stance', 'disclosure'] as const) {
    if (!parsed[field]) throw new Error(`채널 ${id}: '${field}' 가 비어 있습니다.`);
  }
  if (!parsed.guardrails?.length) {
    throw new Error(`채널 ${id}: guardrails 가 비어 있습니다. 정치 콘텐츠에서 이건 선택이 아닙니다.`);
  }

  return {
    ...(parsed as Channel),
    framing: parsed.framing ?? [],
    topicPreference: parsed.topicPreference ?? '',
    // 부분 지정을 허용한다 — 색만 바꾸고 나머지는 기본값으로 두는 경우가 흔하다.
    theme: { ...DEFAULT_THEME, ...parsed.theme },
  };
}

export function listChannels(): string[] {
  try {
    return readdirSync(CHANNELS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/**
 * 채널의 발행 시각에 맞춘 다음 시점. 이미 지났으면 내일로 넘긴다.
 * 채널마다 다른 시각을 쓰는 이유는 docs/CHANNEL.md §3-1 참고.
 */
export function nextPublishAt(channel: Channel, now = new Date()): string | undefined {
  if (channel.publishHour === undefined) return undefined;
  const at = new Date(now);
  at.setHours(channel.publishHour, 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at.toISOString();
}
