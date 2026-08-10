import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PATHS, env } from '../config.js';
import { log } from '../log.js';
import type { AudioTrack, Script } from '../types.js';

/** 한국어 낭독 속도 대략치. stub 프로바이더와 ffprobe 실패 시의 하한으로만 쓴다. */
const CHARS_PER_SEC = 5.0;
const TRAILING_PAUSE_SEC = 0.35;

function estimateDuration(text: string): number {
  return text.length / CHARS_PER_SEC + TRAILING_PAUSE_SEC;
}

/**
 * ffprobe 가 있으면 정확한 길이를, 없으면 CBR MP3 비트레이트로 계산한다.
 * ElevenLabs 의 mp3_44100_128 은 CBR 이라 바이트 수 → 길이 환산이 프레임 단위로 정확하다.
 */
function measureMp3(path: string, bytes: number, bitrateKbps: number): number {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const seconds = Number.parseFloat(out.trim());
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  } catch {
    // ffprobe 미설치 — 아래 환산으로 넘어간다.
  }
  return (bytes * 8) / (bitrateKbps * 1000);
}

export interface VoiceOptions {
  /** 프로바이더별 목소리 식별자. 채널마다 달라야 한다 (docs/CHANNEL.md §3-1). */
  voice?: string;
  /** 톤 지시 (OpenAI 만 지원). 채널의 말투를 여기서 잡는다. */
  style?: string;
  /**
   * 재생 속도 (OpenAI 만 지원, 0.25~4.0).
   * 실측: 지시문("빠르게")은 속도를 거의 바꾸지 못하고 이 파라미터만 확실히 먹힌다.
   * 숏폼 기본 감각은 1.15~1.25. 1.4 를 넘으면 부자연스러워진다.
   */
  speed?: number;
}

export interface TtsProvider {
  readonly name: string;
  /** 반환하는 staticPath 는 remotion/public 기준 상대 경로다. */
  synthesize(
    text: string,
    outAbsPath: string,
    options?: VoiceOptions,
  ): Promise<{ staticPath?: string; durationSec: number }>;
}

/**
 * PCM WAV 길이 계산. OpenAI TTS 는 스트리밍 응답이라 data 청크 크기가
 * 0xFFFFFFFF placeholder 로 오므로, 헤더의 크기 대신 실제 바이트 수로 계산한다.
 */
function wavDuration(buf: Buffer): number {
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error('WAV 형식이 아닙니다.');
  }
  let i = 12;
  let byteRate = 0;
  while (i < buf.length - 8) {
    const id = buf.subarray(i, i + 4).toString('ascii');
    const size = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(i + 16);
    if (id === 'data') {
      if (!byteRate) break;
      const declared = size === 0xffffffff ? buf.length - (i + 8) : size;
      const actual = Math.min(declared, buf.length - (i + 8));
      return actual / byteRate;
    }
    i += 8 + size + (size & 1);
  }
  throw new Error('WAV 헤더를 해석할 수 없습니다.');
}

/** 키 없이 파이프라인 전체를 돌려 레이아웃과 타이밍을 확인하기 위한 프로바이더. */
const stubProvider: TtsProvider = {
  name: 'stub',
  async synthesize(text) {
    return { durationSec: estimateDuration(text) };
  },
};

/** OpenAI TTS. LLM 과 같은 키를 쓴다. WAV 로 받아 길이를 정확히 잰다. */
const openaiProvider: TtsProvider = {
  name: 'openai',
  async synthesize(text, outAbsPath, options) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.openaiApiKey()}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: env.tts.openaiModel(),
        voice: options?.voice ?? env.tts.openaiVoice(),
        response_format: 'wav',
        input: text,
        speed: options?.speed ?? env.tts.openaiSpeed(),
        ...(options?.style ? { instructions: options.style } : {}),
      }),
    });

    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);

    const bytes = Buffer.from(await res.arrayBuffer());
    const wavPath = outAbsPath.replace(/\.mp3$/, '.wav');
    mkdirSync(resolve(wavPath, '..'), { recursive: true });
    writeFileSync(wavPath, bytes);

    return {
      staticPath: relative(PATHS.remotionPublic, wavPath),
      durationSec: wavDuration(bytes),
    };
  },
};

const elevenLabsProvider: TtsProvider = {
  name: 'elevenlabs',
  async synthesize(text, outAbsPath, options) {
    const bitrateKbps = 128;
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${options?.voice ?? env.tts.voiceId()}` +
      `?output_format=mp3_44100_${bitrateKbps}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': env.tts.elevenLabsKey(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: env.tts.modelId(),
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    mkdirSync(resolve(outAbsPath, '..'), { recursive: true });
    writeFileSync(outAbsPath, bytes);

    return {
      staticPath: relative(PATHS.remotionPublic, outAbsPath),
      durationSec: measureMp3(outAbsPath, bytes.length, bitrateKbps),
    };
  },
};

const PROVIDERS: Record<string, TtsProvider> = {
  stub: stubProvider,
  openai: openaiProvider,
  elevenlabs: elevenLabsProvider,
};

export function getProvider(): TtsProvider {
  return PROVIDERS[env.tts.provider()] ?? stubProvider;
}

export async function synthesizeScript(
  jobId: string,
  script: Script,
  options?: VoiceOptions,
): Promise<AudioTrack[]> {
  const provider = getProvider();
  if (provider.name === 'stub') {
    log.warn('TTS_PROVIDER=stub — 음성 없이 길이만 추정합니다 (레이아웃 확인용).');
  }

  const tracks: AudioTrack[] = [];
  for (const [i, scene] of script.scenes.entries()) {
    const outPath = resolve(PATHS.audio, jobId, `scene-${String(i).padStart(2, '0')}.mp3`);
    const { staticPath, durationSec } = await provider.synthesize(
      scene.narration,
      outPath,
      options,
    );
    tracks.push({
      sceneIndex: i,
      ...(staticPath ? { staticPath } : {}),
      // 자막을 읽을 시간은 확보한다 — 나레이션이 짧아도 장면이 깜빡이지 않도록.
      durationSec: Math.max(durationSec, estimateDuration(scene.caption), 1.4),
    });
    log.info(`  장면 ${i + 1}/${script.scenes.length} · ${durationSec.toFixed(1)}초`);
  }
  return tracks;
}
