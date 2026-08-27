'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export default function Settings() {
  const [key, setKey] = useState('');
  const [brand, setBrand] = useState({ name: '', signoff: '', tagline: '' });
  const [brandRow, setBrandRow] = useState<string | null>(null);
  const [brandState, setBrandState] = useState<'idle' | 'saving' | 'ok'>('idle');
  const [status, setStatus] = useState<'none' | 'saving' | 'ok' | 'error'>('none');
  const [existing, setExisting] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('user_keys').select('provider, validated_at').eq('provider', 'openai').maybeSingle()
      .then(({ data }) => { if (data?.validated_at) setExisting(new Date(data.validated_at).toLocaleDateString('ko-KR')); });
    sb.from('channels').select('id, config').eq('archived', false).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) { setBrandRow(data.id); setBrand({ name: data.config?.name ?? '', signoff: data.config?.signoff ?? '', tagline: data.config?.tagline ?? '' }); }
      });
  }, [status]);

  async function saveBrand(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    setBrandState('saving');
    const config = { name: brand.name.trim(), signoff: brand.signoff.trim(), tagline: brand.tagline.trim() };
    if (brandRow) await sb.from('channels').update({ config }).eq('id', brandRow);
    else {
      const { data } = await sb.from('channels').insert({ user_id: session.user.id, config }).select('id').single();
      if (data) setBrandRow(data.id);
    }
    setBrandState('ok');
    setTimeout(() => setBrandState('idle'), 2500);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setStatus('saving');
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ provider: 'openai', key: key.trim() }),
    });
    const j = await res.json();
    if (j.ok) { setStatus('ok'); setKey(''); setMsg(''); }
    else { setStatus('error'); setMsg(j.error === 'key_rejected' ? 'OpenAI가 이 키를 거부했어요. 키를 다시 확인해주세요.' : '저장에 실패했어요: ' + j.error); }
  }

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar"><h1>설정 · API 키</h1></div>
      <div className="content">
        <div className="set-grid">
          <div className="card set-card">
            <h3>내 채널 브랜딩 {brandState === 'ok' && <span className="badge ok">✓ 저장됨</span>}</h3>
            <p className="sub">영상의 워터마크·아웃트로·마지막 시그니처 멘트에 들어갑니다. 비워두면 템플릿 기본 브랜드가 쓰여요.</p>
            <form onSubmit={saveBrand}>
              <div className="field"><label>채널 이름</label>
                <input value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} placeholder="예: 지갑수비대" /></div>
              <div className="field"><label>시그니처 멘트 — 모든 영상의 마지막 문장</label>
                <input value={brand.signoff} onChange={(e) => setBrand({ ...brand, signoff: e.target.value })} placeholder="예: 오늘도 지갑은 내가 지킨다 — 지갑수비대." /></div>
              <div className="field"><label>태그라인 — 화면 모서리 워터마크</label>
                <input value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} placeholder="예: your wallet, guarded" /></div>
              <button className="btn primary" disabled={brandState === 'saving'}>{brandState === 'saving' ? '저장 중…' : '브랜딩 저장'}</button>
            </form>
          </div>
          <div className="card set-card">
            <h3>OpenAI API 키 {existing && <span className="badge ok">● 연결됨 · {existing} 검증</span>}</h3>
            <p className="sub">키 하나로 대본·음성·이미지가 만들어집니다. 암호화되어 저장되고, 사용료는 내 OpenAI 계정에 직접 청구돼요. <a href="https://platform.openai.com/api-keys" target="_blank" style={{ color: 'var(--accent)' }}>키 발급 (5분) ↗</a></p>
            <form onSubmit={save} style={{ display: 'flex', gap: 10 }}>
              <input type="password" placeholder={existing ? '새 키로 교체하려면 입력' : 'sk-...'} value={key} onChange={(e) => setKey(e.target.value)} required />
              <button className="btn primary" style={{ flex: 'none' }} disabled={status === 'saving'}>{status === 'saving' ? '검증 중…' : existing ? '교체' : '연결'}</button>
            </form>
            {status === 'ok' && <p style={{ color: 'var(--ok)', fontSize: 13, marginTop: 10 }}>✓ 검증 완료 — 이제 영상을 만들 수 있어요!</p>}
            {status === 'error' && <p style={{ color: 'var(--warn)', fontSize: 13, marginTop: 10 }}>{msg}</p>}
          </div>
          <div className="card set-card">
            <h3>플랜</h3>
            <p className="sub">무료 플랜 — 가입 크레딧 20 (영상 2편). 결제는 곧 열려요.</p>
            <div className="key-row"><div><b>ElevenLabs</b><span className="mono" style={{ color: 'var(--faint)' }}>프리미엄 보이스 (선택)</span></div><span className="badge dim">준비 중</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
