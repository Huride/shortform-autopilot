'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

type Action = { type: string; label: string; href?: string };
type Msg = { who: 'me' | 'ai'; text: string; actions?: Action[] };

const HINTS = ['배달앱 무료배달 종료로 영상 만들어줘', '내 영상 진행 상황 알려줘', '방금 대본 초보자 눈높이로 다시 써줘', '채널 이름을 지갑수비대로 바꿔줘'];

/**
 * 워크스페이스 — 도구 호출 에이전트 (/api/agent). 사용자 OpenAI 키로 동작하고,
 * 키가 없으면 설정 페이지로 보낸다.
 */
export default function Workspace() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'ai', text: '안녕하세요. 영상을 만들거나, 진행 상황을 묻거나, 대본을 다시 쓰게 하거나, 채널 브랜딩을 바꿀 수 있어요. 예: "5G 중간요금제 개편으로 영상 만들어줘"' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelName, setChannelName] = useState('내 채널');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    sb.from('channels').select('config').eq('archived', false).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => { if (data?.config?.name) setChannelName(data.config.name); });
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { router.push('/login'); return; }
    const next: Msg[] = [...msgs, { who: 'me', text: q }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const history = next.filter((m) => m.text).map((m) => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
      const r = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: history }),
      });
      const j = await r.json();
      if (j.needKey) {
        setMsgs((m) => [...m, { who: 'ai', text: j.reply, actions: [{ type: 'key', label: 'OpenAI 키 연결하기', href: '/app/settings' }] }]);
        setTimeout(() => router.push('/app/settings'), 1800);
        return;
      }
      if (!j.ok) { setMsgs((m) => [...m, { who: 'ai', text: '지금은 응답을 만들지 못했어요. 잠시 후 다시 시도해주세요. (' + (j.error ?? 'error') + ')' }]); return; }
      setMsgs((m) => [...m, { who: 'ai', text: j.reply, actions: j.actions }]);
    } catch {
      setMsgs((m) => [...m, { who: 'ai', text: '연결에 실패했어요. 잠시 후 다시 시도해주세요.' }]);
    } finally { setBusy(false); }
  }

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar">
        <h1><span className="crumb">채널 /</span> {channelName} <span className="badge amber" style={{ marginLeft: 8 }}>에이전트 베타</span></h1>
        <a className="btn sm primary" href="/app/create">＋ 새 영상</a>
      </div>
      <div className="ws">
        <div className="chat">
          <div className="chat-scroll" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div className={`msg ${m.who === 'me' ? 'user' : 'agent'}`} key={i}>
                <div className="avatar">{m.who === 'me' ? '나' : '✦'}</div>
                <div className="bubble">
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
                  {m.actions?.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {m.actions.map((a, k) => (
                        <a key={k} href={a.href} className="btn sm" style={{ display: 'inline-flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                          <span>✦ {a.label}</span><span style={{ color: 'var(--accent)' }}>{a.type === 'key' ? '설정 →' : a.type === 'brand' ? '설정 →' : '에디터 →'}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && (
              <div className="msg agent"><div className="avatar">✦</div><div className="bubble"><p className="dotty">생각 중</p></div></div>
            )}
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <div className="composer-box">
              <span style={{ color: 'var(--accent)' }}>✦</span>
              <input placeholder="에이전트에게 말하기 — 주제, 진행 상황, 대본 수정, 브랜딩 무엇이든"
                value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
              <button className="btn sm primary" style={{ flex: 'none' }} disabled={busy || !input.trim()}>보내기</button>
            </div>
            <div className="hint-chips">
              {HINTS.map((h) => <button type="button" key={h} className="hint" onClick={() => send(h)} disabled={busy}>{h}</button>)}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
