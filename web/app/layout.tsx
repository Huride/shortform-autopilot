import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autopilot — 주제 한 줄이 매일 영상이 됩니다',
  description: 'AI 에이전트가 운영하는 나만의 숏폼 채널. 대본·보이스·모션그래픽 렌더까지 자동으로.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
