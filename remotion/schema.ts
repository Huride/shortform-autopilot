/** 렌더러와 컴포지션이 공유하는 props 계약. src/ 와 remotion/ 양쪽에서 import 한다. */

// interface 가 아니라 type 이어야 한다 — Remotion 의 Composition 은 props 가
// Record<string, unknown> 에 대입 가능하길 요구하는데, interface 는 암묵적 인덱스
// 시그니처를 갖지 않아 거부된다.

/**
 * 채널별 시각 정체성.
 *
 * 이게 단순한 취향 설정이 아닌 이유: 같은 운영자의 여러 채널을 잇는 가장 강한
 * 단서가 "결과물이 같은 도구로 만들어 보인다"는 점이다. 계정·IP·업로드 시각을
 * 분리해도 영상을 나란히 놓으면 드러난다. 채널마다 폰트·레이아웃·배경·진행 표시가
 * 실제로 달라야 한다.
 */
export type Theme = {
  /**
   * CSS font-family 스택.
   *
   * ⚠️ 시스템 설치 폰트에 의존한다. 렌더러를 리눅스 서버로 옮기면 BM 도현·나눔명조가
   * 없어 두 채널이 같은 기본 산세리프로 떨어지고 — 조용히, 오류 없이 —
   * 시각 분리가 사라진다. 서버 이전 전에 폰트 파일을 remotion/public 에 넣고
   * @font-face 로 고정해야 한다. `pnpm cli fonts` 가 현재 설치 여부를 점검한다.
   *
   * 가짜 볼드(faux bold)를 피할 것: 나눔명조는 700 까지가 실제 굵기이고
   * 800 을 주면 합성되어 세리프가 뭉개진다.
   */
  fontStack: string;
  bg: string;
  fg: string;
  accent: string;
  /** 자막 위치. center = 화면 중앙, lower = 하단 1/3 좌측 정렬 */
  layout: 'center' | 'lower';
  /** 배경 처리 */
  background: 'gradient' | 'split' | 'grid';
  /** plain = 글자만, block = 강조 단어에 accent 블록 */
  captionStyle: 'plain' | 'block';
  /**
   * 강조어(emphasis) 연출. 없으면 captionStyle 에서 유도한다
   * (block → box, plain → color). 채널마다 다르게 잡아 포맷 정체성을 만든다.
   * color=액센트 색 / box=액센트 배경 블록 / underline=두꺼운 밑줄 /
   * glow=네온 발광 / chip=테두리 칩
   */
  emphasisStyle?: 'color' | 'box' | 'underline' | 'glow' | 'chip';
  /** 상단 제목 칩 표시 여부 */
  titleChip: boolean;
  progress: 'bar' | 'dots' | 'none';
  /** fullscreen = 전면 후킹 카드, banner = 상단 띠 */
  hook: 'fullscreen' | 'banner';
  captionSize: number;
  captionWeight: number;
};

/**
 * 장면 중앙에 얹는 인포그래픽 카드. 코드로 그리므로 비용 0, 저작권 리스크 0.
 * 값은 대본 생성기가 사실 목록에서 뽑는다 — 화면의 숫자도 fact-lock 안이다.
 */
export type SceneVisual =
  /** sub: 숫자의 부연 한 줄. 카드가 숫자 하나로 끝나지 않게 맥락을 붙인다. */
  | { kind: 'stat'; value: string; label: string; sub?: string }
  | { kind: 'quote'; text: string; attribution: string }
  | {
      kind: 'contrast';
      leftLabel: string;
      leftValue: string;
      rightLabel: string;
      rightValue: string;
    }
  /**
   * 강조어 스탬프 — 논평 장면의 기본값. 카드 없는 장면도 중앙이 비지 않게.
   * text 는 caption 과 겹치지 않는 말이어야 한다 (script.ts 가 검증).
   * sub: 스탬프 아래 붙는 한 줄 설명.
   */
  | { kind: 'keyword'; text: string; sub?: string }
  /** 항목 나열 — 참석자·일정·사례처럼 나열이 핵심인 장면. */
  | { kind: 'list'; title: string; items: string[] }
  /** 시세 차트 — 자체 렌더 스파크라인. points 는 세션 종가 시계열. */
  | { kind: 'chart'; label: string; value: string; points: number[]; up: boolean }
  /** 종목 로고 카드 — 주도주 장면. src 는 remotion/public 기준 상대 경로. */
  | { kind: 'logo'; src: string; name: string; value: string; up: boolean }
  | { kind: 'logos'; items: { src: string; name: string; value: string; up?: boolean }[] };

