'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

type Visual = { kind: string; [k: string]: unknown } | undefined;
type Scene = { narration: string; caption: string; emphasis: string; visualLabel: string; visual?: Visual };

const KIND2LABEL: Record<string, string> = {
  keyword: '키워드 스탬프', stat: '카운트업 통계', quote: '인용 패널',
  contrast: 'VS 대비', list: '리스트', chart: '차트', logo: '로고 카드', logos: '로고 카드',
};
const CARD_PICK = [
  { label: '키워드 스탬프', img: 'keyword', desc: '핵심 한 마디를 크게' },
  { label: '카운트업 통계', img: 'stat', desc: '숫자가 주인공일 때' },
  { label: '인용 패널', img: 'quote', desc: '발언·문구를 보여줄 때' },
  { label: 'VS 대비', img: 'contrast', desc: '둘을 비교할 때' },
  { label: '리스트', img: 'list', desc: '나열이 핵심일 때' },
  { label: '차트', img: 'chart', desc: '추세를 보여줄 때' },
];
const VISUAL_LABELS = CARD_PICK.map((c) => c.label);
const TEMPLATES = [
  { id: 'tpl-critic', name: '소비자 비판형', emph: 'box', emphName: '라벨 강조' },
  { id: 'tpl-number', name: '넘버 앵커형', emph: 'glow', emphName: '네온 강조' },
  { id: 'tpl-brief', name: '브리핑형', emph: 'underline', emphName: '밑줄 강조' },
  { id: 'tpl-fact', name: '팩트체크형', emph: 'chip', emphName: '도장 강조' },
  { id: 'tpl-story', name: '스토리텔링형', emph: 'color', emphName: '색상 강조' },
];
const SUGGESTIONS = [
  { t: '통신 3사, 5G 중간요금제 일제 개편', s: '“중간”이 정말 중간인지 계산해볼 만한 소재' },
  { t: '배달앱 무료배달 종료 수순', s: '무료의 비용은 어디에 숨어 있었나' },
  { t: '전기차 보조금 내년 32% 축소안', s: '지금 사야 하나 — 손익분기 계산형' },
];

function estimate(n: string) { return n.length / 5 / 1.2 + 0.35; }

