'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/app/workspace', ic: '💬', label: '워크스페이스' },
  { href: '/app/create', ic: '✚', label: '새 영상 만들기' },
  { href: '/app/library', ic: '🎞️', label: '보관함' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app">
      <nav className="rail">
        <Link href="/" className="logo" style={{ textDecoration: 'none' }}>
          <div className="logo-mark">A</div>
          <div><b>Autopilot</b><span>shortform studio</span></div>
        </Link>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-item${path.startsWith(n.href) ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
            <span className="ic">{n.ic}</span><span className="lbl">{n.label}</span>
          </Link>
        ))}
        <div className="nav-sec">채널</div>
        <Link href="/app/workspace" className="nav-item" style={{ textDecoration: 'none' }}><span className="ic">📺</span><span className="lbl">The Margin</span></Link>
        <div className="nav-sec">계정</div>
        <Link href="/app/settings" className={`nav-item${path.startsWith('/app/settings') ? ' active' : ''}`} style={{ textDecoration: 'none' }}><span className="ic">⚙︎</span><span className="lbl">설정 · 구독</span></Link>
        <div className="rail-foot">
          <div className="plan-pill"><span>둘러보기 모드</span><Link className="up-link" href="/app/settings">업그레이드</Link></div>
          <div style={{ fontSize: 11, marginTop: 4 }}>크레딧 <b style={{ color: 'var(--nav-active)' }}>—</b> · 로그인 후 표시</div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
