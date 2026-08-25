import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import type { Theme } from './schema';
import { DEFAULT_THEME } from './schema';

/** 주간 롱폼 썸네일 (1280×720 스틸) — 대표 이슈 초대형 2줄 + 고대비. */
export type WeeklyThumbProps = {
  theme: Theme;
  brand?: string;
  top: string;
  bottom: string;
  weekLabel: string;
  logo?: string;
  bg?: string;
};

export const defaultWeeklyThumbProps: WeeklyThumbProps = {
  theme: DEFAULT_THEME,
  top: '훈련 축소 지시',
  bottom: '남은 건 공백',
  weekLabel: '8월 4주차',
};

export const WeeklyThumb: React.FC<WeeklyThumbProps> = ({ theme, brand = '채널', top, bottom, weekLabel, logo, bg }) => (
  <AbsoluteFill style={{ fontFamily: theme.fontStack, background: theme.bg }}>
    {bg ? (
      <>
        <Img src={staticFile(bg)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <AbsoluteFill style={{ background: `linear-gradient(100deg, ${theme.bg}F5 0%, ${theme.bg}D9 52%, ${theme.bg}66 100%)` }} />
      </>
    ) : null}
    {/* 좌측 붉은 기둥 — 채널 인장 */}
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, background: theme.accent }} />
    <div style={{ position: 'absolute', left: 64, top: 52, display: 'flex', alignItems: 'center', gap: 16 }}>
      {logo ? <Img src={staticFile(logo)} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} /> : null}
      <span style={{ fontSize: 30, fontWeight: 800, color: `${theme.fg}CC`, letterSpacing: '0.1em' }}>{brand} · {weekLabel}</span>
    </div>
    <div style={{ position: 'absolute', left: 64, bottom: 70, right: 60 }}>
      <div style={{ fontSize: 108, fontWeight: 900, color: theme.fg, lineHeight: 1.14, wordBreak: 'keep-all', textShadow: `0 6px 40px ${theme.bg}` }}>
        {top}
      </div>
      <div style={{ display: 'inline-block', marginTop: 18, background: theme.accent, color: '#fff', fontSize: 96, fontWeight: 900, lineHeight: 1.1, padding: '10px 28px' }}>
        {bottom}
      </div>
    </div>
  </AbsoluteFill>
);
