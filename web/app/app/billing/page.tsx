'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * 플랜 · 결제 — 화면 우선 구현. 결제(호스티드 체크아웃)와 웹훅은 베타 이후 연결.
 * 현재 플랜·크레딧·사용 내역은 실제 데이터(profiles, jobs)를 읽는다.
 */
const PLANS = [
  { id: 'free', name: '무료', price: '₩0', per: '', credits: '가입 시 1회 50크레딧 (약 5편 · 갱신 없음)', bullets: ['API 키 없이 첫 1편 무료 체험', '템플릿·에디터 전 기능', '"made with Autopilot" 워터마크', '워터마크 제거 편당 +5크레딧'] },
  { id: 'creator', name: '크리에이터', price: '₩9,900', per: '/월', credits: '매월 150크레딧 갱신 (약 12편)', bullets: ['채널 2개 · 템플릿 전체', '씬 에디터 + 에이전트 수정', '1080p · 워터마크 항상 없음'] },
  { id: 'autopilot', name: '오토파일럿', price: '₩29,000', per: '/월', credits: '매월 500크레딧 갱신 (약 40편)', bullets: ['채널 5개', '유튜브·인스타 자동 예약 발행', '매일 자동 편성 + 주간 결산'], hot: true },
];
const PACKS = [{ c: 100, p: '₩4,900' }, { c: 300, p: '₩12,900' }, { c: 1000, p: '₩39,000' }];

export default function Billing() {
  const [plan, setPlan] = useState('free');
  const [credits, setCredits] = useState<number | null>(null);
  const [renders, setRenders] = useState<{ topic: string; at: string; noWm: boolean }[]>([]);

  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    sb.from('profiles').select('plan, credits').maybeSingle().then(({ data }) => {
      if (data) { setPlan(data.plan ?? 'free'); setCredits(data.credits ?? 0); }
    });
    sb.from('jobs').select('topic, updated_at, script').eq('status', 'rendered').order('updated_at', { ascending: false }).limit(20)
      .then(({ data }) => setRenders((data ?? []).map((j: any) => ({ topic: j.topic, at: j.updated_at, noWm: j.script?.noWatermark === true }))));
  }, []);

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar"><h1>플랜 · 결제 <span className="badge dim" style={{ marginLeft: 8 }}>결제 베타 준비 중</span></h1></div>
      <div className="content">
        <div className="card" style={{ padding: '16px 20px', marginBottom: 24, maxWidth: 1080, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 12, color: 'var(--faint)' }}>현재 플랜</div><b style={{ fontSize: 18 }}>{PLANS.find((p) => p.id === plan)?.name ?? plan}</b></div>
          <div><div style={{ fontSize: 12, color: 'var(--faint)' }}>남은 크레딧</div><b style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{credits ?? '…'}</b> <span style={{ fontSize: 12, color: 'var(--sub)' }}>· 렌더 1편 = 10</span></div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)' }}>결제는 호스티드 체크아웃(카드·간편결제)으로 열릴 예정이에요. 지금은 플랜 내용만 확인해 주세요.</div>
        </div>

        <h2 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--sub)' }}>구독 플랜</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 1080, marginBottom: 28 }}>
          {PLANS.map((p) => (
            <div key={p.id} className="card" style={{ padding: 24, border: p.id === plan ? '2px solid var(--accent)' : undefined, position: 'relative' }}>
              {p.hot && <span className="badge amber" style={{ position: 'absolute', top: 16, right: 16 }}>가장 인기</span>}
              {p.id === plan && <span className="badge ok" style={{ position: 'absolute', top: 16, right: p.hot ? 92 : 16 }}>현재</span>}
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{p.name}</h3>
              <div style={{ margin: '0 0 4px' }}><b style={{ fontSize: 26, letterSpacing: '-.02em' }}>{p.price}</b><span style={{ color: 'var(--faint)', fontSize: 13 }}>{p.per}</span></div>
              <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 12 }}>{p.credits}</div>
              <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--ink)' }}>
                {p.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
              {p.id === plan ? (
                <button className="btn" style={{ width: '100%' }} disabled>사용 중</button>
              ) : p.id === 'free' ? (
                <button className="btn" style={{ width: '100%' }} disabled>다운그레이드 준비 중</button>
              ) : (
                <button className={`btn ${p.hot ? 'primary' : ''}`} style={{ width: '100%' }} disabled title="결제 베타 준비 중">구독하기 — 준비 중</button>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--faint)', margin: '-16px 0 28px', maxWidth: 1080 }}>얼리액세스 첫 달 30% 할인이 적용될 예정이에요 (크리에이터 ₩6,930 · 오토파일럿 ₩20,300). 연간 결제 할인은 결제 오픈과 함께 안내합니다.</p>

        <h2 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--sub)' }}>크레딧 충전 (구독과 별개 · 소멸 없음)</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', maxWidth: 1080, marginBottom: 28 }}>
          {PACKS.map((k) => (
            <div key={k.c} className="card" style={{ flex: 1, minWidth: 180, padding: 20, textAlign: 'center' }}>
              <b style={{ fontSize: 18, display: 'block' }}>{k.c}크레딧</b>
              <span style={{ fontSize: 14, color: 'var(--sub)' }}>{k.p}</span>
              <div style={{ fontSize: 12, color: 'var(--faint)', margin: '4px 0 12px' }}>영상 약 {Math.floor(k.c / 10)}편</div>
              <button className="btn" style={{ width: '100%' }} disabled title="결제 베타 준비 중">충전 — 준비 중</button>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--sub)' }}>사용 내역</h2>
        <div className="card" style={{ maxWidth: 1080, marginBottom: 28 }}>
          {renders.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>아직 사용 내역이 없어요.</div>
          ) : renders.map((r, i) => (
            <div className="job-row" key={i}>
              <div className="title" style={{ flex: 1 }}>{r.topic}<small>{new Date(r.at).toLocaleString('ko-KR')}</small></div>
              <span className="badge dim">렌더</span>
              <b style={{ fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right' }}>−{r.noWm ? 15 : 10}</b>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--sub)' }}>결제 내역</h2>
        <div className="card" style={{ maxWidth: 1080 }}>
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>결제가 열리면 영수증과 구독 갱신 내역이 여기에 쌓여요. 구독 해지·결제 수단 변경도 이 화면에서 합니다.</div>
        </div>
      </div>
    </section>
  );
}
