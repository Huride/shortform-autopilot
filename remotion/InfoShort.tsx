import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { OUTRO_FRAMES, type SceneVisual, type ShortProps, type ShortScene, type Theme } from './schema';

// 후킹이 조각 문구가 아니라 질문형 주제 문장(10~18자)이라 읽을 시간을 더 준다.
const HOOK_FRAMES = 26; // ~0.87초 — 전면 카드는 순간 치고 빠진다

/**
 * 생성 배경 이미지. 느린 켄번스 + 어둡게 덮기.
 *
 * sceneBounds: 장면 경계마다 살짝 펀치 줌을 넣어 시선을 리셋한다.
 * 유지율 곡선이 완만하게 흘러내리는 원인이 "화면이 안 바뀐다"였다 —
 * 컷 감각을 만들어 매 장면을 새 장면처럼 보이게 한다.
 *
 * 스크림이 세 겹인 이유: 이미지가 밝게 나와도 자막이 읽혀야 한다.
 * 생성 이미지는 밝기를 통제할 수 없어서 렌더 쪽에서 보장한다.
 */
const PhotoBackdrop: React.FC<{ src: string; theme: Theme; sceneBounds: number[] }> = ({
  src,
  theme,
  sceneBounds,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t = frame / Math.max(durationInFrames - 1, 1);

  // 현재 장면 시작 이후 경과 프레임 → 컷 순간 1.05 로 튀었다가 0.4초에 걸쳐 복귀
  const sceneStart = [0, ...sceneBounds].filter((b) => b <= frame).pop() ?? 0;
  // 씬 컷마다 주던 펀치줌은 배경이 깜빡이는 느낌을 만들어 제거했다 —
  // 배경은 느린 드리프트만, 리듬은 카드·자막이 만든다.
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{ transform: `scale(${1.08 + t * 0.06}) translateY(${-t * 16}px)` }}
      >
        <Img
          src={staticFile(src)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* 1) 전체 톤 다운 — 이미지가 보여야 하므로 가볍게만 */}
      <AbsoluteFill style={{ backgroundColor: `${theme.bg}4D` }} />
      {/* 2) 자막이 앉는 하단만 눌러준다. 상단 60% 는 이미지를 그대로 보여준다. */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, transparent 0%, transparent 42%, ${theme.bg}8C 68%, ${theme.bg}E6 100%)`,
        }}
      />
      {/* 3) 채널 색을 얹어 이미지가 달라져도 채널 톤은 유지되게 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(110% 70% at 50% 8%, ${theme.accent}1F 0%, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ─── 배경 ────────────────────────────────────────────────────────── */

const Backdrop: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / Math.max(durationInFrames, 1);

  if (theme.background === 'split') {
    // 대각선 하드 스플릿 — 천천히 밀린다.
    const shift = interpolate(t, [0, 1], [0, 8]);
    return (
      <AbsoluteFill style={{ backgroundColor: theme.bg }}>
        <AbsoluteFill
          style={{
            background: `linear-gradient(${118 + shift}deg, ${theme.accent}1F 0%, ${theme.accent}1F 38%, transparent 38.4%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `linear-gradient(${118 + shift}deg, transparent 61%, ${theme.fg}0A 61.4%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (theme.background === 'grid') {
    const offset = interpolate(t, [0, 1], [0, 60]);
    return (
      <AbsoluteFill style={{ backgroundColor: theme.bg }}>
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${theme.fg}0D 1px, transparent 1px), linear-gradient(90deg, ${theme.fg}0D 1px, transparent 1px)`,
            backgroundSize: '120px 120px',
            backgroundPosition: `0 ${offset}px`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(90% 60% at 50% 40%, ${theme.accent}26 0%, transparent 70%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at ${20 + t * 30}% ${15 + t * 20}%, ${theme.accent}33 0%, transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(100% 70% at ${85 - t * 25}% ${88 - t * 18}%, ${theme.fg}14 0%, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ─── 자막 ────────────────────────────────────────────────────────── */

/** 대본이 '\n' 으로 줄바꿈을 직접 지정할 수 있게 한다 — 자동 줄바꿈이 어색한 한국어 구문 대응. */
function br(text: string): React.ReactNode[] {
  return text.split('\n').flatMap((line, i) => (i === 0 ? [line] : [<br key={`b${i}`} />, line]));
}

/** emphasis 는 caption 의 부분 문자열임이 보장된다 (script.ts 의 normalize 가 검증). */
function splitCaption(scene: ShortScene): [string, string, string] {
  const { caption, emphasis } = scene;
  const at = emphasis ? caption.indexOf(emphasis) : -1;
  if (at < 0 || !emphasis) return [caption, '', ''];
  return [caption.slice(0, at), emphasis, caption.slice(at + emphasis.length)];
}

const Caption: React.FC<{ scene: ShortScene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 인포그래픽 카드가 중앙을 차지하는 장면에서는 자막을 하단으로 내린다.
  const lower = theme.layout === 'lower' || Boolean(scene.visual);

  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const slide = interpolate(enter, [0, 1], [lower ? -44 : 40, 0]);
  const [before, mid, after] = splitCaption(scene);

  // 채널별 강조 연출 — 색만 다른 게 아니라 크기·기울기·구조가 달라야 포맷이 구분된다.
  // 강조어는 중간에서 줄바꿈되지 않는다 (nowrap) — 어색한 분절 방지.
  const mode = theme.emphasisStyle ?? (theme.captionStyle === 'block' ? 'box' : 'color');
  const EMPHASIS: Record<NonNullable<Theme['emphasisStyle']>, React.CSSProperties> = {
    // 서사형 — 크기만 살짝 키운 액센트 색. 가장 절제된 형태.
    color: { color: theme.accent, fontSize: '1.14em' },
    // 라벨형 — 기울어진 스티커처럼 붙는 배경 블록.
    box: {
      backgroundColor: theme.accent,
      color: theme.bg,
      padding: '0.02em 0.18em',
      borderRadius: 8,
      display: 'inline-block',
      transform: 'rotate(-2.2deg)',
      margin: '0 0.08em',
    },
    // 밑줄형 — 본문과 같은 크기, 두꺼운 액센트 밑줄만. 브리핑의 담백함.
    underline: {
      color: theme.fg,
      textDecorationLine: 'underline',
      textDecorationColor: theme.accent,
      textDecorationThickness: '0.14em',
      textUnderlineOffset: '0.16em',
    },
    // 네온형 — 숫자가 훨씬 크게, 발광하며 튀어나온다.
    glow: {
      color: theme.accent,
      textShadow: `0 0 20px ${theme.accent}B3, 0 0 60px ${theme.accent}66`,
      fontSize: '1.4em',
      display: 'inline-block',
      lineHeight: 1,
      verticalAlign: 'baseline',
    },
    // 도장형 — 반대로 기울어 찍힌 판정 스탬프.
    chip: {
      color: theme.accent,
      border: `4px solid ${theme.accent}`,
      borderRadius: 12,
      padding: '0.02em 0.18em',
      display: 'inline-block',
      transform: 'rotate(2.4deg)',
      margin: '0 0.08em',
      boxShadow: `0 6px 24px ${theme.bg}99`,
    },
  };
  const emphasisStyle: React.CSSProperties = { whiteSpace: 'nowrap', ...EMPHASIS[mode] };

  return (
    <AbsoluteFill
      style={{
        justifyContent: lower ? 'flex-end' : 'center',
        alignItems: lower ? 'flex-start' : 'center',
        padding: lower ? '0 80px 340px' : '0 90px',
        opacity: enter,
        transform: `translateX(${lower ? slide : 0}px) translateY(${lower ? 0 : slide}px)`,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: theme.captionSize,
          fontWeight: theme.captionWeight,
          lineHeight: theme.captionStyle === 'block' ? 1.5 : 1.32,
          letterSpacing: '-0.02em',
          color: theme.fg,
          textAlign: lower ? 'left' : 'center',
          textWrap: 'balance',
          wordBreak: 'keep-all',
          textShadow: `0 8px 40px ${theme.bg}CC`,
        }}
      >
        {br(before)}
        {mid ? <span style={emphasisStyle}>{mid}</span> : null}
        {br(after)}
      </div>
    </AbsoluteFill>
  );
};

/* ─── 후킹 ────────────────────────────────────────────────────────── */

/**
 * 관통 질문을 쉼표에서 두 줄로 가른다.
 * "사관학교 통합, 이대로 괜찮은가" → ["사관학교 통합,", "이대로 괜찮은가"]
 * 브라우저의 자동 감김은 어절 중간을 자를 수 있어서 명시적으로 가른다.
 */
/** 한글 1.0 / 그 외 0.55 로 치는 시각적 길이. */
function visualLen(t: string): number {
  let n = 0;
  for (const ch of t) n += /[\u3131-\uD79D]/.test(ch) ? 1 : 0.55;
  return n;
}

function splitHookLines(text: string): string[] {
  // 숫자 사이 쉼표("1,380")는 문장 쉼표가 아니다 — 어절 단위로만 줄을 가른다.
  // 각 줄은 시각 길이 ≤8 로 패킹해 화면 안에서 절대 감기지 않게 한다.
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const merged = cur ? `${cur} ${w}` : w;
    if (cur && visualLen(merged) > 8) {
      lines.push(cur);
      cur = w;
    } else {
      cur = merged;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3).length === lines.length ? lines : [...lines.slice(0, 2), lines.slice(2).join(' ')];
}

/**
 * 시작 2초의 타이틀 카드. 스와이프를 멈추는 건 이 화면이다.
 *
 * 정적으로 머물지 않는 것이 원칙이다 (주간판 인트로에서 얻은 교훈):
 * 1) 카드 뒤로 풍자 배경이 비쳐 보인다 — 첫 프레임부터 화면이 살아 있다.
 * 2) 떠 있는 동안에도 타이포가 계속 미세하게 움직인다.
 * 3) 퇴장은 통째 페이드가 아니라 줄별 시차 슬라이드 — 본편으로 "넘어가는" 감각.
 * banner 테마 = 좌측 정렬 블록 타이포 / fullscreen 테마 = 중앙 스케일-인.
 * (두 채널이 같은 도구로 만들어 보이면 안 되므로 형태를 다르게 유지한다.)
 */
/** 문장 경계마다 중앙 카드를 살짝 킥 — 말이 다음 문장으로 넘어갔음을 화면이 보여준다. */
const SentenceKick: React.FC<{ kicks: number[]; theme: Theme; children: React.ReactNode }> = ({
  kicks,
  theme,
  children,
}) => {
  const frame = useCurrentFrame();
  let pulse = 0;
  for (const k of kicks) {
    if (frame >= k && frame < k + 14) {
      const t = (frame - k) / 14;
      pulse = Math.max(pulse, Math.sin(Math.PI * t));
    }
  }
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${1 + pulse * 0.045})`,
        filter: pulse > 0.01 ? `drop-shadow(0 0 ${28 * pulse}px ${theme.accent}AA)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ text: string; brand?: string; logo?: string; theme: Theme }> = ({
  text,
  brand,
  logo,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const exit = interpolate(frame, [HOOK_FRAMES - 7, HOOK_FRAMES - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 줄별 퇴장 오프셋 — i번째 줄이 2프레임씩 먼저 왼쪽으로 빠진다.
  const lineExit = (i: number): number =>
    interpolate(frame, [HOOK_FRAMES - 8 + i * 2, HOOK_FRAMES - 2 + i * 2], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(Easing.cubic),
    });
  // 진입 순간 accent 대각 플래시가 화면을 한 번 훑는다.
  const flash = interpolate(frame, [0, 12], [-130, 130], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const underline = interpolate(frame, [8, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // 머무는 동안의 미세 드리프트 — 멈춘 화면은 2초도 길게 느껴진다.
  const drift = frame / fps; // 초 단위
  const breathe = 1 + 0.012 * Math.sin(drift * Math.PI * 1.6);

  // 쉼표에서 명시적으로 두 줄을 가른다 — 자동 감김은 어절 중간을 자른다.
  const lines = splitHookLines(text);

  const brandMark = brand ? (
    <div
      style={{
        position: 'absolute',
        top: 160,
        left: theme.hook === 'banner' ? 84 : 0,
        right: theme.hook === 'banner' ? undefined : 0,
        textAlign: theme.hook === 'banner' ? 'left' : 'center',
        fontFamily: theme.fontStack,
        fontSize: 38,
        fontWeight: 700,
        color: `${theme.fg}CC`,
        letterSpacing: '0.22em',
        opacity:
          exit *
          interpolate(frame, [4, 14], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
      }}
    >
      {logo ? (
        <Img src={staticFile(logo)} style={{ width: 46, height: 46, verticalAlign: '-8px', marginRight: 14, display: 'inline-block' }} />
      ) : (
        <span style={{ color: theme.accent }}>● </span>
      )}{brand}
    </div>
  ) : null;

  // 배경이 비치게 반투명 + 하단으로 갈수록 어두운 그라데이션으로 가독성 확보.
  const scrim = (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${theme.bg}A6 0%, ${theme.bg}CC 45%, ${theme.bg}E6 100%)`,
        opacity: exit,
      }}
    />
  );

  if (theme.hook === 'banner') {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 84px' }}>
        {scrim}
        <AbsoluteFill
          style={{
            background: `linear-gradient(115deg, transparent 40%, ${theme.accent} 50%, transparent 60%)`,
            transform: `translateX(${flash}%)`,
            opacity: 0.9,
          }}
        />
        {brandMark}
        <div style={{ transform: `scale(${breathe})`, transformOrigin: 'left center' }}>
          {lines.map((line, i) => {
            const s = spring({
              frame: frame - 2 - i * 4,
              fps,
              config: { damping: 13, mass: 0.6 },
            });
            const out = lineExit(i);
            // 마지막 줄(질문)이 accent 블록으로 박힌다 — 이 채널의 "찌르는" 자막과 같은 문법.
            const punchLine = i === lines.length - 1;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  marginTop: i === 0 ? 0 : 20,
                  transform: `translateX(${interpolate(s, [0, 1], [-170, 0]) - out * 220}px)`,
                  opacity: s * (1 - out),
                }}
              >
                <div
                  style={{
                    fontFamily: theme.fontStack,
                    fontSize: Math.min(106, Math.floor(880 / Math.max(...lines.map(visualLen)))),
                    fontWeight: 900,
                    lineHeight: 1.18,
                    letterSpacing: '-0.03em',
                    whiteSpace: 'nowrap',
                    ...(punchLine
                      ? {
                          backgroundColor: theme.accent,
                          color: theme.bg,
                          padding: '8px 30px',
                          boxShadow: `0 18px 70px ${theme.accent}59`,
                        }
                      : {
                          color: theme.fg,
                          padding: '8px 0',
                          textShadow: `0 8px 40px ${theme.bg}`,
                        }),
                  }}
                >
                  {line}
                </div>
              </div>
            );
          })}
          <div
            style={{
              height: 12,
              width: 560 * underline * (1 - lineExit(lines.length)),
              backgroundColor: theme.accent,
              marginTop: 38,
            }}
          />
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      {scrim}
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent 40%, ${theme.accent} 50%, transparent 60%)`,
          transform: `translateX(${flash}%)`,
          opacity: 0.9,
        }}
      />
      {brandMark}
      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: 112,
          fontWeight: 900,
          lineHeight: 1.28,
          letterSpacing: '-0.03em',
          color: theme.accent,
          textAlign: 'center',
          wordBreak: 'keep-all',
          padding: '0 80px',
          opacity: exit,
          transform: `scale(${
            interpolate(spring({ frame, fps, config: { damping: 13, mass: 0.6 } }), [0, 1], [1.25, 1]) *
            breathe *
            (1 + (1 - exit) * 0.06)
          })`,
          textShadow: `0 8px 50px ${theme.bg}`,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div
          style={{
            height: 12,
            width: 460 * underline,
            backgroundColor: theme.accent,
            margin: '36px auto 0',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/* ─── 인포그래픽 카드 ─────────────────────────────────────────────── */

/**
 * 숫자 카운트업 — "117곳" 이면 0→117 을 0.7초에 세고 접미는 그대로 붙인다.
 * 숫자로 시작하지 않는 값("절반" 등)은 그대로 보여준다.
 */
const CountUp: React.FC<{ value: string }> = ({ value }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = value.match(/^(\d{1,6})([\s\S]*)$/);
  if (!m) return <>{value}</>;
  const target = Number(m[1] ?? 0);
  const rest = m[2] ?? '';
  const n = Math.round(
    interpolate(frame, [0, fps * 0.7], [0, target], {
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  return (
    <>
      {n}
      {rest}
    </>
  );
};

/**
 * 장면 중앙의 시각 카드. 나레이션만 흐르는 구간의 단조로움을 깬다.
 * 데이터는 대본 생성기가 사실 목록에서 뽑으므로 화면의 숫자도 fact-lock 안이다.
 *
 * 카드가 뜨는 동안 가장자리를 어둡게 눌러(비네트) 시선을 카드로 몬다 —
 * 카드 자체를 키우는 것보다 주변을 죽이는 쪽이 "강하게" 보인다.
 */
const VisualCard: React.FC<{ visual: SceneVisual; theme: Theme }> = ({ visual, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  // 등장 후에도 멈추지 않는다 — 정지한 카드는 3초만 지나도 정적으로 읽힌다.
  const breathe = 1 + 0.014 * Math.sin((frame / fps) * Math.PI * 1.4);
  const sweep = interpolate(frame, [fps * 0.2, fps * 0.7], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const vignette = (
    <AbsoluteFill
      style={{
        background: `radial-gradient(72% 50% at 50% 42%, transparent 40%, ${theme.bg}73 100%)`,
        opacity: enter,
      }}
    />
  );

  // 카드가 "무엇의" 정보인지 먼저 박는 상단 칩 — 장면 주제와 카드를 잇는 라벨.
  const kicker = (text: string): React.ReactNode => (
    <div
      style={{
        display: 'inline-block',
        backgroundColor: theme.accent,
        color: theme.bg,
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: '-0.01em',
        padding: '12px 30px',
        borderRadius: 999,
        marginBottom: 30,
        wordBreak: 'keep-all',
        transform: `translateY(${interpolate(enter, [0, 1], [-24, 0])}px)`,
      }}
    >
      {br(text)}
    </div>
  );

  const base: React.CSSProperties = {
    fontFamily: theme.fontStack,
    transform: `scale(${interpolate(enter, [0, 1], [0.72, 1]) * breathe})`,
    opacity: enter,
  };

  if (visual.kind === 'chart') {
    const pts = visual.points.length >= 2 ? visual.points : [0, 0];
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const W = 640;
    const H = 240;
    const n = pts.length;
    // 스윕 진행에 맞춰 선이 그려진다
    const upto = Math.max(2, Math.ceil((sweep / 100) * n));
    const path = pts.slice(0, upto)
      .map((v, i) => `${(i / (n - 1)) * W},${H - ((v - min) / span) * H}`)
      .join(' ');
    const lineColor = visual.up ? '#FF5A4E' : '#4E8CFF'; // 한국 시장 관례: 상승 빨강 / 하락 파랑
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {vignette}
        <div
          style={{
            transform: `scale(${interpolate(enter, [0, 1], [0.86, 1]) * breathe})`,
            opacity: enter,
            background: `${theme.bg}E6`,
            border: `1px solid ${theme.accent}55`,
            borderRadius: 28,
            padding: '44px 52px 38px',
            width: 780,
          }}
        >
          {kicker(visual.label)}
          <div
            style={{
              fontFamily: theme.fontStack,
              fontSize: 92,
              fontWeight: 900,
              color: lineColor,
              letterSpacing: '-0.02em',
              marginBottom: 22,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {visual.value}
          </div>
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <polyline
              points={path}
              fill="none"
              stroke={lineColor}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {upto >= n ? (
              <circle
                cx={W}
                cy={H - ((pts[n - 1]! - min) / span) * H}
                r={11}
                fill={lineColor}
              />
            ) : null}
          </svg>
        </div>
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'logo') {
    const pctColor = visual.up ? '#FF5A4E' : '#4E8CFF';
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {vignette}
        <div
          style={{
            transform: `scale(${interpolate(enter, [0, 1], [0.86, 1]) * breathe})`,
            opacity: enter,
            display: 'flex',
            alignItems: 'center',
            gap: 40,
            background: `${theme.bg}E6`,
            border: `1px solid ${theme.accent}55`,
            borderRadius: 28,
            padding: '40px 56px',
          }}
        >
          <div
            style={{
              width: 170,
              height: 170,
              borderRadius: 32,
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flex: 'none',
            }}
          >
            <Img src={staticFile(visual.src)} style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontFamily: theme.fontStack, fontSize: 54, fontWeight: 800, color: theme.fg }}>
              {visual.name}
            </div>
            <div
              style={{
                fontFamily: theme.fontStack,
                fontSize: 96,
                fontWeight: 900,
                color: pctColor,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              {visual.value}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'logos') {
    // 한 장면이 여러 종목을 언급할 때 — 언급된 전 종목을 같은 크기로 보여줘
    // 특정 종목만 띄우는 데서 오는 "추천" 오해를 없앤다.
    const cols = visual.items.length <= 2 ? 1 : 2;
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {vignette}
        <div
          style={{
            transform: `scale(${interpolate(enter, [0, 1], [0.86, 1]) * breathe})`,
            opacity: enter,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 22,
            background: `${theme.bg}E6`,
            border: `1px solid ${theme.accent}55`,
            borderRadius: 28,
            padding: '36px 44px',
          }}
        >
          {visual.items.map((it, n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div
                style={{
                  width: 96, height: 96, borderRadius: 22, background: '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flex: 'none',
                }}
              >
                <Img src={staticFile(it.src)} style={{ width: '76%', height: '76%', objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontFamily: theme.fontStack, fontSize: 38, fontWeight: 800, color: theme.fg }}>
                  {it.name}
                </div>
                <div
                  style={{
                    fontFamily: theme.fontStack, fontSize: 56, fontWeight: 900,
                    color: it.up === undefined ? `${theme.fg}99` : it.up ? '#FF5A4E' : '#4E8CFF',
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                  }}
                >
                  {it.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'stat') {
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 240 }}>
        {vignette}
        <div style={{ ...base, textAlign: 'center', position: 'relative', padding: '46px 76px' }}>
          {/* 코너 브래킷 — 숫자를 조준선처럼 감싸 "여길 봐라"를 만든다 */}
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <div
              key={c}
              style={{
                position: 'absolute',
                width: 58,
                height: 58,
                ...(c[0] === 't' ? { top: 0, borderTop: `8px solid ${theme.accent}` } : { bottom: 0, borderBottom: `8px solid ${theme.accent}` }),
                ...(c[1] === 'l' ? { left: 0, borderLeft: `8px solid ${theme.accent}` } : { right: 0, borderRight: `8px solid ${theme.accent}` }),
                opacity: enter,
              }}
            />
          ))}
          {kicker(visual.label)}
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              color: theme.fg,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              textShadow: `0 10px 50px ${theme.bg}E6, 0 0 90px ${theme.accent}59`,
            }}
          >
            <CountUp value={visual.value} />
          </div>
          <div
            style={{
              height: 16,
              width: `${sweep}%`,
              backgroundColor: theme.accent,
              margin: '20px auto 0',
              maxWidth: 480,
            }}
          />
          {visual.sub ? (
            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: `${theme.fg}D9`,
                marginTop: 26,
                wordBreak: 'keep-all',
                opacity: interpolate(frame, [fps * 0.4, fps * 0.7], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              {visual.sub}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'keyword') {
    // 강조어 스탬프 — 도장 찍히듯 크게 박힌다. 논평 장면의 중앙을 채우는 기본기.
    const stamp = spring({ frame, fps, config: { damping: 11, mass: 0.5 } });
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 240 }}>
        {vignette}
        <div
          style={{
            position: 'relative',
            transform: `scale(${interpolate(stamp, [0, 1], [1.7, 1]) * breathe}) rotate(${interpolate(stamp, [0, 1], [-6, -2]) + 0.5 * Math.sin((frame / fps) * 2.2)}deg)`,
            opacity: stamp,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '20%',
              bottom: '12%',
              left: '-5%',
              right: '-5%',
              backgroundColor: theme.accent,
              transform: 'skewX(-8deg)',
              opacity: 0.92,
              boxShadow: `0 20px 80px ${theme.accent}66`,
            }}
          />
          <div
            style={{
              position: 'relative',
              fontFamily: theme.fontStack,
              fontSize: 148,
              fontWeight: 900,
              color: theme.fg,
              letterSpacing: '-0.02em',
              wordBreak: 'keep-all',
              padding: '0 36px',
              textShadow: `0 12px 60px ${theme.bg}CC`,
            }}
          >
            {visual.text}
          </div>
        </div>
        {visual.sub ? (
          // 스탬프만으로 부족한 맥락을 아래 한 줄로 받친다 — 스탬프 등장 후 시차를 두고.
          <div
            style={{
              fontFamily: theme.fontStack,
              fontSize: 46,
              fontWeight: 700,
              color: `${theme.fg}D9`,
              marginTop: 44,
              wordBreak: 'keep-all',
              textShadow: `0 6px 30px ${theme.bg}CC`,
              opacity: interpolate(frame, [fps * 0.35, fps * 0.65], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              transform: `translateY(${interpolate(frame, [fps * 0.35, fps * 0.65], [24, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.out(Easing.cubic),
              })}px)`,
            }}
          >
            {visual.sub}
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'list') {
    // 항목이 하나씩 시차를 두고 흘러들어온다 — 나열 장면의 리듬.
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 240 }}>
        {vignette}
        <div style={{ ...base, width: '100%', maxWidth: 920, padding: '0 70px' }}>
          {kicker(visual.title)}
          <div
            style={{
              backgroundColor: `${theme.bg}D9`,
              border: `2px solid ${theme.fg}1F`,
              borderRadius: 24,
              padding: '40px 48px',
              boxShadow: `0 24px 80px ${theme.bg}B3`,
            }}
          >
            {visual.items.map((item, i) => {
              const s = spring({
                frame: frame - fps * 0.3 * (i + 1),
                fps,
                config: { damping: 14, mass: 0.6 },
              });
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 24,
                    alignItems: 'baseline',
                    marginTop: i === 0 ? 0 : 28,
                    opacity: s,
                    transform: `translateX(${interpolate(s, [0, 1], [70, 0])}px)`,
                  }}
                >
                  <div style={{ color: theme.accent, fontSize: 46, fontWeight: 900 }}>▸</div>
                  <div
                    style={{
                      fontSize: 54,
                      fontWeight: 700,
                      color: theme.fg,
                      wordBreak: 'keep-all',
                      lineHeight: 1.3,
                    }}
                  >
                    {item}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'quote') {
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 240 }}>
        {vignette}
        <div style={{ ...base, maxWidth: 900, padding: '0 60px' }}>
          <div
            style={{
              position: 'relative',
              backgroundColor: `${theme.bg}D9`,
              border: `2px solid ${theme.fg}1F`,
              borderLeft: `14px solid ${theme.accent}`,
              borderRadius: 24,
              padding: '58px 54px 44px',
              boxShadow: `0 24px 80px ${theme.bg}B3`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -46,
                left: 34,
                fontSize: 150,
                fontWeight: 900,
                color: theme.accent,
                lineHeight: 1,
              }}
            >
              “
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: theme.fg,
                lineHeight: 1.42,
                wordBreak: 'keep-all',
              }}
            >
              {visual.text}
            </div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 700,
                color: `${theme.fg}99`,
                marginTop: 30,
                textAlign: 'right',
              }}
            >
              — {visual.attribution}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // contrast — 좌우 대립 구도. 오른쪽이 채널이 강조하는 쪽이다.
  const slide = interpolate(enter, [0, 1], [110, 0]);
  const cell = (label: string, value: string, dx: number, highlight: boolean): React.ReactNode => (
    <div
      style={{
        flex: 1,
        transform: `translateX(${dx}px)`,
        backgroundColor: highlight ? theme.accent : `${theme.bg}D9`,
        border: highlight ? 'none' : `2px solid ${theme.fg}26`,
        borderRadius: 22,
        padding: '44px 24px',
        textAlign: 'center',
        boxShadow: highlight ? `0 18px 70px ${theme.accent}59` : `0 18px 70px ${theme.bg}99`,
      }}
    >
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          color: highlight ? `${theme.bg}CC` : `${theme.fg}99`,
          marginBottom: 16,
          wordBreak: 'keep-all',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: value.length > 7 ? 52 : 68,
          fontWeight: 900,
          color: highlight ? theme.bg : theme.fg,
          lineHeight: 1.18,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );

  // 값이 길면 좌우가 아니라 위아래로 — 좁은 칸에서 오른쪽이 잘리는 것 방지.
  const contrastVertical =
    Math.max(visual.leftValue.length, visual.rightValue.length) > 7 ||
    Math.max(visual.leftLabel.length, visual.rightLabel.length) > 6;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 240 }}>
      {vignette}
      <div
        style={{
          ...base,
          display: 'flex',
          flexDirection: contrastVertical ? 'column' : 'row',
          gap: 24,
          width: '100%',
          maxWidth: 960,
          padding: '0 50px',
          alignItems: contrastVertical ? 'stretch' : 'center',
        }}
      >
        {cell(visual.leftLabel, visual.leftValue, -slide, false)}
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 40,
            fontWeight: 900,
            color: theme.fg,
            backgroundColor: `${theme.bg}E6`,
            border: `3px solid ${theme.accent}`,
            borderRadius: 999,
            width: 108,
            height: 108,
            alignSelf: 'center',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transform: `scale(${interpolate(enter, [0, 1], [0, 1])})`,
          }}
        >
          VS
        </div>
        {cell(visual.rightLabel, visual.rightValue, slide, true)}
      </div>
    </AbsoluteFill>
  );
};

/* ─── 상시 타이틀 ─────────────────────────────────────────────────── */

/** 관통 질문. 후킹 카드가 사라진 뒤 모든 장면 상단에 남는다. */
const TitleChip: React.FC<{ text: string; theme: Theme }> = ({ text, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });

  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 110, opacity: enter }}>
      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: 44,
          fontWeight: 700,
          lineHeight: 1.35,
          color: theme.fg,
          letterSpacing: '-0.01em',
          padding: '18px 42px',
          borderRadius: 18,
          border: `1px solid ${theme.fg}22`,
          backgroundColor: `${theme.bg}D9`,
          maxWidth: 900,
          textAlign: 'center',
          textWrap: 'balance',
          wordBreak: 'keep-all',
        }}
      >
        {br(text)}
      </div>
    </AbsoluteFill>
  );
};

