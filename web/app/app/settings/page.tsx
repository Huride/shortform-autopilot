'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export default function Settings() {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'none' | 'saving' | 'ok' | 'error'>('none');
  const [existing, setExisting] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('user_keys').select('provider, validated_at').eq('provider', 'openai').maybeSingle()
      .then(({ data }) => { if (data?.validated_at) setExisting(new Date(data.validated_at).toLocaleDateString('ko-KR')); });
  }, [status]);

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