export type ShortScene = {
  caption: string;
  /** caption 의 부분 문자열. 강조 색으로 칠한다. */
  emphasis?: string;
  /** remotion/public 기준 상대 경로. 없으면 무음으로 렌더된다. */
  audioSrc?: string;
  /** 문장 단위 오디오 — 순차 재생. 있으면 audioSrc 대신 이걸 쓴다. */
  audioSegments?: { src: string; from: number }[];
  /** 문장 경계 프레임(장면 시작 기준) — 중앙 카드가 이 시점마다 킥 한다. */
  sentenceKicks?: number[];
  /** 이 프레임(장면 시작 기준)부터 브랜드 아웃트로가 덮는다 — 사인오프 문장 시작점. */
  outroFrom?: number;
  /** 있으면 장면 중앙에 인포그래픽 카드를 띄운다. 시선 리듬용. */
  visual?: SceneVisual;
  /** 있으면 장면 후반부에 visual 을 이 카드로 교체한다 (말의 초점 이동 추적). */
  visual2?: SceneVisual;
  /** true 면 visual2 를 교체가 아니라 동시 배치로 — visual(차트 등)은 상단 유지, visual2 는 장면 35% 지점에 아래 크게. */
  stackVisuals?: boolean;
  /** 장면 배경 이미지 (remotion/public 기준). 없으면 전역 배경/테마 배경. */
  bg?: string;
  /** true 면 이 장면부터 브랜드 아웃트로 화면 위에서 나레이션이 흐른다 (사인오프 장면용). */
  outro?: boolean;
  durationInFrames: number;
};

export type ShortProps = {
  title: string;
  hook: string;
  scenes: ShortScene[];
  theme: Theme;
  /**
   * remotion/public 기준 상대 경로. 있으면 테마 배경 대신 이 이미지를 느리게
   * 팬·줌해서 쓴다. 자막 가독성을 위해 어둡게 덮는다.
   */
  backgroundImage?: string;
  /**
   * BGM 루프. remotion/public 기준 상대 경로. 나레이션 밑에 낮게 깔리고
   * 끝에서 페이드아웃한다. 자체 합성 음원만 쓴다 (scripts/make-bgm.mjs) —
   * 상업 음원은 Content ID 클레임이 자동 발행에서 치명적이다.
   */
  bgmSrc?: string;
  /** BGM 볼륨 (0~1). 기본 0.35 — 나레이션을 가리면 안 된다. */
  bgmVolume?: number;
  /** 채널 이름. 있으면 인트로에 워드마크가 뜨고 끝에 로고 아웃트로가 붙는다. */
  brand?: string;
  /**
   * 채널 로고 이미지 (remotion/public 기준 상대 경로). 아웃트로에서 원형으로
   * 잘라 보여준다. 플랫폼 종속 정보(핸들 등)는 넣지 않는다 — 같은 영상이
   * 유튜브와 인스타에 함께 나간다.
   */
  brandLogo?: string;
  /** Watermark / outro tagline (channel config `tagline`). */
  brandTagline?: string;
  /** 좌상단 워터마크 표시 여부. 기본 true — brandTagline 이 있어도 끌 수 있다. */
  showWatermark?: boolean;
  /** 아웃트로에 태그라인 줄 표시 여부. 기본 true. */
  outroTagline?: boolean;
  /** 아웃트로 배경 이미지 (remotion/public 기준 상대 경로). 없으면 테마 그라디언트. */
  outroBg?: string;
  /**
   * 서비스 워터마크 ("made with Autopilot"). SaaS 무료 플랜 렌더에 붙는다 —
   * 구독 중이거나 제거 크레딧을 쓴 잡은 false. 운영자 자체 채널 렌더와 무관.
   */
  serviceWatermark?: boolean;
};

