#!/usr/bin/env node
/**
 * 채널 BGM 합성기 — 외부 음원 없이 코드로 만든다.
 *
 * 왜 자체 생성인가: 상업 음원은 Content ID 클레임(수익화 박탈·인스타 음소거)이
 * 자동 발행에서 치명적이고, 유튜브 오디오 라이브러리는 유튜브 밖 사용이
 * 라이선스 밖이다. 합성 루프는 권리를 100% 소유한다.
 *
 * 구성: 드럼(킥·햇·림) + 그루브 베이스 + 패드 + 오프비트 코드 스탭 +
 * 아르페지오 + 리드 멜로디. 노트 꼬리는 루프 길이로 순환 가산(circular wrap)
 * 해서 이음새가 없다.
 *
 * 사용: node scripts/make-bgm.mjs <pulse|calm>
 * 출력: remotion/public/bgm/<channel>.wav
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const channel = process.argv[2] ?? 'pulse';
// --no-melody: 리드 멜로디를 뺀 비교용 버전을 <channel>-nomelody.wav 로 만든다.
const noMelody = process.argv.includes('--no-melody');

const SR = 44100;

/** 미디 노트 → 주파수 */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * 채널별 음악 정체성. 조·진행·템포·리듬을 갈라 청각으로도 채널이 구분되게 한다.
 * 진행은 마디당 코드 하나, [루트 미디노트, 코드 인터벌] 형식.
 */
const PRESETS = {
  pulse: {
    // A단조, 단호하지만 따뜻한 뉴스 브리핑. 전부 다이어토닉 — Am F C G / Am F G Am
    bpm: 108,
    prog: [
      [57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]],
      [57, [0, 3, 7]], [53, [0, 4, 7]], [55, [0, 4, 7]], [57, [0, 3, 7]],
    ],
    // 리드 멜로디 (미디노트, 시작박, 길이박) — 8마디에 걸친 기승전결.
    melody: [
      [69, 0, 0.75], [72, 0.75, 0.75], [76, 1.5, 1], [74, 2.5, 1.5],       // 마디1: A C E D
      [72, 4, 1], [69, 5, 1.5],                                            // 마디2: C A
      [76, 8, 0.75], [79, 8.75, 0.75], [76, 9.5, 1], [74, 10.5, 1.5],      // 마디3: E G E D
      [71, 12, 1], [74, 13, 1], [71, 14, 1.5],                             // 마디4: B D B
      [69, 16, 0.75], [72, 16.75, 0.75], [76, 17.5, 1.5], [77, 19, 1],     // 마디5: A C E F
      [76, 20, 1], [74, 21, 1], [72, 22, 1.5],                             // 마디6: E D C
      [74, 24, 0.75], [76, 24.75, 0.75], [74, 25.5, 1], [71, 26.5, 1.5],   // 마디7: D E D B
      [69, 28, 2.5],                                                       // 마디8: A (으뜸음 해결)
    ],
    // 아르페지오 — 한 옥타브 위, -1 은 쉼표. 쉼표가 있어야 음악으로 들린다.
    arpOctave: 12, arpSeq: [0, 2, 1, -1, 3, 2, -1, 1],
    // 드럼 — 킥은 1·3박, 림 백비트(2·4박), 햇 8분음표(오프비트 강세).
    kickBeats: [0, 2], rimBeats: [1, 3], hatEighths: true,
    // 베이스 그루브 — (시작박, 인터벌) 루트·옥타브·5도 사이를 오간다.
    bassPattern: [[0, 0], [1, 0], [1.5, 12], [2, 0], [3, 0], [3.5, 7]],
    gains: { kick: 0.5, hat: 0.05, rim: 0.1, bass: 0.2, pad: 0.07, stab: 0.07, arp: 0.09, melody: 0.13 },
  },
  calm: {
    // D단조, 차분한 해설 톤. 드럼 없이 패드·아르페지오 중심 (채널 간 청각 분리).
    bpm: 88,
    prog: [
      [50, [0, 3, 7]], [46, [0, 4, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]],
      [50, [0, 3, 7]], [43, [0, 3, 7]], [46, [0, 4, 7]], [45, [0, 4, 7]],
    ],
    melody: [
      [74, 0, 2], [72, 2, 2],
      [69, 8, 1.5], [70, 9.5, 0.5], [69, 10, 2],
      [74, 16, 2], [77, 18, 2],
      [72, 24, 1], [70, 25, 1], [69, 26, 2],
    ],
    arpOctave: 24, arpSeq: [0, 1, 2, 3, 2, 1, 0, 2],
    kickBeats: [], rimBeats: [], hatEighths: false,
    bassPattern: [[0, 0], [2, 0]],
    gains: { kick: 0, hat: 0, rim: 0, bass: 0.18, pad: 0.06, stab: 0, arp: 0.13, melody: 0.1 },
  },
};
const P = PRESETS[channel];
if (!P) {
  console.error(`알 수 없는 채널: ${channel} (pulse|calm)`);
  process.exit(1);
}
const G = P.gains;

