'use client';
import { useState } from 'react';
import Vid from '@/components/Vid';

const VIDEOS = [
  { k: 'brief', title: '8월 26일, 오늘 꼭 알아야 할 3가지', d: '오늘 · 쓰리씽', len: '0:34' },
  { k: 'critic', title: '수수료는 내렸는데 앱 가격은 왜 그대로일까', d: '오늘 · 더 마진', len: '0:36' },
  { k: 'number', title: '오늘의 숫자 4.2% — 파킹통장 갈아탈 타이밍', d: '어제 · 넘버스', len: '0:33' },
  { k: 'fact', title: '라면값 다음 달 일제 인상? 팩트체크', d: '어제 · 진짜야?', len: '0:35' },
  { k: 'story', title: '1위 회사는 어쩌다 사라졌나 — 그리고 부활했나', d: '8월 25일 · 그때 그 회사', len: '0:39' },
];

export default function Library() {
  const [tab, setTab] = useState(0);
  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar"><h1>보관함</h1>
        <a className="btn sm primary" href="/app/create">＋ 새 영상</a>
      </div>
      <div className="content">
        <div className="tabs">
          {['완성 영상', '진행 중', '채널', '에셋'].map((t, i) => (
            <button key={t} className={`tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{t}
              <span className="cnt">{[5, 0, 5, 8][i]}</span>
            </button>
          ))}
        </div>
        {tab === 0 && (
          <>
            <div className="vid-grid">
              {VIDEOS.map((v) => (
                <div className="vid-card" key={v.k}>
                  <div className="thumb" style={{ padding: 0, background: '#0A101F' }}>
                    <Vid src={`/media/tpl-${v.k}-web.mp4`} poster={`/media/poster-${v.k}.jpg`} />
                  </div>
                  <div className="vid-meta"><b>{v.title}</b>
                    <div className="row"><span className="d">{v.d}</span>
                      <a className="btn sm" href={`/media/tpl-${v.k}-web.mp4`} download>⬇ 저장</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 18 }}>둘러보기 모드 — 템플릿 샘플 영상이 표시됩니다. 로그인하면 내 영상이 보여요.</p>
          </>
        )}
        {tab === 1 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>진행 중인 렌더가 없습니다 — <a href="/app/create" style={{ color: 'var(--accent)' }}>새 영상을 만들어보세요</a></div>}
        {tab === 2 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>템플릿 채널 5종이 준비되어 있어요. 로그인 후 내 채널로 복제할 수 있습니다.</div>}
        {tab === 3 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>업로드 이미지 · 생성된 배경 · 사용한 스톡이 여기에 모입니다.</div>}
      </div>
    </section>
  );
}
