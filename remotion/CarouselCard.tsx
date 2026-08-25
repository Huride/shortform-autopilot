import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import type { SceneVisual, Theme } from './schema';
import { DEFAULT_THEME } from './schema';

/**
 * 인스타 피드 카드뉴스 (4:5, 1080×1350) — 정지 이미지 전용 컴포지션.
 * 영상의 장면 카드 문법을 재사용하되, 스틸이라 완성 상태로 그린다.
 * 설명 텍스트(나레이션 정제본)를 함께 실어 영상 없이도 이해되게 한다.
 */
export type CarouselCardProps = {
  theme: Theme;
  brand: string;
  /** 브랜드 로고 (remotion/public 상대 경로). 없으면 ● 텍스트 폴백 */
  logo?: string;
  /** 카드 배경 이미지 (remotion/public 상대 경로) — 어둡게 덮어서 쓴다 */
  bg?: string;
  card:
    | { kind: 'cover'; date: string; items: string[] }
    | { kind: 'hook'; issueNo: number; text: string; summary?: string }
    | { kind: 'scene'; caption: string; emphasis?: string; visual?: SceneVisual; body?: string }
    | { kind: 'closing'; signoff: string; note: string };
};

export const defaultCarouselProps: CarouselCardProps = {
  theme: DEFAULT_THEME,
  brand: '채널',
  card: { kind: 'cover', date: '2026.08.25 화', items: ['이슈 하나', '이슈 둘'] },
};

const Brand: React.FC<{ brand: string; logo?: string; theme: Theme }> = ({ brand, logo, theme }) => (
  <div style={{ position: 'absolute', top: 46, left: 60, display: 'flex', alignItems: 'center', gap: 20 }}>
    {logo ? (
      <Img
        src={staticFile(logo)}
        style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.fg}33` }}
      />
    ) : (
      <span style={{ color: theme.accent, fontSize: 34 }}>●</span>
    )}
    <span style={{ fontFamily: theme.fontStack, fontSize: 36, fontWeight: 800, color: `${theme.fg}DD`, letterSpacing: '0.12em' }}>
      {brand}
    </span>
  </div>
);

const Backdrop: React.FC<{ bg?: string; theme: Theme }> = ({ bg, theme }) => (
  <>
    {bg ? (
      <AbsoluteFill>
        <Img src={staticFile(bg)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.bg}E6 0%, ${theme.bg}CC 45%, ${theme.bg}F2 100%)` }} />
      </AbsoluteFill>
    ) : (
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${theme.bg} 0%, ${theme.bg} 55%, #1a0f10 100%)` }} />
    )}
  </>
);

const cap = (theme: Theme, size = 62): React.CSSProperties => ({
  fontFamily: theme.fontStack,
  fontSize: size,
  fontWeight: 900,
  lineHeight: 1.32,
  color: theme.fg,
  wordBreak: 'keep-all',
});

const bodyStyle = (theme: Theme): React.CSSProperties => ({
  fontFamily: theme.fontStack,
  fontSize: 38,
  fontWeight: 500,
  lineHeight: 1.62,
  color: `${theme.fg}D9`,
  wordBreak: 'keep-all',
});