const BEATS_PER_BAR = 4;
const bars = P.prog.length;
const secPerBeat = 60 / P.bpm;
const N = Math.round(SR * secPerBeat * BEATS_PER_BAR * bars);
const out = new Float64Array(N);

/** 순환 가산 — 루프 끝을 넘는 꼬리는 앞으로 감아 이음새를 없앤다. */
function add(start, samples) {
  for (let n = 0; n < samples.length; n++) {
    out[(start + n) % N] += samples[n];
  }
}

/** 결정적 의사 난수 (노이즈용) — Math.random 대신 시드 고정으로 재현 가능하게. */
let seed = 20260810;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
}

/**
 * 플럭 음색: 기음 + 2·3배음, 지수 감쇠. 마림바와 어쿠스틱 기타 사이.
 * 3배음이 들어가야 순수 사인의 "유리종" 같은 공허함이 사라진다.
 */
function pluck(freq, durSec, gain, brightness = 0.4) {
  const len = Math.round(durSec * SR);
  const s = new Float64Array(len);
  const w1 = (2 * Math.PI * freq) / SR;
  for (let n = 0; n < len; n++) {
    const env = Math.exp(-n / (SR * durSec * 0.42));
    const atk = Math.min(1, n / (SR * 0.004));
    const hEnv = Math.exp(-n / (SR * durSec * 0.18));
    s[n] =
      gain * env * atk *
      (Math.sin(w1 * n) +
        brightness * hEnv * Math.sin(w1 * 2 * n) +
        brightness * 0.4 * hEnv * Math.sin(w1 * 3 * n));
  }
  return s;
}

/** 리드 음색: 배음 3개 + 느린 비브라토. 멜로디가 노래처럼 들리게 한다. */
function lead(freq, durSec, gain) {
  const len = Math.round(durSec * SR);
  const s = new Float64Array(len);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const atk = Math.min(1, n / (SR * 0.02));
    const rel = Math.min(1, (len - n) / (SR * 0.09));
    const env = Math.exp(-n / (SR * durSec * 1.1));
    // 비브라토는 0.12초 뒤부터 서서히 — 처음부터 흔들리면 취한 소리가 난다.
    const vibDepth = 0.006 * Math.min(1, Math.max(0, t - 0.12) / 0.25);
    const f = freq * (1 + vibDepth * Math.sin(2 * Math.PI * 5.2 * t));
    const w = 2 * Math.PI * f * t;
    s[n] =
      gain * atk * rel * env *
      (Math.sin(w) + 0.35 * Math.sin(2 * w) + 0.12 * Math.sin(3 * w));
  }
  return s;
}

/** 패드 음색: 살짝 디튠된 사인 두 겹, 느린 어택. */
function pad(freq, durSec, gain) {
  const len = Math.round(durSec * SR);
  const s = new Float64Array(len);
  const w1 = (2 * Math.PI * freq * 0.9992) / SR;
  const w2 = (2 * Math.PI * freq * 1.0008) / SR;
  for (let n = 0; n < len; n++) {
    const atk = Math.min(1, n / (SR * 0.6));
    const rel = Math.min(1, (len - n) / (SR * 0.8));
    s[n] = gain * atk * rel * (Math.sin(w1 * n) + Math.sin(w2 * n)) * 0.5;
  }
  return s;
}

/** 베이스: 사인 + 약한 2배음, 짧은 감쇠 — 그루브 패턴용. */
function bass(freq, durSec, gain) {
  const len = Math.round(durSec * SR);
  const s = new Float64Array(len);
  const w = (2 * Math.PI * freq) / SR;
  for (let n = 0; n < len; n++) {
    const env = Math.exp(-n / (SR * durSec * 0.5));
    const atk = Math.min(1, n / (SR * 0.008));
    s[n] = gain * env * atk * (Math.sin(w * n) + 0.25 * Math.sin(w * 2 * n));
  }
  return s;
}

