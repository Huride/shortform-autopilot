'use client';
import { useMemo, useState } from 'react';

type Scene = { role: string; narration: string; caption: string; emphasis: string; visual: string; bg: string };

const VISUALS = ['키워드 스탬프', '카운트업 통계', '인용 패널', 'VS 대비', '리스트', '차트'];
const BGS = ['생성 — 채널 아트', '실사 — 자동 검색', '내 에셋에서 선택…'];

const DRAFT: Scene[] = [
  { role: '훅', narration: '아이폰 신모델 가격, 이번엔 정말 오를 수밖에 없습니다. 이유는 세 가지입니다.', caption: '이번엔 정말 오른다', emphasis: '정말 오른다', visual: '키워드 스탬프', bg: '실사 — 자동 검색' },
  { role: '근거', narration: '첫째, 부품 원가입니다. 새 칩의 웨이퍼 단가는 전 세대보다 24% 올랐습니다.', caption: '① 부품 원가 +24%', emphasis: '+24%', visual: '카운트업 통계', bg: '생성 — 채널 아트' },
  { role: '반론', narration: '그런데 환율이 진짜 변수입니다. 작년 출시 때보다 원달러 환율이 9% 높습니다.', caption: '진짜 변수는 환율', emphasis: '환율', visual: '차트', bg: '생성 — 채널 아트' },
  { role: '결론', narration: '결론. 인상 폭은 계산상 최소 7%. 전작 할인을 노리는 게 계산이 맞습니다.', caption: '계산상 +7%, 전작이 답', emphasis: '+7%', visual: '카운트업 통계', bg: '생성 — 채널 아트' },
  { role: '시그니처', narration: '마케팅 말고 계산으로, 더 마진.', caption: '마케팅 말고 계산으로', emphasis: '', visual: '키워드 스탬프', bg: '생성 — 채널 아트' },
];

const SUGGESTIONS = [
  { t: '통신 3사, 5G 중간요금제 일제 개편', s: '“중간”이 정말 중간인지 계산해볼 만한 소재', src: '기사 4건 · 2시간 전' },
  { t: '배달앱 무료배달 종료 수순', s: '무료의 비용은 어디에 숨어 있었나', src: '기사 7건 · 5시간 전' },
  { t: '전기차 보조금 내년 32% 축소안', s: '지금 사야 하나 — 손익분기 계산형', src: '기사 3건 · 오늘 아침' },
];

function estimate(narration: string) { return narration.length / 5 / 1.2 + 0.35; }

