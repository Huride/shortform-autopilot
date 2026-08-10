import type { SceneVisual, WeeklyProps } from '../remotion/schema.js';

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/** 잡의 수명주기. 각 단계는 앞 단계의 산출물을 필요로 한다. */
export type JobStatus =
  | 'pending' // 소재만 있음
  | 'scripted' // 대본 생성됨
  | 'voiced' // 음성 합성됨
  | 'rendered' // 영상 렌더됨
  | 'uploaded' // 공개 URL 확보 (인스타 발행 전제)
  | 'published' // 발행 완료
  | 'failed';

export interface Scene {
  /** TTS 가 읽을 문장. 자막보다 길어도 된다. */
  narration: string;
  /** 화면에 띄울 짧은 자막. 음소거로 봐도 이해되어야 한다. */
  caption: string;
  /** caption 안에서 강조할 단어. caption 의 부분 문자열이어야 한다. */
  emphasis?: string;
  /** 장면 중앙에 띄울 인포그래픽 카드. 값은 사실 목록에서만 나온다. */
  visual?: SceneVisual;
}

export interface Script {
  /** 영상 제목. 유튜브 제목으로도 쓰인다. */
  title: string;
  /** 첫 1.5초 안에 띄울 후킹 문장. */
  hook: string;
  scenes: Scene[];
  /** 유튜브 설명 / 인스타 캡션 본문. */
  description: string;
  /** '#' 없이 태그 본문만. */
  hashtags: string[];
}

export interface AudioTrack {
  sceneIndex: number;
  /**
   * remotion/public 기준 상대 경로 (staticFile 에 넘길 값).
   * stub 프로바이더는 음성을 만들지 않으므로 비어 있다 — 길이만 추정해 레이아웃을 확인한다.
   */
  staticPath?: string;
  durationSec: number;
}

export type Platform = 'youtube' | 'instagram';

export interface PublishRecord {
  platform: Platform;
  remoteId: string;
  url?: string;
  at: string;
}

/** 주제 선정 단계가 매기는 후보 점수. 왜 이 주제가 뽑혔는지 감사할 수 있게 남긴다. */
export interface TopicCandidate {
  headline: string;
  summary: string;
  keywords: string[];
  articleIndices: number[];
  coverage: number;
  leanCoverage: string;
  shortformFit: number;
  channelFit: number;
  freshness: number;
  duplicateRisk: number;
  totalScore: number;
  reason: string;
}

/**
 * 대본 생성기에 넘어가는 취재 결과물.
 * facts 가 핵심이다 — 대본은 이 목록 밖의 사실을 주장할 수 없다.
 */
export interface Brief {
  headline: string;
  summary: string;
  keywords: string[];
  /** 채널 논조로 잡은 각도. */
  angle: string;
  facts: { claim: string; sources: string[] }[];
  /** 미확정 혐의, 반론이 있는 지점 등 단정하면 안 되는 부분. */
  caution: string[];
  sources: { source: string; lean: string; title: string; link: string }[];
}

export interface Job {
  id: string;
  /**
   * short(기본) = 데일리 숏폼 · weekly = 일요일 주간 결산 롱폼.
   * weekly 는 유튜브 전용이다 — 인스타 릴스는 가로·장초수 영상을 받지 않는다.
   */
  kind?: 'short' | 'weekly';
  topic: string;
  /** channels/<id>.json. 없으면 논조 없는 일반 정보형으로 처리한다. */
  channelId?: string;
  /** daily 파이프라인이 만든 취재 결과. 수동 add 로 만든 잡에는 없다. */
  brief?: Brief;
  /**
   * 주간 결산의 렌더 입력 (kind=weekly 전용). 렌더 전에 저장한다 —
   * 렌더가 죽어도 대본·TTS 를 다시 만들지 않고 렌더만 재시도할 수 있게.
   */
  weeklyProps?: WeeklyProps;
  /** 선정에서 밀린 후보들. 편성 판단을 사후에 검토할 때 쓴다. */
  runnerUps?: TopicCandidate[];
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  /** ISO 8601. 이 시각 전에는 발행하지 않는다. */
  scheduledAt?: string;
  script?: Script;
  audio?: AudioTrack[];
  /** 생성 배경 이미지. remotion/public 기준 상대 경로. */
  backgroundImage?: string;
  /** 렌더 산출물의 절대 경로 */
  videoPath?: string;
  /** 인스타 발행에 필요한 공개 URL */
  publicUrl?: string;
  published?: PublishRecord[];
  error?: string;
}

export const STATUS_ORDER: JobStatus[] = [
  'pending',
  'scripted',
  'voiced',
  'rendered',
  'uploaded',
  'published',
];

/** a 가 b 이상 진행됐는지. 'failed' 는 순서 밖이라 항상 false. */
export function atLeast(a: JobStatus, b: JobStatus): boolean {
  const ia = STATUS_ORDER.indexOf(a);
  const ib = STATUS_ORDER.indexOf(b);
  return ia >= 0 && ib >= 0 && ia >= ib;
}