export const CarouselCard: React.FC<CarouselCardProps> = ({ theme, brand, logo, bg, card }) => {
  const pad: React.CSSProperties = { padding: '150px 60px 110px', fontFamily: theme.fontStack };

  if (card.kind === 'cover') {
    return (
      <AbsoluteFill>
        <Backdrop bg={bg} theme={theme} />
        <AbsoluteFill style={{ ...pad, justifyContent: 'center' }}>
          <Brand brand={brand} logo={logo} theme={theme} />
          <div style={{ fontSize: 40, fontWeight: 700, color: `${theme.fg}88`, marginBottom: 18 }}>{card.date}</div>
          <div style={{ ...cap(theme, 92), marginBottom: 64 }}>
            오늘의<br />{brand}
          </div>
          {card.items.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 38 }}>
              <div style={{ fontSize: 46, fontWeight: 900, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ ...cap(theme, 46), fontWeight: 800 }}>{t}</div>
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 110, left: 60, right: 60, height: 8, background: theme.accent }} />
          <div style={{ position: 'absolute', bottom: 54, left: 60, fontSize: 30, color: `${theme.fg}77` }}>넘겨서 확인 →</div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (card.kind === 'hook') {
    return (
      <AbsoluteFill>
        <Backdrop bg={bg} theme={theme} />
        <AbsoluteFill style={{ ...pad, justifyContent: 'center' }}>
          <Brand brand={brand} logo={logo} theme={theme} />
          <div style={{ fontSize: 44, fontWeight: 900, color: theme.accent, marginBottom: 30 }}>ISSUE {String(card.issueNo).padStart(2, '0')}</div>
          <div style={{ ...cap(theme, 74), marginBottom: card.summary ? 44 : 0 }}>{card.text}</div>
          {card.summary ? <div style={bodyStyle(theme)}>{card.summary}</div> : null}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (card.kind === 'closing') {
    return (
      <AbsoluteFill>
        <Backdrop bg={bg} theme={theme} />
        <AbsoluteFill style={{ ...pad, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 46 }}>
            {logo ? (
              <Img src={staticFile(logo)} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.fg}33` }} />
            ) : (
              <span style={{ color: theme.accent, fontSize: 42 }}>●</span>
            )}
            <span style={{ fontSize: 46, fontWeight: 800, color: `${theme.fg}DD`, letterSpacing: '0.12em' }}>{brand}</span>
          </div>
          <div style={{ ...cap(theme, 68), marginBottom: 46 }}>{card.signoff}</div>
          <div style={{ fontSize: 34, color: `${theme.fg}99` }}>{card.note}</div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // scene 카드 — 제목(caption) / 비주얼 / 설명(나레이션 정제본)
  const v = card.visual;
  const emph = (text: string) => {
    if (!card.emphasis || !text.includes(card.emphasis)) return text;
    const [a, b] = text.split(card.emphasis);
    return (
      <>
        {a}
        <span style={{ color: theme.accent }}>{card.emphasis}</span>
        {b}
      </>
    );
  };
  return (
    <AbsoluteFill>
      <Backdrop bg={bg} theme={theme} />
      <AbsoluteFill style={{ ...pad, paddingTop: 160 }}>
        <Brand brand={brand} logo={logo} theme={theme} />
        <div style={{ ...cap(theme, 56), marginBottom: 30 }}>{emph(card.caption)}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {v?.kind === 'stat' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: `${theme.fg}99`, marginBottom: 12 }}>{v.label}</div>
              <div style={{ fontSize: 150, fontWeight: 900, color: theme.fg, lineHeight: 1.02, letterSpacing: '-0.03em' }}>{v.value}</div>
              {v.sub ? <div style={{ fontSize: 34, color: `${theme.fg}99`, marginTop: 16 }}>{v.sub}</div> : null}
            </div>
          ) : v?.kind === 'quote' ? (
            <div style={{ textAlign: 'center', maxWidth: 880 }}>
              <div style={{ fontSize: 110, color: theme.accent, lineHeight: 0.6, marginBottom: 22 }}>“</div>
              <div style={{ ...cap(theme, 52), marginBottom: 26 }}>{v.text}</div>
              <div style={{ fontSize: 34, color: `${theme.fg}99` }}>— {v.attribution}</div>
            </div>
          ) : v?.kind === 'contrast' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
              <div style={{ background: `${theme.bg}B3`, border: `2px solid ${theme.fg}33`, borderRadius: 20, padding: '32px 30px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, color: `${theme.fg}99`, marginBottom: 8 }}>{v.leftLabel}</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: theme.fg }}>{v.leftValue}</div>
              </div>
              <div style={{ alignSelf: 'center', fontSize: 34, fontWeight: 900, color: theme.accent }}>VS</div>
              <div style={{ background: theme.accent, borderRadius: 20, padding: '32px 30px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, color: `${theme.bg}CC`, marginBottom: 8 }}>{v.rightLabel}</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: theme.bg }}>{v.rightValue}</div>
              </div>
            </div>
          ) : v?.kind === 'list' ? (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: theme.accent, marginBottom: 28 }}>{v.title}</div>
              {v.items.map((it, i) => (
                <div key={i} style={{ ...cap(theme, 44), fontWeight: 700, padding: '20px 0', borderBottom: `2px solid ${theme.fg}22` }}>
                  {it}
                </div>
              ))}
            </div>
          ) : v?.kind === 'keyword' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-block', background: theme.accent, color: theme.bg, fontSize: 76, fontWeight: 900, padding: '24px 44px' }}>{v.text}</div>
              {v.sub ? <div style={{ fontSize: 36, color: `${theme.fg}99`, marginTop: 26 }}>{v.sub}</div> : null}
            </div>
          ) : null}
        </div>
        {card.body ? <div style={{ ...bodyStyle(theme), paddingBottom: 6 }}>{card.body}</div> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
