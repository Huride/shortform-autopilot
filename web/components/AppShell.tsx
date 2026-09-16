'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const NAV = [
  { href: '/app/workspace', ic: '💬', label: '워크스페이스' },
  { href: '/app/create', ic: '✚', label: '새 영상 만들기' },
  { href: '/app/library', ic: '🎞️', label: '보관함' },
  { href: '/app/publish', ic: '📡', label: '발행 · 자동화' },
  { href: '/app/billing', ic: '💳', label: '플랜 · 결제' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      setEmail(session.user.email ?? null);
      const { data } = await sb.from('profiles').select('credits').eq('id', session.user.id).single();
      setCredits(data?.credits ?? null);
      setReady(true);
    });
  }, [router]);

  async function logout() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    router.replace('/');
  }

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
        <div className="nav-sec">계정</div>
        <Link href="/app/settings" className={`nav-item${path.startsWith('/app/settings') ? ' active' : ''}`} style={{ textDecoration: 'none' }}><span className="ic">⚙︎</span><span className="lbl">설정 · API 키</span></Link>
        <button className="nav-item" onClick={logout}><span className="ic">↩</span><span className="lbl">로그아웃</span></button>
        <div className="rail-foot">
          <div className="plan-pill"><span>{email ? email.split('@')[0] : '…'}</span><Link className="up-link" href="/app/billing">무료 플랜</Link></div>
          <div style={{ fontSize: 11, marginTop: 4 }}>크레딧 <b style={{ color: 'var(--nav-active)' }}>{credits ?? '—'}</b> · 렌더 1편 = 10</div>
        </div>
      </nav>
      <main className="main">{ready ? children : <div style={{ padding: 40, color: 'var(--faint)', display: 'flex', gap: 10, alignItems: 'center' }}><span className="spinner" /> 불러오는 중…</div>}</main>
    </div>
  );
}
