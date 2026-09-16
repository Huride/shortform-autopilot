'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

type Stats = { totals: Record<string, number>; days: { d: string; signups: number; jobs: number; rendered: number; failed: number; trial: number }[] };

/** 운영 통계 — 심사 기간 가입·생성·렌더 추이. 접속량은 Vercel Web Analytics 에서 본다. */
export default function Admin() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      const sb = getSupabase(); if (!sb) return;
      const { data: { session } } = await sb.auth.getSession(); if (!session) return;
      const r = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!r.ok) { setErr(r.status === 403 ? '운영자 계정만 볼 수 있어요.' : '불러오지 못했어요.'); return; }
      setS(await r.json());
    })();
  }, []);
  const T = s?.totals ?? {};
  const Card = ({ k, v, sub }: { k: string; v: number | string; sub?: string }) => (
    <div className="card" style={{ padding: 16, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>{k}</div>
      <b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{v}</b>
      {sub && <div style={{ fontSize: 11, color: 'var(--sub)' }}>{sub}</div>}
    </div>
  );
  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar"><h1>운영 통계 <span className="badge dim" style={{ marginLeft: 8 }}>최근 14일</span></h1>
        <a className="btn sm" href="https://vercel.com/offroute-studio/autopilot-app/analytics" target="_blank" rel="noreferrer">접속량 (Vercel Analytics) ↗</a></div>
      <div className="content">
        {err && <p style={{ color: 'var(--warn)' }}>{err}</p>}
        {s && (<>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <Card k="가입자 (누적)" v={T.users} sub={`유료 ${T.paid} · 키 등록 ${T.withKey}`} />
            <Card k="활성 사용자 (14일)" v={T.activeUsers14d} sub="잡을 만든 계정" />
            <Card k="영상 접수 (14일)" v={T.jobs14d} sub={`체험 ${T.trial14d}`} />
            <Card k="렌더 완료 (14일)" v={T.rendered14d} />
            <Card k="실패 (14일)" v={T.failed14d} sub={T.jobs14d ? `${Math.round((T.failed14d / T.jobs14d) * 100)}%` : ''} />
          </div>
          <div className="card" style={{ maxWidth: 900 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ color: 'var(--faint)', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px' }}>날짜</th><th>가입</th><th>접수</th><th>렌더</th><th>실패</th><th style={{ paddingRight: 16 }}>체험</th>
              </tr></thead>
              <tbody>
                {s.days.map((r) => (
                  <tr key={r.d} style={{ borderTop: '1px solid var(--line)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <td style={{ textAlign: 'left', padding: '8px 16px' }}>{r.d.slice(5)}</td><td>{r.signups || ''}</td><td>{r.jobs || ''}</td><td>{r.rendered || ''}</td><td style={{ color: r.failed ? 'var(--warn)' : undefined }}>{r.failed || ''}</td><td style={{ paddingRight: 16 }}>{r.trial || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </section>
  );
}
