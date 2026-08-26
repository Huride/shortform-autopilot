'use client';
import { useState } from 'react';

type Msg = { who: 'me' | 'ai'; text: string };

export default function Workspace() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'ai', text: '안녕하세요! 채널 설정을 바꾸거나, 영상을 만들거나, 대본을 고치고 싶을 때 말씀해주세요. 예: “오늘 5G 요금제 개편으로 영상 만들어줘”' },
  ]);
  const [input, setInput] = useState('');

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const q = input.trim();
    setMsgs((m) => [...m, { who: 'me', text: q },
      { who: 'ai', text: '에이전트 백엔드는 다음 단계에서 연결됩니다 — 지금은 “새 영상 만들기”에서 대본 에디터를 써보세요. (요청 기억해둘게요: “' + q + '”)' }]);
    setInput('');
  }

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar">
        <h1><span className="crumb">채널 /</span> The Margin <span className="badge amber" style={{ marginLeft: 8 }}>에이전트 대기 중</span></h1>
        <a className="btn sm primary" href="/app/create">＋ 새 영상</a>
      </div>
      <div className="ws">
        <div className="chat">
          <div className="chat-scroll">
            {msgs.map((m, i) => (
              <div className={`msg ${m.who === 'me' ? 'user' : 'agent'}`} key={i}>
                <div className="avatar">{m.who === 'me' ? '나' : '✦'}</div>
                <div className="bubble"><p>{m.text}</p></div>
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={send}>
            <div className="composer-box">
              <span style={{ color: 'var(--accent)' }}>✦</span>
              <input placeholder="에이전트에게 말하기 — 주제, 대본 수정, 채널 톤 조정 무엇이든"
                value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="btn sm primary" style={{ flex: 'none' }}>보내기</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