/* ─── 아웃트로 ────────────────────────────────────────────────────── */

/**
 * 로고 아웃트로. 나레이션이 끝난 뒤 훅 꺼지지 않고 채널 워드마크로 닫는다 —
 * 마지막 화면은 시청자가 채널명을 기억하는 유일한 순간이다.
 */
const Outro: React.FC<{ brand: string; logo?: string; tagline?: string; theme: Theme; bg?: string }> = ({
  brand,
  logo,
  tagline,
  theme,
  bg,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bgIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const enter = spring({ frame: frame - 4, fps, config: { damping: 12, mass: 0.7 } });
  const underline = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.bg,
        opacity: bgIn,
      }}
    >
      {bg ? (
        // 지정 배경 위에 브랜드 텍스트가 얹히므로 테마색 스크림으로 가독성을 확보한다.
        <AbsoluteFill>
          <Img
            src={staticFile(bg)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <AbsoluteFill style={{ backgroundColor: `${theme.bg}B8` }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(80% 55% at 50% 45%, ${theme.accent}26 0%, transparent 65%)`,
        }}
      />
      <div
        style={{
          textAlign: 'center',
          transform: `scale(${interpolate(enter, [0, 1], [0.8, 1])})`,
          opacity: enter,
        }}
      >
        {logo ? (
          // 채널 로고 — 원형 크롭 + accent 링. 프로필 사진과 같은 형태라 채널 인지가 이어진다.
          <div
            style={{
              width: 340,
              height: 340,
              borderRadius: '50%',
              overflow: 'hidden',
              border: `8px solid ${theme.accent}`,
              margin: '0 auto 44px',
              boxShadow: `0 30px 110px ${theme.bg}, 0 0 90px ${theme.accent}40`,
            }}
          >
            <Img
              src={staticFile(logo)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : null}
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: logo ? 96 : 124,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: theme.fg,
          }}
        >
          {logo ? brand : (
            <>
              {logo ? (
        <Img src={staticFile(logo)} style={{ width: 46, height: 46, verticalAlign: '-8px', marginRight: 14, display: 'inline-block' }} />
      ) : (
        <span style={{ color: theme.accent }}>● </span>
      )}{brand}
            </>
          )}
        </div>
        {tagline ? (
          <div
            style={{
              fontFamily: theme.fontStack,
              fontSize: 44,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: theme.fg,
              opacity: 0.72 * enter,
              marginTop: 22,
            }}
          >
            {tagline}
          </div>
        ) : null}
        <div
          style={{
            height: 10,
            width: 420 * underline,
            backgroundColor: theme.accent,
            margin: '28px auto 0',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/* ─── 진행 표시 ───────────────────────────────────────────────────── */

const Progress: React.FC<{ theme: Theme; sceneCount: number; bounds: number[] }> = ({
  theme,
  sceneCount,
  bounds,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (theme.progress === 'none') return null;

  if (theme.progress === 'dots') {
    const active = bounds.findIndex((end) => frame < end);
    return (
      <AbsoluteFill
        style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 96 }}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          {Array.from({ length: sceneCount }, (_, i) => (
            <div
              key={i}
              style={{
                width: i === active ? 44 : 14,
                height: 14,
                borderRadius: 999,
                backgroundColor: i === active ? theme.accent : `${theme.fg}33`,
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  const pct = (frame / Math.max(durationInFrames - 1, 1)) * 100;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div style={{ height: 10, backgroundColor: `${theme.fg}24` }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: theme.accent }} />
      </div>
    </AbsoluteFill>
  );
};

/* ─── 컴포지션 ────────────────────────────────────────────────────── */

/** BGM — 루프 재생, 마지막 1초 페이드아웃. */
const Bgm: React.FC<{ src: string; volume: number }> = ({ src, volume }) => {
  const { durationInFrames, fps } = useVideoConfig();
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(f) =>
        volume *
        interpolate(f, [durationInFrames - fps, durationInFrames - 1], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};

export const InfoShort: React.FC<ShortProps> = ({
  title,
  hook,
  scenes,
  theme,
  backgroundImage,
  bgmSrc,
  bgmVolume = 0.35,
  brand,
  brandLogo,
  brandTagline,
  showWatermark = true,
  outroTagline = true,
  outroBg,
}) => {
  // Corner watermark with the tagline — stays through body scenes, builds the
  // channel's positioning line by repetition.
  const taglineMark = brandTagline && showWatermark ? (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 42,
          left: 48,
          fontFamily: theme.fontStack,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: theme.fg,
          opacity: 0.55,
        }}
      >
        <span style={{ color: theme.accent }}>●</span> {brandTagline}
      </div>
    </AbsoluteFill>
  ) : null;

  // 장면 경계 프레임 — Sequence 배치와 진행 표시가 같은 값을 쓴다.
  const bounds: number[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    cursor += scene.durationInFrames;
    bounds.push(cursor);
  }
  // 장면 총합. 브랜드가 있으면 이 뒤에 아웃트로가 붙는다 (Root 의 duration 계산과 일치).
  const scenesEnd = cursor;
  // 사인오프 장면(outro=true)부터는 자막·카드 대신 브랜드 화면 위에서 나레이션이 흐른다.
  const outroIdx = scenes.findIndex((s) => s.outro);
  const outroFromIdx = scenes.findIndex((s) => s.outroFrom !== undefined);
  const outroStart =
    outroIdx >= 0
      ? bounds[outroIdx]! - scenes[outroIdx]!.durationInFrames
      : outroFromIdx >= 0
        ? bounds[outroFromIdx]! - scenes[outroFromIdx]!.durationInFrames + scenes[outroFromIdx]!.outroFrom!
        : scenesEnd;

  return (
    <AbsoluteFill>
      {backgroundImage ? (
        <PhotoBackdrop src={backgroundImage} theme={theme} sceneBounds={bounds} />
      ) : (
        <Backdrop theme={theme} />
      )}

      {bgmSrc ? <Bgm src={bgmSrc} volume={bgmVolume} /> : null}

      {scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={bounds[i]! - scene.durationInFrames}
          durationInFrames={scene.durationInFrames}
        >
          {scene.bg ? (
            <AbsoluteFill>
              {/*
               * 실사(스톡)도 채널 세계관 안에 앉힌다 — 채도를 누르고 어둡게 한 뒤
               * 채널 배경색을 multiply 로 얹어 어떤 사진이 와도 톤이 통일되게.
               * 이 그레이딩이 없으면 생성 배경과 실사가 딴 영상처럼 보인다.
               */}
              <Img
                src={staticFile(scene.bg)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'saturate(0.8) brightness(0.92) contrast(1.03)',
                }}
              />
              <AbsoluteFill
                style={{ backgroundColor: theme.bg, opacity: 0.16, mixBlendMode: 'multiply' }}
              />
              <AbsoluteFill
                style={{
                  background: `linear-gradient(180deg, ${theme.bg}99 0%, ${theme.bg}55 40%, ${theme.bg}CC 100%)`,
                }}
              />
              <AbsoluteFill
                style={{
                  background: `radial-gradient(110% 70% at 50% 8%, ${theme.accent}12 0%, transparent 60%)`,
                }}
              />
            </AbsoluteFill>
          ) : null}
          {scene.audioSegments?.length ? (
            scene.audioSegments.map((seg, n) => (
              <Sequence key={`a${n}`} from={seg.from}>
                <Audio src={staticFile(seg.src)} />
              </Sequence>
            ))
          ) : scene.audioSrc ? (
            <Audio src={staticFile(scene.audioSrc)} />
          ) : null}
          {scene.outro ? null : scene.visual && scene.visual2 && scene.stackVisuals ? (
            // 동시 배치: 상단 카드(현상)는 유지, 강조 카드(핵심 숫자)는 장면 35% 지점에 아래 크게.
            <>
              <Sequence from={i === 0 ? HOOK_FRAMES : 0}>
                <AbsoluteFill style={{ transform: 'translateY(-430px) scale(0.62)' }}>
                  <VisualCard visual={scene.visual} theme={theme} />
                </AbsoluteFill>
              </Sequence>
              <Sequence
                from={Math.max(Math.floor(scene.durationInFrames * 0.35), (i === 0 ? HOOK_FRAMES : 0) + 18)}
              >
                <AbsoluteFill style={{ transform: 'translateY(150px)' }}>
                  <VisualCard visual={scene.visual2} theme={theme} />
                </AbsoluteFill>
              </Sequence>
            </>
          ) : scene.visual ? (
            // 첫 장면의 비주얼은 후킹 카드에 가려지므로, 카드가 사라진 직후
            // 등장 애니메이션이 보이게 지연시킨다.
            i === 0 ? (
              scene.visual2 ? (
                <>
                  <Sequence
                    from={HOOK_FRAMES}
                    durationInFrames={Math.max(Math.floor((scene.durationInFrames + HOOK_FRAMES) / 2) - HOOK_FRAMES, 15)}
                  >
                    <VisualCard visual={scene.visual} theme={theme} />
                  </Sequence>
                  <Sequence from={Math.max(Math.floor((scene.durationInFrames + HOOK_FRAMES) / 2), HOOK_FRAMES + 15)}>
                    <VisualCard visual={scene.visual2} theme={theme} />
                  </Sequence>
                </>
              ) : (
                <Sequence from={HOOK_FRAMES}>
                  <VisualCard visual={scene.visual} theme={theme} />
                </Sequence>
              )
            ) : scene.visual2 ? (
              // 두 카드를 절반씩 — 말이 지수에서 종목으로 넘어가면 화면도 따라간다.
              <>
                <Sequence durationInFrames={Math.floor(scene.durationInFrames / 2)}>
                  <VisualCard visual={scene.visual} theme={theme} />
                </Sequence>
                <Sequence from={Math.floor(scene.durationInFrames / 2)}>
                  <VisualCard visual={scene.visual2} theme={theme} />
                </Sequence>
              </>
            ) : scene.sentenceKicks?.length ? (
              <SentenceKick kicks={scene.sentenceKicks} theme={theme}>
                <VisualCard visual={scene.visual} theme={theme} />
              </SentenceKick>
            ) : (
              <VisualCard visual={scene.visual} theme={theme} />
            )
          ) : null}
          {scene.outro ? null : <Caption scene={scene} theme={theme} />}
        </Sequence>
      ))}

      {theme.titleChip ? (
        // 관통 질문을 전 장면에 상시 노출한다 — 중간에 들어온 시청자도 주제를 안다.
        // 후킹 카드가 떠 있는 동안은 중복이라 그 뒤부터, 아웃트로 전까지 보여준다.
        <Sequence from={HOOK_FRAMES} durationInFrames={Math.max(outroStart - HOOK_FRAMES, 1)}>
          <TitleChip text={hook} theme={theme} />
        </Sequence>
      ) : null}

      <Progress theme={theme} sceneCount={scenes.length} bounds={bounds} />

      <Sequence durationInFrames={HOOK_FRAMES}>
        <Hook text={hook} brand={brand} logo={brandLogo} theme={theme} />
      </Sequence>

      {taglineMark ? (
        <Sequence from={0} durationInFrames={outroStart}>{taglineMark}</Sequence>
      ) : null}
      {brand ? (
        <Sequence from={outroStart} durationInFrames={scenesEnd - outroStart + OUTRO_FRAMES}>
          <Outro
            brand={brand}
            logo={brandLogo}
            tagline={outroTagline ? brandTagline : undefined}
            theme={theme}
            bg={outroBg}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
