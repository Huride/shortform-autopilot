import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..');

/** 의존성 없이 .env 를 읽는다 (dotenv 를 끌어올 만큼의 일이 아니다). */
function loadDotenv(): void {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // 실제 환경변수가 우선
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotenv();

export const PATHS = {
  data: resolve(ROOT, 'data'),
  jobs: resolve(ROOT, 'data/jobs'),
  out: resolve(ROOT, 'out'),
  remotionEntry: resolve(ROOT, 'remotion/index.ts'),
  remotionPublic: resolve(ROOT, 'remotion/public'),
  /** TTS 산출물은 Remotion 이 staticFile() 로 집어야 해서 public 아래에 둔다. */
  audio: resolve(ROOT, 'remotion/public/audio'),
  background: resolve(ROOT, 'remotion/public/bg'),
} as const;

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** 없으면 그 단계에서만 실패하도록, 호출 시점에 던진다. */
export function required(name: string): string {
  const v = opt(name);
  if (!v) {
    throw new Error(
      `환경변수 ${name} 가 없습니다. .env.example 을 참고해 .env 에 채우세요.`,
    );
  }
  return v;
}

export const env = {
  /**
   * 대본·주제선정에 쓸 LLM 프로바이더.
   * 명시하지 않으면 존재하는 키를 보고 정한다 (OpenAI 우선).
   */
  llmProvider: (): 'openai' | 'anthropic' => {
    const explicit = opt('LLM_PROVIDER');
    if (explicit === 'openai' || explicit === 'anthropic') return explicit;
    if (opt('OPENAI_API_KEY')) return 'openai';
    return 'anthropic';
  },
  hasAnyLlmKey: () => Boolean(opt('OPENAI_API_KEY') ?? opt('ANTHROPIC_API_KEY')),

  openaiApiKey: () => required('OPENAI_API_KEY'),
  openaiModel: () => opt('OPENAI_MODEL') ?? 'gpt-5.5',
  /** gpt-5 계열의 추론 깊이. 비용에 직결된다. */
  openaiReasoningEffort: () => opt('OPENAI_REASONING_EFFORT') ?? 'medium',

  /** 배경 이미지. 끄면 테마 배경(그라디언트/스플릿)만 쓴다. */
  backgroundImages: () => (opt('BACKGROUND_IMAGES') ?? 'on') !== 'off',
  imageModel: () => opt('IMAGE_MODEL') ?? 'gpt-image-1',
  imageQuality: () => opt('IMAGE_QUALITY') ?? 'medium',

  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  model: () => opt('CLAUDE_MODEL') ?? 'claude-opus-5',

  tts: {
    /** 명시하지 않으면 OpenAI 키가 있을 때 openai, 없으면 stub. */
    provider: (): 'openai' | 'elevenlabs' | 'stub' => {
      const explicit = opt('TTS_PROVIDER');
      if (explicit === 'openai' || explicit === 'elevenlabs' || explicit === 'stub') {
        return explicit;
      }
      return opt('OPENAI_API_KEY') ? 'openai' : 'stub';
    },
    openaiModel: () => opt('OPENAI_TTS_MODEL') ?? 'gpt-4o-mini-tts',
    openaiVoice: () => opt('OPENAI_TTS_VOICE') ?? 'sage',
    /** 숏폼 기본 감각 1.15~1.25. 지시문은 속도를 못 바꾸고 이 값만 먹힌다 (실측). */
    openaiSpeed: () => Number(opt('OPENAI_TTS_SPEED') ?? '1.2'),
    elevenLabsKey: () => required('ELEVENLABS_API_KEY'),
    voiceId: () => required('ELEVENLABS_VOICE_ID'),
    modelId: () => opt('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2',
  },

  storage: {
    enabled: () => Boolean(opt('S3_BUCKET')),
    bucket: () => required('S3_BUCKET'),
    endpoint: () => opt('S3_ENDPOINT'),
    region: () => opt('S3_REGION') ?? 'auto',
    accessKeyId: () => required('S3_ACCESS_KEY_ID'),
    secretAccessKey: () => required('S3_SECRET_ACCESS_KEY'),
    /** 버킷의 공개 베이스 URL. Meta 가 여기로 cURL 해간다. */
    publicBaseUrl: () => required('S3_PUBLIC_BASE_URL').replace(/\/+$/, ''),
    /** 운영 페이지 오브젝트 키. 내용은 공개 정보지만 URL 은 추측 어렵게. */
    opsPageKey: () => opt('OPS_PAGE_KEY') ?? 'ops/daily.html',
  },

  /** BCP-47 language of your content (metadata language on platforms). */
  contentLanguage: () => opt('CONTENT_LANGUAGE') ?? 'en',
  youtube: {
    enabled: () => Boolean(opt('YOUTUBE_CLIENT_ID')),
    clientId: () => required('YOUTUBE_CLIENT_ID'),
    clientSecret: () => required('YOUTUBE_CLIENT_SECRET'),
    refreshToken: () => required('YOUTUBE_REFRESH_TOKEN'),
    /** 심사 통과 전에는 'private' 로 두는 것이 맞다. */
    privacyStatus: () => opt('YOUTUBE_PRIVACY_STATUS') ?? 'private',
    /** Synthetic-media disclosure flag sent with every upload. Defaults on. */
    syntheticMedia: () => (opt('YOUTUBE_SYNTHETIC_MEDIA') ?? 'true') === 'true',
    categoryId: () => opt('YOUTUBE_CATEGORY_ID') ?? '27', // Education
  },

  instagram: {
    enabled: () => Boolean(opt('IG_USER_ID')),
    userId: () => required('IG_USER_ID'),
    accessToken: () => required('IG_ACCESS_TOKEN'),
    /** Instagram Login 이면 graph.instagram.com, Facebook Login 이면 graph.facebook.com */
    graphHost: () => opt('IG_GRAPH_HOST') ?? 'graph.instagram.com',
    /** 릴스 발행 직후 같은 영상을 스토리로도 올린다. 끄려면 IG_STORY=off */
    storyEnabled: () => (opt('IG_STORY') ?? 'on') !== 'off',
    apiVersion: () => opt('IG_API_VERSION') ?? 'v23.0',
  },
} as const;