/** 킥: 사인 피치가 120→45Hz 로 급강하. 클럽 킥이 아니라 브리핑용 펄스. */
function kick(gain) {
  const len = Math.round(0.16 * SR);
  const s = new Float64Array(len);
  let phase = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 45 + 75 * Math.exp(-t * 38);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t * 26);
    s[n] = gain * env * Math.sin(phase);
  }
  return s;
}

/** 햇: 고역 노이즈 짧은 감쇠 (1차 하이패스 근사). */
function hat(gain, durSec = 0.05) {
  const len = Math.round(durSec * SR);
  const s = new Float64Array(len);
  let prev = 0;
  for (let n = 0; n < len; n++) {
    const white = rand();
    const hp = white - prev; // 차분 = 하이패스
    prev = white;
    s[n] = gain * hp * Math.exp(-n / (SR * durSec * 0.35));
  }
  return s;
}

/** 림/스네어 브러시: 중역 노이즈 + 톤 성분, 짧게. */
function rim(gain) {
  const len = Math.round(0.09 * SR);
  const s = new Float64Array(len);
  const w = (2 * Math.PI * 820) / SR;
  let prev = 0;
  for (let n = 0; n < len; n++) {
    const white = rand();
    const band = (white + prev) * 0.5 - prev * 0.3;
    prev = white;
    const env = Math.exp(-n / (SR * 0.028));
    s[n] = gain * env * (band * 0.8 + 0.3 * Math.sin(w * n));
  }
  return s;
}

const beatSamples = secPerBeat * SR;
const at = (bar, beat) => Math.round((bar * BEATS_PER_BAR + beat) * beatSamples);

for (const [bar, [root, intervals]] of P.prog.entries()) {
  // 패드 — 코드 전체를 낮게 깐다 (한 옥타브 위)
  for (const iv of intervals) {
    add(at(bar, 0), pad(hz(root + iv + 12), secPerBeat * BEATS_PER_BAR, G.pad));
  }

  // 베이스 그루브
  for (const [beat, iv] of P.bassPattern) {
    add(at(bar, beat), bass(hz(root - 12 + iv), secPerBeat * 0.9, G.bass));
  }

  // 드럼
  for (const beat of P.kickBeats) add(at(bar, beat), kick(G.kick));
  for (const beat of P.rimBeats) add(at(bar, beat), rim(G.rim));
  if (P.hatEighths) {
    for (let e = 0; e < 8; e++) {
      // 오프비트(뒷박)에 강세 — 정박 강세는 행진곡이 된다.
      const accent = e % 2 === 1 ? 1 : 0.55;
      add(at(bar, e * 0.5), hat(G.hat * accent));
    }
  }

  // 오프비트 코드 스탭 — 2.5박·4.5박(다음 마디로 걸침) 근처에서 짧게 친다.
  if (G.stab > 0) {
    for (const beat of [1.5, 3.5]) {
      for (const iv of intervals) {
        add(at(bar, beat), pluck(hz(root + iv + 12), secPerBeat * 0.5, G.stab / intervals.length, 0.5));
      }
    }
  }

  // 아르페지오 — 8분음표 순환, -1 은 쉼표.
  const seq = P.arpSeq;
  const tones = [...intervals, 12];
  for (let e = 0; e < 8; e++) {
    const step = seq[e];
    if (step === -1 || step === undefined) continue;
    add(
      at(bar, e * 0.5),
      pluck(hz(root + P.arpOctave + (tones[step] ?? 0)), secPerBeat * 0.9, G.arp, 0.45),
    );
  }
}

// 리드 멜로디 — 비브라토 있는 상성부. BGM 의 "노래" 부분.
if (!noMelody) {
  for (const [midi, startBeat, durBeats] of P.melody) {
    add(Math.round(startBeat * beatSamples), lead(hz(midi), secPerBeat * durBeats * 1.15, G.melody));
  }
}

// 정규화 — 나레이션 밑 베드이므로 여유 있게.
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(out[n]));
const norm = 0.5 / peak;

const pcm = Buffer.alloc(N * 2);
for (let n = 0; n < N; n++) {
  pcm.writeInt16LE(Math.round(out[n] * norm * 32767), n * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const outPath = resolve(
  ROOT,
  'remotion/public/bgm',
  `${channel}${noMelody ? '-nomelody' : ''}.wav`,
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(`${outPath} — ${(N / SR).toFixed(1)}초 루프, ${P.bpm}BPM, ${bars}마디`);
