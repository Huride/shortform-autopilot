import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { PATHS } from '../config.js';
import { log } from '../log.js';
import {
  COMPOSITION_ID,
  DEFAULT_THEME,
  WEEKLY_COMPOSITION_ID,
  type ShortProps,
  type Theme,
  type WeeklyProps,
} from '../../remotion/schema.js';
import { VIDEO, type AudioTrack, type Script } from '../types.js';

/** 번들은 프로세스당 한 번만 만든다 — 잡마다 다시 만들면 렌더 시간이 배로 든다. */
let bundlePromise: Promise<string> | null = null;

function getBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: PATHS.remotionEntry,
    publicDir: PATHS.remotionPublic,
    onProgress: (p) => {
      if (p === 100) log.info('  번들 완료');
    },
  });
  return bundlePromise;
}

export interface RenderExtras {
  backgroundImage?: string;
  bgmSrc?: string;
  bgmVolume?: number;
  /** 채널 워드마크 — 인트로 브랜드 마크 + 로고 아웃트로. */
  brand?: string;
  /** 로고 이미지 (remotion/public 기준). 아웃트로에서 원형 크롭. */
  brandLogo?: string;
  brandTagline?: string;
}

export function toShortProps(
  script: Script,
  audio: AudioTrack[],
  theme: Theme = DEFAULT_THEME,
  extras: RenderExtras = {},
): ShortProps {
  const byIndex = new Map(audio.map((a) => [a.sceneIndex, a]));

  return {
    title: script.title,
    hook: script.hook,
    theme,
    ...(extras.backgroundImage ? { backgroundImage: extras.backgroundImage } : {}),
    ...(extras.bgmSrc ? { bgmSrc: extras.bgmSrc } : {}),
    ...(extras.bgmVolume !== undefined ? { bgmVolume: extras.bgmVolume } : {}),
    ...(extras.brand ? { brand: extras.brand } : {}),
    ...(extras.brandTagline ? { brandTagline: extras.brandTagline } : {}),
    ...(extras.brandLogo ? { brandLogo: extras.brandLogo } : {}),
    scenes: script.scenes.map((scene, i) => {
      const track = byIndex.get(i);
      if (!track) throw new Error(`장면 ${i} 의 오디오 정보가 없습니다.`);
      return {
        caption: scene.caption,
        ...(scene.emphasis ? { emphasis: scene.emphasis } : {}),
        ...(scene.visual ? { visual: scene.visual } : {}),
        ...(scene.visual2 ? { visual2: scene.visual2 } : {}),
        ...(scene.bg ? { bg: scene.bg } : {}),
        ...(scene.outro ? { outro: true } : {}),
        ...(track.staticPath ? { audioSrc: track.staticPath } : {}),
        // 나레이션 끝에 0.35초 여백 — 전환이 마지막 음절을 물지 않게.
        durationInFrames: Math.max(Math.round((track.durationSec + 0.35) * VIDEO.fps), 1),
      };
    }),
  };
}

/** 주간 결산 롱폼 렌더. Shorts 길이 제한이 없다 — 대신 15분 초과만 이상 신호로 막는다. */
export async function renderWeekly(jobId: string, props: WeeklyProps): Promise<string> {
  mkdirSync(PATHS.out, { recursive: true });
  const outputLocation = resolve(PATHS.out, `${jobId}.mp4`);

  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: WEEKLY_COMPOSITION_ID,
    inputProps: props,
  });

  const totalSec = composition.durationInFrames / composition.fps;
  log.info(`  총 ${(totalSec / 60).toFixed(1)}분`);
  if (totalSec > 15 * 60) {
    throw new Error(`영상이 ${(totalSec / 60).toFixed(1)}분입니다. 주간 결산 상한(15분)을 넘었습니다 — 대본 생성 오류일 가능성이 큽니다.`);
  }

  let lastLogged = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    crf: 23,
    outputLocation,
    inputProps: props,
    // 6분+ 1080p 렌더에서 기본 동시성(코어/2)은 헤드리스 크롬을 OOM 으로 죽인다
    // (실측: 16GB 머신, 동시성 2에서도 가용 메모리 64MB 까지 몰리며 크래시).
    // 1 이면 느리지만 완주한다 — 주간 1회짜리 렌더라 시간은 문제가 아니다.
    concurrency: 1,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastLogged + 10) {
        lastLogged = pct;
        log.info(`  렌더 ${pct}%`);
      }
    },
  });

  return outputLocation;
}

export async function renderShort(jobId: string, props: ShortProps): Promise<string> {
  mkdirSync(PATHS.out, { recursive: true });
  const outputLocation = resolve(PATHS.out, `${jobId}.mp4`);

  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: props,
  });

  const totalSec = composition.durationInFrames / composition.fps;
  if (totalSec > 180) {
    // 3분을 넘으면 유튜브가 Shorts 로 분류하지 않는다.
    throw new Error(`영상이 ${totalSec.toFixed(0)}초입니다. Shorts 상한은 180초입니다.`);
  }
  if (totalSec > 90) {
    log.warn(`${totalSec.toFixed(0)}초 — 인스타 릴스 탭 노출 조건(5~90초)을 벗어납니다.`);
  }

  let lastLogged = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    // 기본 CRF(18)는 30초에 65MB 를 만든다. 23이면 화질 차이 없이 절반 이하로
    // 떨어지고, 어차피 플랫폼이 재인코딩하므로 그 이상 쓰는 건 낭비다.
    crf: 23,
    outputLocation,
    inputProps: props,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastLogged + 20) {
        lastLogged = pct;
        log.info(`  렌더 ${pct}%`);
      }
    },
  });

  return outputLocation;
}