export default function Create() {
  const [phase, setPhase] = useState<'topic' | 'generating' | 'edit'>('topic');
  const [topic, setTopic] = useState('');
  const [template, setTemplate] = useState('tpl-critic');
  const [jobId, setJobId] = useState<string | null>(null);
  const [hook, setHook] = useState('');
  const [title, setTitle] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState<number | null>(null);
  const [genError, setGenError] = useState('');
  const rawScript = useRef<Record<string, unknown>>({});
  const total = useMemo(() => scenes.reduce((a, s) => a + estimate(s.narration), 0), [scenes]);

  // 생성 폴링 — pending → scripted 가 되면 대본을 에디터로 싣는다
  useEffect(() => {
    if (phase !== 'generating' || !jobId) return;
    const sb = getSupabase(); if (!sb) return;
    const t = setInterval(async () => {
      const { data: j } = await sb.from('jobs').select('status, script, error').eq('id', jobId).single();
      if (!j) return;
      if (j.status === 'scripted' && j.script?.scenes) {
        clearInterval(t);
        rawScript.current = j.script;
        setTitle(j.script.title ?? topic);
        setHook(j.script.hook ?? '');
        setScenes((j.script.scenes as any[]).map((s) => ({
          narration: s.narration ?? '', caption: s.caption ?? '', emphasis: s.emphasis ?? '',
          visualLabel: KIND2LABEL[s.visual?.kind] ?? '키워드 스탬프', visual: s.visual,
        })));
        setPhase('edit');
      } else if (j.status === 'failed') {
        clearInterval(t);
        setGenError(j.error ?? '대본 생성에 실패했어요.');
        setPhase('topic');
      }
    }, 2500);
    return () => clearInterval(t);
  }, [phase, jobId, topic]);

  async function startGenerate(tpc: string) {
    const sb = getSupabase();
    if (!sb) { alert('인증 서버가 연결되지 않았습니다.'); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/login'; return; }
    setGenError(''); setTopic(tpc); setPhase('generating');
    const { data, error } = await sb.from('jobs')
      .insert({ user_id: session.user.id, topic: tpc, status: 'pending', script: { template } })
      .select('id').single();
    if (error || !data) { setGenError('접수 실패: ' + error?.message); setPhase('topic'); return; }
    setJobId(data.id);
  }

  async function approveRender() {
    const sb = getSupabase(); if (!sb || !jobId) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/login'; return; }
    setBusy(true);
    const { data: prof } = await sb.from('profiles').select('credits').eq('id', session.user.id).single();
    if ((prof?.credits ?? 0) < 10) { alert('크레딧이 부족합니다.'); setBusy(false); return; }
    const outScenes = scenes.filter((s) => s.narration.trim()).map((s) => {
      const keepOriginal = s.visual && KIND2LABEL[(s.visual as any).kind] === s.visualLabel;
      return {
        narration: s.narration, caption: s.caption, emphasis: s.emphasis || undefined,
        visualLabel: s.visualLabel, visual: keepOriginal ? s.visual : undefined,
      };
    });
    const script = { ...rawScript.current, template, title: title || topic, hook, scenes: outScenes, approved: true };
    const { error } = await sb.from('jobs').update({ script }).eq('id', jobId);
    if (error) { alert('저장 실패: ' + error.message); setBusy(false); return; }
    await sb.from('profiles').update({ credits: (prof!.credits as number) - 10 }).eq('id', session.user.id);
    location.href = '/app/library?tab=1';
  }

  const set = (i: number, patch: Partial<Scene>) => setScenes((p) => p.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => setScenes((p) => p.filter((_, j) => j !== i));
  const add = () => setScenes((p) => [...p, { narration: '', caption: '', emphasis: '', visualLabel: VISUAL_LABELS[0] }]);
  const move = (i: number, d: -1 | 1) => setScenes((p) => {
    const j = i + d; if (j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar">
        <h1><span className="crumb">새 영상 /</span> {phase === 'edit' ? '대본 수정' : '주제'}</h1>
        <span className="badge dim">{phase === 'generating' ? '대본 작성 중' : phase === 'edit' ? '2단계' : '1단계'}</span>
      </div>
      <div className="content">
        {phase !== 'edit' ? (
          <div className="create-wrap">
            <div className="create-main">
              {phase === 'generating' ? (
                <div className="card topic-box" style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>✦</div>
                  <b style={{ fontSize: 16 }}>에이전트가 대본을 쓰고 있어요…</b>
                  <p style={{ color: 'var(--sub)', margin: '8px 0 0' }}>“{topic}” — 채널 논조에 맞춰 씬을 구성합니다 (10~30초)</p>
                </div>
              ) : (
                <>
                  <div className="card topic-box">
                    <label>무엇에 대한 영상인가요?</label>
                    <textarea placeholder="주제를 한 줄로 적어주세요 — 예: 아이폰 신모델 가격, 오를까?" value={topic} onChange={(e) => setTopic(e.target.value)} />
                    <label style={{ marginTop: 16 }}>템플릿 — 왼쪽은 실제 렌더, 오른쪽은 자막 강조 스타일</label>
                    <div className="tplpick">
                      {TEMPLATES.map((t) => (
                        <button type="button" key={t.id} className={`pickitem${template === t.id ? ' sel' : ''}`} onClick={() => setTemplate(t.id)}>
                          <span className="duo">
                            <img src={`/media/poster-${t.id.replace('tpl-', '')}.jpg`} alt="" />
                            <img src={`/ui/emph-${t.emph}.jpg`} alt="" />
                          </span>
                          <b>{t.name}</b><small>{t.emphName}</small>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', marginTop: 16 }}>
                      <button className="btn primary" style={{ marginLeft: 'auto' }} disabled={!topic.trim()} onClick={() => startGenerate(topic.trim())}>✦ 대본 만들기</button>
                    </div>
                    {genError && <p style={{ color: 'var(--warn)', fontSize: 13, marginTop: 10 }}>{genError}</p>}
                    <p style={{ fontSize: 12, color: 'var(--faint)', margin: '12px 0 0' }}>대본 생성은 무료 · 크레딧은 렌더할 때만 사용돼요 (1편 = 10)</p>
                  </div>
                  <div className="or" style={{ marginTop: 22 }}>이런 주제는 어때요?</div>
                  <div className="sugg">
                    {SUGGESTIONS.map((s) => (
                      <button key={s.t} className="sugg-card" onClick={() => startGenerate(s.t)}>
                        <span><b>{s.t}</b><small>{s.s}</small></span><span className="src">추천</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="create-side">
              <div className="agent-aside" style={{ marginTop: 0 }}><div className="spark">✦</div><p>대본은 채널 논조와 팩트락 규칙으로 작성돼요. 마음에 안 들면 씬 단위로 직접 고칠 수 있습니다.</p></div>
            </div>
          </div>
        ) : (
          <div className="create-wrap">
            <div className="create-main">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => { setPhase('topic'); setJobId(null); }}>← 새 주제</button>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, fontWeight: 700, minWidth: 240 }} />
              </div>
              <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ margin: 0, flex: 'none' }}>후킹 문구 (첫 화면)</label>
                <input value={hook} onChange={(e) => setHook(e.target.value)} style={{ flex: 1 }} />
              </div>
              {scenes.map((s, i) => (
                <div className="card scene-card" key={i}>
                  <div className="scene-head">
                    <span className="grab" onClick={() => move(i, -1)} title="위로">▲</span>
                    <span className="grab" onClick={() => move(i, 1)} title="아래로">▼</span>
                    <b>씬 {i + 1}</b>
                    <span>{estimate(s.narration).toFixed(1)}초</span>
                    <span className="del" onClick={() => remove(i)}>✕</span>
                  </div>
                  <div className="scene-body">
                    <div><label>나레이션</label><textarea value={s.narration} onChange={(e) => set(i, { narration: e.target.value })} /></div>
                    <div className="scene-meta">
                      <div><label>자막 (⏎로 줄바꿈 지정)</label><input value={s.caption} onChange={(e) => set(i, { caption: e.target.value })} /></div>
                      <div className="row2">
                        <div><label>강조어</label><input value={s.emphasis} onChange={(e) => set(i, { emphasis: e.target.value })} /></div>
                        <div><label>카드</label>
                          <button type="button" className="pickbtn" onClick={() => setPickOpen(pickOpen === i ? null : i)}>
                            <img src={`/ui/card-${(CARD_PICK.find((c) => c.label === s.visualLabel) ?? CARD_PICK[0]).img}.jpg`} alt="" />
                            {s.visualLabel} <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {pickOpen === i && (
                    <div className="pickgrid" style={{ margin: '0 16px 14px' }}>
                      {CARD_PICK.map((c) => (
                        <button type="button" key={c.label} className={`pickitem${s.visualLabel === c.label ? ' sel' : ''}`}
                          onClick={() => { set(i, { visualLabel: c.label }); setPickOpen(null); }}>
                          <img src={`/ui/card-${c.img}.jpg`} alt={c.label} />
                          <b>{c.label}</b><small>{c.desc}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button className="add-scene" onClick={add}>＋ 씬 추가</button>
            </div>
            <div className="create-side">
              <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
                <div className="sum-row"><span>씬</span><b>{scenes.length}개</b></div>
                <div className="sum-row"><span>예상 길이</span><b>{Math.round(total)}초</b></div>
                <div className="sum-row"><span>크레딧</span><b>10</b></div>
                <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={approveRender}>
                  {busy ? '접수 중…' : '렌더 시작 (10크레딧)'}
                </button>
              </div>
              <div className="card" style={{ padding: '16px 18px' }}>
                <p style={{ fontSize: 12.5, color: 'var(--sub)', margin: 0 }}>💡 카드 종류를 바꾸면 원본 데이터 대신 자막·강조어 기반의 기본 카드로 렌더됩니다. 원래 카드가 좋으면 그대로 두세요.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