export const COMPOSITION_ID = 'InfoShort';

/** 브랜드 아웃트로 길이. Root 의 duration 계산과 컴포지션 배치가 같은 값을 쓴다. */
export const OUTRO_FRAMES = 66; // 2.2초 @ 30fps

/* ─── 주간 결산 롱폼 (가로 1920×1080) ────────────────────────────── */

export type WeeklyChapter = {
  /** 챕터 카드에 뜨는 이슈 제목. */
  title: string;
  /** 그 이슈의 데일리 잡에서 재사용하는 풍자 배경. remotion/public 기준. */
  backgroundImage?: string;
  scenes: ShortScene[];
};

export type WeeklyProps = {
  /** 후킹형 제목. 오프닝 카드와 유튜브 제목에 쓰인다. */
  title: string;
  /** 주간 라벨. 예: "8월 2주차 주간 브리핑" */
  weekLabel: string;
  /** 오프닝 나레이션 — 타이틀 카드가 떠 있는 동안 흐른다. */
  opening: ShortScene[];
  chapters: WeeklyChapter[];
  /** 클로징 나레이션 — 아웃트로 직전. */
  closing: ShortScene[];
  theme: Theme;
  bgmSrc?: string;
  bgmVolume?: number;
  brand?: string;
  brandLogo?: string;
};

export const WEEKLY_COMPOSITION_ID = 'WeeklyRecap';

/** 챕터 타이틀 카드 길이. */
export const CHAPTER_CARD_FRAMES = 66; // 2.2초 @ 30fps

/** 주간 결산 총 길이. Root 와 렌더러가 같은 계산을 써야 한다. */
export function weeklyDurationInFrames(props: WeeklyProps): number {
  const scenesSum = (scenes: ShortScene[]) =>
    scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  return Math.max(
    scenesSum(props.opening) +
      props.chapters.reduce((sum, c) => sum + CHAPTER_CARD_FRAMES + scenesSum(c.scenes), 0) +
      scenesSum(props.closing) +
      (props.brand ? OUTRO_FRAMES : 0),
    1,
  );
}


/** 채널 설정에 theme 이 없을 때의 기본값. 정보형(비정치) 잡에도 쓰인다. */
export const DEFAULT_THEME: Theme = {
  fontStack: "'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif",
  bg: '#0B1020',
  fg: '#F8FAFC',
  accent: '#7DD3FC',
  layout: 'center',
  background: 'gradient',
  captionStyle: 'plain',
  titleChip: true,
  progress: 'bar',
  hook: 'fullscreen',
  captionSize: 96,
  captionWeight: 800,
};

export const defaultShortProps: ShortProps = {
  title: 'Why EV batteries shrink in winter',
  hook: 'Why half the range, in winter?',
  theme: DEFAULT_THEME,
  scenes: [
    { caption: 'Winter range drops hard', durationInFrames: 60 },
    { caption: 'The battery is not wearing out', emphasis: 'not', durationInFrames: 60 },
    { caption: 'Lithium ions just slow down', emphasis: 'slow down', durationInFrames: 70 },
    { caption: 'Warm it up, range comes back', durationInFrames: 70 },
  ],
};

export const defaultWeeklyProps: WeeklyProps = {
  title: 'This week, five things worth knowing',
  weekLabel: 'Weekly Briefing',
  theme: DEFAULT_THEME,
  opening: [{ caption: 'The week, in five stories', durationInFrames: 90 }],
  chapters: [
    {
      title: 'The first story',
      scenes: [{ caption: 'What happened', durationInFrames: 90 }],
    },
  ],
  closing: [{ caption: 'Back next Sunday', durationInFrames: 90 }],
};
