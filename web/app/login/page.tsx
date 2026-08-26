'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'noenv'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) { setState('noenv'); return; }
    setState('sending');
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/app` },
    });
    setState(error ? 'error' : 'sent');
  }

  return (
    <div className="mk" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: 'min(420px, 92vw)' }}>
        <Link className="mlogo" href="/" style={{ justifyContent: 'center', display: 'flex', marginBottom: 26 }}>
          <span className="mlogo-mark">A</span>Autopilot
        </Link>
        <form className="signup" onSubmit={submit}>
          {state === 'sent' ? (
            <div className="thanks" style={{ display: 'block' }}>
              <div className="big">📮</div><b>메일을 확인해주세요</b>
              <p>{email} 로 로그인 링크를 보냈어요. 링크를 누르면 바로 시작됩니다.</p>
            </div>
          ) : (
            <>
              <label htmlFor="em">이메일로 시작하기 — 비밀번호 없이 로그인 링크를 보내드려요</label>
              <div className="row">
                <input id="em" type="email" required placeholder="you@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="mbtn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={state === 'sending'}>
                {state === 'sending' ? '보내는 중…' : '로그인 링크 받기'}
              </button>
              {state === 'error' && <p style={{ color: '#E0705F', fontSize: 13, marginTop: 10 }}>전송에 실패했어요. 잠시 후 다시 시도해주세요.</p>}
              {state === 'noenv' && <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 10 }}>아직 인증 서버가 연결되지 않았습니다 (Supabase 키 설정 필요). <Link href="/app" style={{ color: '#F0A03C' }}>둘러보기 모드로 계속 →</Link></p>}
            </>
          )}
          <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 14, textAlign: 'center' }}>
            계속하면 이용약관과 개인정보처리방침에 동의하게 됩니다
          </p>
        </form>
      </div>
    </div>
  );
}
