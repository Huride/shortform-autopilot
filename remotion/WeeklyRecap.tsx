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
import {
  CHAPTER_CARD_FRAMES,
  OUTRO_FRAMES,
  type SceneVisual,
  type ShortScene,
  type Theme,
  type WeeklyChapter,
  type WeeklyProps,
} from './schema';

/**
 * 주간 결산 롱폼 (가로 1920×1080).
 *
 * InfoShort 와 디자인 언어(색·폰트·카드 문법)는 같지만 레이아웃 수치가 전부
 * 다르다 — 세로 숏폼의 컴포넌트를 재사용하지 않고 가로 전용으로 다시 잡는다.
 * 구조: 오프닝 카드(나레이션 위) → [챕터 카드 → 장면들] × N → 클로징 → 로고 아웃트로.
 */

/* ─── 배경 ────────────────────────────────────────────────────────── */

/**
 * 챕터 배경 — 데일리 잡의 세로(1024×1536) 풍자 이미지를 가로 캔버스에 cover 로
 * 깐다. 상하가 잘리지만 만평의 중심부가 남고, 자막 가독을 위해 하단을 누른다.
 */
const ChapterBg: React.FC<{ src?: string; theme: Theme; sceneBounds: number[] }> = ({
  src,
  theme,
  sceneBounds,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t = frame / Math.max(durationInFrames - 1, 1);

  const sceneStart = [0, ...sceneBounds].filter((b) => b <= frame).pop() ?? 0;
  const punch = interpolate(frame - sceneStart, [0, fps * 0.4], [0.04, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {src ? (
        <AbsoluteFill style={{ transform: `scale(${1.06 + t * 0.08 + punch})` }}>
          <Img
            src={staticFile(src)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 32%' }}
          />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ backgroundColor: `${theme.bg}66` }} />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${theme.bg}8C 0%, transparent 22%, transparent 55%, ${theme.bg}E6 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ─── 자막 (하단 중앙) ────────────────────────────────────────────── */

function splitCaption(scene: ShortScene): [string, string, string] {
  const { caption, emphasis } = scene;
  const at = emphasis ? caption.indexOf(emphasis) : -1;
  if (at < 0 || !emphasis) return [caption, '', ''];
  return [caption.slice(0, at), emphasis, caption.slice(at + emphasis.length)];
}

const HCaption: React.FC<{ scene: ShortScene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const [before, mid, after] = splitCaption(scene);

  const emphasisStyle: React.CSSProperties =
    theme.captionStyle === 'block'
      ? {
          backgroundColor: theme.accent,
          color: theme.bg,
          padding: '0 0.14em',
          borderRadius: 6,
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }
      : { color: theme.accent };

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 84,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: 66,
          fontWeight: theme.captionWeight,
          lineHeight: 1.45,
          letterSpacing: '-0.02em',
          color: theme.fg,
          textAlign: 'center',
          maxWidth: 1560,
          wordBreak: 'keep-all',
          textShadow: `0 6px 30px ${theme.bg}CC`,
        }}
      >
        {before}
        {mid ? <span style={emphasisStyle}>{mid}</span> : null}
        {after}
      </div>
    </AbsoluteFill>
  );
};

/* ─── 비주얼 (가로 축소판 — InfoShort 와 같은 문법) ───────────────── */

const HCountUp: React.FC<{ value: string }> = ({ value }) => {
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

const HVisual: React.FC<{ visual: SceneVisual; theme: Theme }> = ({ visual, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  // 등장 후에도 멈추지 않는다 — 롱폼은 화면이 오래 머물러 정지가 더 티난다.
  const breathe = 1 + 0.012 * Math.sin((frame / fps) * Math.PI * 1.3);
  const sweep = interpolate(frame, [fps * 0.2, fps * 0.7], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const vignette = (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 62% at 50% 44%, transparent 40%, ${theme.bg}73 100%)`,
        opacity: enter,
      }}
    />
  );

  const kicker = (text: string): React.ReactNode => (
    <div
      style={{
        display: 'inline-block',
        backgroundColor: theme.accent,
        color: theme.bg,
        fontSize: 38,
        fontWeight: 800,
        padding: '12px 32px',
        borderRadius: 999,
        marginBottom: 28,
        wordBreak: 'keep-all',
      }}
    >
      {text}
    </div>
  );

  const base: React.CSSProperties = {
    fontFamily: theme.fontStack,
    transform: `scale(${interpolate(enter, [0, 1], [0.76, 1]) * breathe})`,
    opacity: enter,
  };

  const shell: React.CSSProperties = {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 170,
  };

  // chart/logo 는 숏폼 전용 — 주간 결산에서는 스킵 (스크립트 생성이 안 만들기도 함)
  if (visual.kind === 'chart' || visual.kind === 'logo' || visual.kind === 'logos') return null;

  if (visual.kind === 'stat') {
    return (
      <AbsoluteFill style={shell}>
        {vignette}
        <div style={{ ...base, textAlign: 'center', position: 'relative', padding: '50px 84px' }}>
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
              fontSize: 200,
              fontWeight: 900,
              color: theme.fg,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              textShadow: `0 8px 40px ${theme.bg}E6, 0 0 70px ${theme.accent}59`,
            }}
          >
            <HCountUp value={visual.value} />
          </div>
          <div
            style={{
              height: 15,
              width: `${sweep}%`,
              backgroundColor: theme.accent,
              margin: '20px auto 0',
              maxWidth: 500,
            }}
          />
          {visual.sub ? (
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: `${theme.fg}D9`,
                marginTop: 24,
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
    const stamp = spring({ frame, fps, config: { damping: 11, mass: 0.5 } });
    return (
      <AbsoluteFill style={shell}>
        {vignette}
        <div
          style={{
            position: 'relative',
            transform: `scale(${interpolate(stamp, [0, 1], [1.6, 1]) * breathe}) rotate(${interpolate(stamp, [0, 1], [-5, -2]) + 0.5 * Math.sin((frame / fps) * 2.2)}deg)`,
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
              boxShadow: `0 16px 60px ${theme.accent}66`,
            }}
          />
          <div
            style={{
              position: 'relative',
              fontFamily: theme.fontStack,
              fontSize: 160,
              fontWeight: 900,
              color: theme.fg,
              letterSpacing: '-0.02em',
              wordBreak: 'keep-all',
              padding: '0 30px',
              textShadow: `0 10px 46px ${theme.bg}CC`,
            }}
          >
            {visual.text}
          </div>
        </div>
        {visual.sub ? (
          <div
            style={{
              fontFamily: theme.fontStack,
              fontSize: 44,
              fontWeight: 700,
              color: `${theme.fg}D9`,
              marginTop: 40,
              wordBreak: 'keep-all',
              textShadow: `0 5px 24px ${theme.bg}CC`,
              opacity: interpolate(frame, [fps * 0.35, fps * 0.65], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            {visual.sub}
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  if (visual.kind === 'quote') {
    return (
      <AbsoluteFill style={shell}>
        {vignette}
        <div style={{ ...base, maxWidth: 1460, padding: '0 60px' }}>
          <div
            style={{
              position: 'relative',
              backgroundColor: `${theme.bg}D9`,
              border: `2px solid ${theme.fg}1F`,
              borderLeft: `12px solid ${theme.accent}`,
              borderRadius: 20,
              padding: '56px 58px 44px',
              boxShadow: `0 20px 70px ${theme.bg}B3`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -44,
                left: 30,
                fontSize: 145,
                fontWeight: 900,
                color: theme.accent,
                lineHeight: 1,
              }}
            >
              “
            </div>
            <div
              style={{
                fontSize: 62,
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
                marginTop: 26,
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

  if (visual.kind === 'list') {
    return (
      <AbsoluteFill style={shell}>
        {vignette}
        <div style={{ ...base, width: '100%', maxWidth: 1360, padding: '0 70px' }}>
          {kicker(visual.title)}
          <div
            style={{
              backgroundColor: `${theme.bg}D9`,
              border: `2px solid ${theme.fg}1F`,
              borderRadius: 20,
              padding: '42px 54px',
              boxShadow: `0 20px 70px ${theme.bg}B3`,
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
                    gap: 20,
                    alignItems: 'baseline',
                    marginTop: i === 0 ? 0 : 26,
                    opacity: s,
                    transform: `translateX(${interpolate(s, [0, 1], [56, 0])}px)`,
                  }}
                >
                  <div style={{ color: theme.accent, fontSize: 48, fontWeight: 900 }}>▸</div>
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

  // contrast
  const slide = interpolate(enter, [0, 1], [90, 0]);
  const cell = (label: string, value: string, dx: number, highlight: boolean): React.ReactNode => (
    <div
      style={{
        flex: 1,
        transform: `translateX(${dx}px)`,
        backgroundColor: highlight ? theme.accent : `${theme.bg}D9`,
        border: highlight ? 'none' : `2px solid ${theme.fg}26`,
        borderRadius: 20,
        padding: '48px 30px',
        textAlign: 'center',
        boxShadow: highlight ? `0 14px 56px ${theme.accent}59` : `0 14px 56px ${theme.bg}99`,
      }}
    >
      <div
        style={{
          fontSize: 40,
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
          fontSize: 68,
          fontWeight: 900,
          color: highlight ? theme.bg : theme.fg,
          lineHeight: 1.18,
          wordBreak: 'keep-all',
        }}
      >
        {value}
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={shell}>
      {vignette}
      <div
        style={{
          ...base,
          display: 'flex',
          gap: 28,
          width: '100%',
          maxWidth: 1460,
          padding: '0 60px',
          alignItems: 'center',
        }}
      >
        {cell(visual.leftLabel, visual.leftValue, -slide, false)}
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 42,
            fontWeight: 900,
            color: theme.fg,
            backgroundColor: `${theme.bg}E6`,
            border: `4px solid ${theme.accent}`,
            borderRadius: 999,
            width: 112,
            height: 112,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transform: `scale(${enter})`,
          }}
        >
          VS
        </div>
        {cell(visual.rightLabel, visual.rightValue, slide, true)}
      </div>
    </AbsoluteFill>
  );
};

/* ─── 오프닝 / 챕터 카드 / 상단 칩 ────────────────────────────────── */

const OpeningCard: React.FC<{
  title: string;
  weekLabel: string;
  brand?: string;
  theme: Theme;
}> = ({ title, weekLabel, brand, theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const exit = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const flash = interpolate(frame, [0, 12], [-130, 130], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const underline = interpolate(frame, [12, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: exit,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(70% 90% at 50% 40%, ${theme.accent}21 0%, transparent 65%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, transparent 42%, ${theme.accent} 50%, transparent 58%)`,
          transform: `translateX(${flash}%)`,
          opacity: 0.9,
        }}
      />
      <div style={{ textAlign: 'center', opacity: enter, transform: `scale(${interpolate(enter, [0, 1], [0.9, 1])})` }}>
        {brand ? (
          <div
            style={{
              fontFamily: theme.fontStack,
              fontSize: 34,
              fontWeight: 700,
              color: `${theme.fg}CC`,
              letterSpacing: '0.24em',
              marginBottom: 34,
            }}
          >
            <span style={{ color: theme.accent }}>●</span> {brand}
          </div>
        ) : null}
        <div
          style={{
            display: 'inline-block',
            backgroundColor: theme.accent,
            color: theme.bg,
            fontFamily: theme.fontStack,
            fontSize: 34,
            fontWeight: 800,
            padding: '12px 34px',
            borderRadius: 999,
            marginBottom: 38,
          }}
        >
          {weekLabel}
        </div>
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 96,
            fontWeight: 900,
            lineHeight: 1.24,
            letterSpacing: '-0.03em',
            color: theme.fg,
            maxWidth: 1500,
            wordBreak: 'keep-all',
            textWrap: 'balance',
            padding: '0 60px',
          }}
        >
          {title}
        </div>
        <div
          style={{
            height: 12,
            width: 560 * underline,
            backgroundColor: theme.accent,
            margin: '40px auto 0',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/**
 * 오프닝 라인업 — 타이틀 카드 다음, 이슈 예고 나레이션이 흐르는 동안
 * 이번 주 챕터 목차가 하나씩 박힌다. 인트로가 한 화면에 오래 머물지 않게
 * 하는 장치이자, 끝까지 볼 이유를 미리 보여주는 예고편이다.
 */
const Rundown: React.FC<{
  chapters: WeeklyChapter[];
  weekLabel: string;
  theme: Theme;
}> = ({ chapters, weekLabel, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bgIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, opacity: bgIn }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(70% 90% at 30% 30%, ${theme.accent}1C 0%, transparent 65%)`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 200px' }}>
        <div
          style={{
            display: 'inline-block',
            alignSelf: 'flex-start',
            backgroundColor: theme.accent,
            color: theme.bg,
            fontFamily: theme.fontStack,
            fontSize: 32,
            fontWeight: 800,
            padding: '10px 28px',
            borderRadius: 999,
            marginBottom: 44,
            opacity: interpolate(frame, [4, 14], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {weekLabel} — Rundown
        </div>
        {chapters.map((chapter, i) => {
          const s = spring({
            frame: frame - 8 - i * 9,
            fps,
            config: { damping: 13, mass: 0.6 },
          });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 34,
                marginTop: i === 0 ? 0 : 30,
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [-110, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: theme.fontStack,
                  fontSize: 58,
                  fontWeight: 900,
                  color: theme.accent,
                  minWidth: 90,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <div
                style={{
                  fontFamily: theme.fontStack,
                  fontSize: 62,
                  fontWeight: 900,
                  color: theme.fg,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                  lineHeight: 1.25,
                }}
              >
                {chapter.title}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ChapterCard: React.FC<{ index: number; title: string; theme: Theme }> = ({
  index,
  title,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const exit = interpolate(frame, [CHAPTER_CARD_FRAMES - 8, CHAPTER_CARD_FRAMES], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: `${theme.bg}D9`,
        justifyContent: 'center',
        padding: '0 140px',
        opacity: exit,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 54,
          opacity: enter,
          transform: `translateX(${interpolate(enter, [0, 1], [-120, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 170,
            fontWeight: 900,
            color: theme.accent,
            lineHeight: 1,
            textShadow: `0 0 80px ${theme.accent}59`,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
        <div style={{ width: 8, alignSelf: 'stretch', backgroundColor: theme.accent }} />
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 1.26,
            letterSpacing: '-0.02em',
            color: theme.fg,
            wordBreak: 'keep-all',
            maxWidth: 1300,
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 챕터 장면 동안 좌상단에 남는 칩 — 중간 진입 시청자도 지금 이슈를 안다. */
const ChapterChip: React.FC<{ index: number; title: string; brand?: string; theme: Theme }> = ({
  index,
  title,
  brand,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ alignItems: 'flex-start', padding: '52px 0 0 64px', opacity: enter }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: theme.fontStack,
          backgroundColor: `${theme.bg}B3`,
          borderLeft: `8px solid ${theme.accent}`,
          borderRadius: 14,
          padding: '14px 28px',
          maxWidth: 1100,
        }}
      >
        {brand ? (
          <span style={{ fontSize: 28, fontWeight: 700, color: `${theme.fg}99`, whiteSpace: 'nowrap' }}>
            <span style={{ color: theme.accent }}>●</span> {brand}
          </span>
        ) : null}
        <span style={{ fontSize: 30, fontWeight: 800, color: theme.accent, whiteSpace: 'nowrap' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: theme.fg,
            wordBreak: 'keep-all',
            lineHeight: 1.3,
          }}
        >
          {title}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/* ─── 아웃트로 / BGM / 진행 바 ────────────────────────────────────── */

const HOutro: React.FC<{ brand: string; logo?: string; theme: Theme }> = ({
  brand,
  logo,
  theme,
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
      style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg, opacity: bgIn }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(55% 70% at 50% 45%, ${theme.accent}26 0%, transparent 65%)`,
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
          <div
            style={{
              width: 260,
              height: 260,
              borderRadius: '50%',
              overflow: 'hidden',
              border: `8px solid ${theme.accent}`,
              margin: '0 auto 36px',
              boxShadow: `0 24px 90px ${theme.bg}, 0 0 70px ${theme.accent}40`,
            }}
          >
            <Img src={staticFile(logo)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : null}
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: logo ? 76 : 100,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: theme.fg,
          }}
        >
          {logo ? brand : (
            <>
              <span style={{ color: theme.accent }}>●</span> {brand}
            </>
          )}
        </div>
        <div
          style={{
            height: 8,
            width: 340 * underline,
            backgroundColor: theme.accent,
            margin: '24px auto 0',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

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

const ProgressBar: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = (frame / Math.max(durationInFrames - 1, 1)) * 100;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div style={{ height: 8, backgroundColor: `${theme.fg}24` }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: theme.accent }} />
      </div>
    </AbsoluteFill>
  );
};

/* ─── 컴포지션 ────────────────────────────────────────────────────── */

const sceneAudio = (scene: ShortScene): React.ReactNode =>
  scene.audioSrc ? <Audio src={staticFile(scene.audioSrc)} /> : null;

const scenesSum = (scenes: ShortScene[]): number =>
  scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

const ChapterBlock: React.FC<{
  chapter: WeeklyChapter;
  index: number;
  brand?: string;
  theme: Theme;
}> = ({ chapter, index, brand, theme }) => {
  // 챕터 내부 좌표계: 카드(0~66f) → 장면들. 배경은 카드 아래에도 깔려 있다.
  const bounds: number[] = [];
  let cursor = CHAPTER_CARD_FRAMES;
  for (const scene of chapter.scenes) {
    cursor += scene.durationInFrames;
    bounds.push(cursor);
  }

  return (
    <AbsoluteFill>
      <ChapterBg src={chapter.backgroundImage} theme={theme} sceneBounds={[CHAPTER_CARD_FRAMES, ...bounds]} />
      {chapter.scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={bounds[i]! - scene.durationInFrames}
          durationInFrames={scene.durationInFrames}
        >
          {sceneAudio(scene)}
          {scene.visual ? <HVisual visual={scene.visual} theme={theme} /> : null}
          <HCaption scene={scene} theme={theme} />
        </Sequence>
      ))}
      <Sequence from={CHAPTER_CARD_FRAMES}>
        <ChapterChip index={index} title={chapter.title} brand={brand} theme={theme} />
      </Sequence>
      <Sequence durationInFrames={CHAPTER_CARD_FRAMES}>
        <ChapterCard index={index} title={chapter.title} theme={theme} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const WeeklyRecap: React.FC<WeeklyProps> = ({
  title,
  weekLabel,
  opening,
  chapters,
  closing,
  theme,
  bgmSrc,
  bgmVolume = 0.35,
  brand,
  brandLogo,
}) => {
  const openingDur = Math.max(scenesSum(opening), 1);
  const chapterDur = (c: WeeklyChapter) => CHAPTER_CARD_FRAMES + scenesSum(c.scenes);

  let cursor = openingDur;
  const chapterStarts = chapters.map((c) => {
    const start = cursor;
    cursor += chapterDur(c);
    return start;
  });
  const closingStart = cursor;
  const closingDur = Math.max(scenesSum(closing), 1);
  const outroStart = closingStart + (closing.length ? closingDur : 0);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {bgmSrc ? <Bgm src={bgmSrc} volume={bgmVolume} /> : null}

      {/* 오프닝 — 첫 장면은 타이틀 카드, 나머지는 이번 주 라인업 목차.
          인트로가 한 화면에 머무는 시간을 첫 장면 길이로 제한한다. */}
      <Sequence durationInFrames={openingDur}>
        <Sequence durationInFrames={opening[0]?.durationInFrames ?? openingDur}>
          <OpeningCard title={title} weekLabel={weekLabel} brand={brand} theme={theme} />
        </Sequence>
        {opening.length > 1 ? (
          <Sequence from={opening[0]!.durationInFrames}>
            <Rundown chapters={chapters} weekLabel={weekLabel} theme={theme} />
          </Sequence>
        ) : null}
        {opening.map((scene, i) => {
          const from = scenesSum(opening.slice(0, i));
          return (
            <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
              {sceneAudio(scene)}
            </Sequence>
          );
        })}
      </Sequence>

      {chapters.map((chapter, i) => (
        <Sequence key={i} from={chapterStarts[i]!} durationInFrames={chapterDur(chapter)}>
          <ChapterBlock chapter={chapter} index={i} brand={brand} theme={theme} />
        </Sequence>
      ))}

      {/* 클로징 — 사진 없이 채널 톤 배경 위에서 마무리 멘트 */}
      {closing.length ? (
        <Sequence from={closingStart} durationInFrames={closingDur}>
          <AbsoluteFill style={{ backgroundColor: theme.bg }}>
            <AbsoluteFill
              style={{
                background: `radial-gradient(70% 90% at 50% 40%, ${theme.accent}1C 0%, transparent 65%)`,
              }}
            />
          </AbsoluteFill>
          {closing.map((scene, i) => {
            const from = scenesSum(closing.slice(0, i));
            return (
              <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
                {sceneAudio(scene)}
                {scene.visual ? <HVisual visual={scene.visual} theme={theme} /> : null}
                <HCaption scene={scene} theme={theme} />
              </Sequence>
            );
          })}
        </Sequence>
      ) : null}

      <ProgressBar theme={theme} />

      {brand ? (
        <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
          <HOutro brand={brand} logo={brandLogo} theme={theme} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