export default function Create() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState('');
  const [scenes, setScenes] = useState<Scene[]>(DRAFT);
  const total = useMemo(() => scenes.reduce((a, s) => a + estimate(s.narration), 0), [scenes]);

  const set = (i: number, patch: Partial<Scene>) =>
    setScenes((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => setScenes((prev) => prev.filter((_, j) => j !== i));
  const add = () => setScenes((prev) => [...prev, { role: '추가 씬', narration: '', caption: '', emphasis: '', visual: VISUALS[0], bg: BGS[0] }]);
  const move = (i: number, dir: -1 | 1) => setScenes((prev) => {
    const j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar">
        <h1><span className="crumb">The Margin /</span> 새 영상 만들기</h1>
        <span className="badge dim">{step === 1 ? '1단계 · 주제' : '2단계 · 대본 수정'}</span>
      </div>
      <div className="content">
        {step === 1 ? (
          <div className="create-wrap">
            <div className="create-main">
              <div className="card topic-box">
                <label>무엇에 대한 영상인가요?</label>
                <textarea placeholder="주제를 한 줄로 적어주세요 — 예: 아이폰 신모델 가격, 오를까?" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select style={{ width: 'auto' }}><option>템플릿: 소비자 비판형 (채널 기본)</option><option>넘버 앵커형</option><option>브리핑형</option><option>팩트체크형</option><option>스토리텔링형</option></select>
                  <select style={{ width: 'auto' }}><option>길이: 표준 (45~60초)</option><option>짧게 (30초)</option><option>길게 (~90초)</option></select>
                  <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setStep(2)}>✦ 대본 만들기</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--faint)', margin: '12px 0 0' }}>링크를 붙여넣으면 그 기사를 소재로 씁니다 · 대본 생성은 무료, 크레딧은 렌더할 때만 사용돼요</p>
              </div>
              <div className="or" style={{ marginTop: 22 }}>오늘 뉴스에서 골라볼까요? — 채널 성향 기준 추천</div>
              <div className="sugg">
                {SUGGESTIONS.map((s) => (
                  <button key={s.t} className="sugg-card" onClick={() => { setTopic(s.t); setStep(2); }}>
                    <span><b>{s.t}</b><small>{s.s}</small></span><span className="src">{s.src}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="create-side">
              <div className="agent-aside" style={{ marginTop: 0 }}><div className="spark">✦</div><p><b>자동 편성과는 별개예요.</b> 매일 아침 편성은 그대로 돌아가고, 여기서 만든 영상은 추가로 만들어집니다.</p></div>
            </div>
          </div>
        ) : (
          <div className="create-wrap">
            <div className="create-main">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => setStep(1)}>← 주제 다시</button>
                <b style={{ fontSize: 15 }}>{topic || '아이폰 신모델, 가격이 오를 수밖에 없는 이유'}</b>
                <span className="badge ok">팩트 6개 · 출처 연결됨</span>
              </div>
              {scenes.map((s, i) => (
                <div className="card scene-card" key={i}>
                  <div className="scene-head">
                    <span className="grab" onClick={() => move(i, -1)} title="위로">▲</span>
                    <span className="grab" onClick={() => move(i, 1)} title="아래로">▼</span>
                    <b>씬 {i + 1} · {s.role}</b>
                    <span>{estimate(s.narration).toFixed(1)}초</span>
                    <span className="listen">▶ 미리듣기</span>
                    <span className="del" onClick={() => remove(i)}>✕</span>
                  </div>
                  <div className="scene-body">
                    <div>
                      <label>나레이션</label>
                      <textarea value={s.narration} onChange={(e) => set(i, { narration: e.target.value })} />
                    </div>
                    <div className="scene-meta">
                      <div><label>자막 (⏎로 줄바꿈 지정)</label><input value={s.caption} onChange={(e) => set(i, { caption: e.target.value })} /></div>
                      <div className="row2">
                        <div><label>강조어</label><input value={s.emphasis} onChange={(e) => set(i, { emphasis: e.target.value })} /></div>
                        <div><label>카드</label>
                          <select value={s.visual} onChange={(e) => set(i, { visual: e.target.value })}>
                            {VISUALS.map((v) => <option key={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                      <div><label>배경</label>
                        <select value={s.bg} onChange={(e) => set(i, { bg: e.target.value })}>
                          {BGS.map((b) => <option key={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button className="add-scene" onClick={add}>＋ 씬 추가</button>
            </div>
            <div className="create-side">
              <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
                <div className="sum-row"><span>씬</span><b>{scenes.length}개</b></div>
                <div className="sum-row"><span>예상 길이</span><b>{Math.round(total)}초</b></div>
                <div className="sum-row"><span>크레딧</span><b>10</b></div>
                <button className="btn primary" style={{ width: '100%', marginTop: 12 }}
                  onClick={() => alert('렌더 백엔드는 다음 단계(M1 코어 이식)에서 연결됩니다.')}>렌더 시작</button>
                <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setScenes(DRAFT)}>✦ 대본 전체 다시 생성</button>
              </div>
              <div className="card" style={{ padding: '16px 18px' }}>
                <label>에이전트에게 수정 요청</label>
                <div className="composer-box" style={{ padding: '8px 10px' }}><input placeholder="예: 전체 톤 더 부드럽게" /></div>
                <div className="hint-chips" style={{ marginTop: 10 }}>
                  {['더 짧게', '후킹 더 세게', '씬 3을 맨 앞으로'].map((h) => <span className="hint" key={h}>{h}</span>)}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '12px 0 0' }}>직접 고치든 에이전트에게 시키든, 팩트락은 유지돼요 — 출처 없는 숫자는 대본에 들어가지 않습니다.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
