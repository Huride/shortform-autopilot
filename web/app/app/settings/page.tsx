'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

type StyleProfile = { bg: string; accent: string; mood: string; artDirection: string };

export default function Settings() {
  const [key, setKey] = useState('');
  const [brand, setBrand] = useState({ name: '', signoff: '', tagline: '' });
  const [brandRow, setBrandRow] = useState<string | null>(null);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [styleState, setStyleState] = useState<'idle' | 'analyzing' | 'ok' | 'error'>('idle');
  const [styleMsg, setStyleMsg] = useState('');
  const [brandState, setBrandState] = useState<'idle' | 'saving' | 'ok'>('idle');
  const [status, setStatus] = useState<'none' | 'saving' | 'ok' | 'error'>('none');
  const [existing, setExisting] = useState<string | null>(null);
  const [elKey, setElKey] = useState('');
  const [elStatus, setElStatus] = useState<'none' | 'saving' | 'ok' | 'error'>('none');
  const [elExisting, setElExisting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('user_keys').select('provider, validated_at')
      .then(({ data }) => {
        for (const k of data ?? []) {
          if (k.provider === 'openai' && k.validated_at) setExisting(new Date(k.validated_at).toLocaleDateString('ko-KR'));
          if (k.provider === 'elevenlabs') setElExisting(true);
        }
      });
    sb.from('channels').select('id, config').eq('archived', false).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBrandRow(data.id);
          setBrand({ name: data.config?.name ?? '', signoff: data.config?.signoff ?? '', tagline: data.config?.tagline ?? '' });
          if (data.config?.styleProfile) setStyleProfile(data.config.styleProfile);
        }
      });
  }, [status, elStatus]);

  // 브랜딩·스타일 프로필을 채널 config 에 병합 저장 (서로를 지우지 않게)
  async function persistConfig(patch: Record<string, unknown>) {
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    const config = {
      name: brand.name.trim(), signoff: brand.signoff.trim(), tagline: brand.tagline.trim(),
      ...(styleProfile ? { styleProfile } : {}),
      ...patch,
    };
    if (brandRow) await sb.from('channels').update({ config }).eq('id', brandRow);
    else {
      const { data } = await sb.from('channels').insert({ user_id: session.user.id, config }).select('id').single();
      if (data) setBrandRow(data.id);
    }
  }

  async function saveBrand(e: React.FormEvent) {
    e.preventDefault();
    setBrandState('saving');
    await persistConfig({});
    setBrandState('ok');
    setTimeout(() => setBrandState('idle'), 2500);
  }

  async function learnStyle(files: FileList | null) {
    if (!files?.length) return;
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    setStyleState('analyzing'); setStyleMsg('');
    try {
      const fd = new FormData();
      for (const f of Array.from(files).slice(0, 3)) fd.append('images', f);
      const r = await fetch('/api/style-learn', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: fd });
      const j = await r.json();
      if (!j.ok) { setStyleState('error'); setStyleMsg(j.error ?? '분석에 실패했어요.'); return; }
      setStyleProfile(j.profile);
      await persistConfig({ styleProfile: j.profile });
      setStyleState('ok');
    } catch { setStyleState('error'); setStyleMsg('분석 요청에 실패했어요.'); }
  }

  async function clearStyle() {
    setStyleProfile(null);
    await persistConfig({ styleProfile: undefined });
    setStyleState('idle');
  }

  // 키 삭제 — RLS(본인 행)로 클라이언트에서 직접. 서버에는 암호문만 있고 복호화 마스터키는 서버 env 에만 있다.
  async function removeKey(provider: 'openai' | 'elevenlabs') {
    if (!confirm(provider === 'openai' ? 'OpenAI 키 연결을 해제할까요? 해제하면 영상을 만들 수 없어요.' : 'ElevenLabs 키 연결을 해제할까요?')) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('user_keys').delete().eq('provider', provider);
    if (provider === 'openai') { setExisting(null); setStatus('none'); } else { setElExisting(false); setElStatus('none'); }
  }

  async function saveEl(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase(); if (!sb) return;
    setElStatus('saving');
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ provider: 'elevenlabs', key: elKey.trim() }),
    });
    const j = await res.json();
    if (j.ok) { setElStatus('ok'); setElKey(''); } else setElStatus('error');
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
              {existing && <button type="button" className="btn" style={{ flex: 'none' }} onClick={() => removeKey('openai')}>해제</button>}
            </form>
            <p style={{ fontSize: 12, color: 'var(--faint)', margin: '10px 0 0' }}>🔒 키는 서버에서 AES-256-GCM으로 암호화되어 저장되고, 영상을 만드는 순간에만 복호화돼요. 화면·로그·브라우저에는 절대 노출되지 않으며, 언제든 해제할 수 있어요.</p>
            {status === 'ok' && <p style={{ color: 'var(--ok)', fontSize: 13, marginTop: 10 }}>✓ 검증 완료 — 이제 영상을 만들 수 있어요!</p>}
            {status === 'error' && <p style={{ color: 'var(--warn)', fontSize: 13, marginTop: 10 }}>{msg}</p>}
          </div>
          <div className="card set-card">
            <h3>🎨 스타일 학습 {styleState === 'ok' && <span className="badge ok">✓ 저장됨</span>}</h3>
            <p className="sub">기존 채널의 썸네일·게시물 스크린샷 1~3장을 올리면 색감·무드를 분석해 내 브랜드 스타일을 만들어요. 이후 영상의 색상 톤·배경 아트 기본값이 됩니다.</p>
            {styleProfile ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: styleProfile.bg, border: '1px solid var(--line)', position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', right: 3, bottom: 3, width: 13, height: 13, borderRadius: '50%', background: styleProfile.accent }} />
                </span>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{styleProfile.mood || '학습된 스타일'}</b>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{styleProfile.bg} · {styleProfile.accent}</div>
                </div>
                <button type="button" className="btn sm" onClick={clearStyle}>삭제</button>
              </div>
            ) : null}
            <label className="btn" style={{ display: 'inline-block', cursor: 'pointer' }}>
              {styleState === 'analyzing' ? '분석 중… (수십 초)' : styleProfile ? '다시 학습하기' : '이미지 올려서 학습하기'}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }}
                disabled={styleState === 'analyzing'}
                onChange={(e) => { learnStyle(e.target.files); e.target.value = ''; }} />
            </label>
            {styleState === 'error' && <p style={{ color: 'var(--warn)', fontSize: 12, marginTop: 8 }}>{styleMsg}</p>}
          </div>
          <div className="card set-card">
            <h3>플랜 · 크레딧 <a className="btn sm" href="/app/billing" style={{ marginLeft: 'auto' }}>플랜 · 결제 →</a></h3>
            <p className="sub">무료 플랜 — 가입 크레딧 20 (영상 2편). 무료 렌더에는 워터마크가 붙고, 편당 +5크레딧으로 제거하거나 구독하면 항상 제거돼요.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { c: 100, p: '₩4,900' },
                { c: 300, p: '₩12,900' },
                { c: 1000, p: '₩39,000' },
              ].map((pkg) => (
                <div key={pkg.c} style={{ flex: 1, minWidth: 100, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, textAlign: 'center' }}>
                  <b style={{ display: 'block' }}>{pkg.c}크레딧</b>
                  <span style={{ fontSize: 13, color: 'var(--sub)' }}>{pkg.p}</span>
                  <span className="badge dim" style={{ display: 'block', marginTop: 6 }}>충전 준비 중</span>
                </div>
              ))}
            </div>
            <div className="key-row" style={{ display: 'block' }}>
              <b>ElevenLabs {elExisting && <span className="badge ok">● 연결됨</span>}</b>
              <span className="mono" style={{ color: 'var(--faint)', display: 'block', marginBottom: 8 }}>프리미엄 보이스 — 연결하면 영상 만들기에서 EL 보이스 선택 가능</span>
              <form onSubmit={saveEl} style={{ display: 'flex', gap: 8 }}>
                <input type="password" placeholder={elExisting ? '새 키로 교체' : 'xi-...'} value={elKey} onChange={(e) => setElKey(e.target.value)} required />
                <button className="btn primary" style={{ flex: 'none' }} disabled={elStatus === 'saving'}>{elStatus === 'saving' ? '검증 중…' : elExisting ? '교체' : '연결'}</button>
                {elExisting && <button type="button" className="btn" style={{ flex: 'none' }} onClick={() => removeKey('elevenlabs')}>해제</button>}
              </form>
              {elStatus === 'error' && <p style={{ color: 'var(--warn)', fontSize: 12, marginTop: 6 }}>ElevenLabs가 키를 거부했어요.</p>}
              {elStatus === 'ok' && <p style={{ color: 'var(--ok)', fontSize: 12, marginTop: 6 }}>✓ 연결 완료</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
