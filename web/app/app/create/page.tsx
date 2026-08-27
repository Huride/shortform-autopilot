'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

type Visual = { kind: string; [k: string]: unknown } | undefined;
type Scene = { narration: string; caption: string; emphasis: string; visualLabel: string; visual?: Visual; bg?: string };

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
const OPENAI_VOICES = [
  { id: 'sage', name: 'Sage', d: '차분·신뢰 (기본류)' }, { id: 'alloy', name: 'Alloy', d: '중성·안정' },
  { id: 'ash', name: 'Ash', d: '단단한 남성' }, { id: 'onyx', name: 'Onyx', d: '낮고 묵직' },
  { id: 'echo', name: 'Echo', d: '서사적 남성' }, { id: 'fable', name: 'Fable', d: '따뜻한 이야기꾼' },
  { id: 'nova', name: 'Nova', d: '밝은 여성' }, { id: 'shimmer', name: 'Shimmer', d: '부드러운 여성' },
  { id: 'coral', name: 'Coral', d: '경쾌한 여성' }, { id: 'ballad', name: 'Ballad', d: '감성적' },
  { id: 'verse', name: 'Verse', d: '리듬감' },
];
const BGMS = [
  { id: '', name: '채널 기본', file: null },
  { id: 'bgm/pulse.wav', name: '펄스 — 비트감', file: 'bgm-pulse' },
  { id: 'bgm/calm.wav', name: '카름 — 차분', file: 'bgm-calm' },
  { id: 'bgm/land-red-0.mp3', name: 'Redline — 드라이브', file: 'bgm-red' },
  { id: 'bgm/land-ota-0.mp3', name: 'OTA Anthem — 웅장', file: 'bgm-ota' },
  { id: 'none', name: 'BGM 없음', file: null },
];
let previewAudio: HTMLAudioElement | null = null;
function playPreview(src: string) {
  if (previewAudio) { previewAudio.pause(); previewAudio = null; }
  previewAudio = new Audio(src);
  previewAudio.play();
}
const ART_STYLES = [
  { id: '', name: '채널 기본', desc: '템플릿 고유 아트' },
  { id: 'minimal', name: '미니멀', desc: '큰 도형 · 여백' },
  { id: 'ink', name: '잉크 일러스트', desc: '만평풍 펜 선' },
  { id: 'cinematic', name: '시네마틱', desc: '무드 · 빛줄기' },
  { id: 'watercolor', name: '수채화', desc: '번짐 · 종이 질감' },
  { id: 'neon', name: '네온 테크', desc: '빛나는 회로선' },
  { id: 'photo', name: '실사풍', desc: '사진 질감 · 인물 없음' },
];
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
  const [bgOpen, setBgOpen] = useState<number | null>(null);
  const [artStyle, setArtStyle] = useState('');
  const [artOpen, setArtOpen] = useState(false);
  const [voice, setVoice] = useState('');            // '' = 채널 기본
  const [voiceProvider, setVoiceProvider] = useState<'openai' | 'elevenlabs'>('openai');
  const [bgm, setBgm] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [elVoices, setElVoices] = useState<{ id: string; name: string; preview: string | null }[]>([]);
  const [brand, setBrand] = useState({ name: '', signoff: '', tagline: '' });
  const [brandRow, setBrandRow] = useState<string | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);

  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/elvoices', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.json()).then((j) => { if (j.ok) setElVoices(j.voices); }).catch(() => {});
    });
    sb.from('channels').select('id, config').eq('archived', false).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) { setBrandRow(data.id); setBrand({ name: data.config?.name ?? '', signoff: data.config?.signoff ?? '', tagline: data.config?.tagline ?? '' }); }
      });
  }, []);
  const [bgQuery, setBgQuery] = useState('');
  const [bgResults, setBgResults] = useState<{ url: string; thumb: string; title: string; license: string }[]>([]);
  const [bgSearching, setBgSearching] = useState(false);

  const [uploading, setUploading] = useState<number | null>(null);

  async function uploadBg(i: number, file: File) {
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    setUploading(i);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: fd });
      const j = await r.json();
      if (j.ok) { set(i, { bg: j.url }); setBgOpen(null); }
      else alert('업로드 실패: ' + j.error);
    } finally { setUploading(null); }
  }

  async function searchStock() {
    if (!bgQuery.trim()) return;
    setBgSearching(true); setBgResults([]);
    try {
      const r = await fetch(`/api/stock?q=${encodeURIComponent(bgQuery.trim())}`);
      const j = await r.json();
      setBgResults(j.results ?? []);
    } finally { setBgSearching(false); }
  }
  const [genError, setGenError] = useState('');
  const [factInfo, setFactInfo] = useState<{ facts: number; sources: number } | null>(null);
  const rawScript = useRef<Record<string, unknown>>({});
  const total = useMemo(() => scenes.reduce((a, s) => a + estimate(s.narration), 0), [scenes]);

  // 기존 잡 열기 (?job=<id>) — 렌더 후에도 대본을 다시 불러 수정·재렌더
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('job');
    if (!id) return;
    const sb = getSupabase(); if (!sb) return;
    sb.from('jobs').select('id, topic, status, script').eq('id', id).single().then(({ data: j }) => {
      if (!j?.script?.scenes) return;
      setJobId(j.id); setTopic(j.topic);
      rawScript.current = j.script;
      setFactInfo(j.script.factCount ? { facts: j.script.factCount, sources: (j.script.newsSources ?? []).length } : null);
      setTitle(j.script.title ?? j.topic);
      setHook(j.script.hook ?? '');
      setArtStyle(j.script.artStyle ?? '');
      setVoice(j.script.voice ?? ''); setVoiceProvider(j.script.voiceProvider ?? 'openai');
      setBgm(j.script.bgm ?? '');
      setScenes((j.script.scenes as any[]).map((s) => ({
        narration: s.narration ?? '', caption: s.caption ?? '', emphasis: s.emphasis ?? '',
        visualLabel: KIND2LABEL[s.visual?.kind] ?? '키워드 스탬프', visual: s.visual, bg: s.bg,
      })));
      setPhase('edit');
    });
  }, []);

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
        setFactInfo(j.script.factCount ? { facts: j.script.factCount, sources: (j.script.newsSources ?? []).length } : null);
        setTitle(j.script.title ?? topic);
        setHook(j.script.hook ?? '');
        setScenes((j.script.scenes as any[]).map((s) => ({
          narration: s.narration ?? '', caption: s.caption ?? '', emphasis: s.emphasis ?? '',
          visualLabel: KIND2LABEL[s.visual?.kind] ?? '키워드 스탬프', visual: s.visual, bg: s.bg,
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
    // 브랜딩 저장 (에디터에서 수정했을 수 있음)
    const bconfig = { name: brand.name.trim(), signoff: brand.signoff.trim(), tagline: brand.tagline.trim() };
    if (brandRow) await sb.from('channels').update({ config: bconfig }).eq('id', brandRow);
    else if (bconfig.name || bconfig.signoff || bconfig.tagline) {
      const { data: nb } = await sb.from('channels').insert({ user_id: session.user.id, config: bconfig }).select('id').single();
      if (nb) setBrandRow(nb.id);
    }
    const { data: prof } = await sb.from('profiles').select('credits').eq('id', session.user.id).single();
    if ((prof?.credits ?? 0) < 10) { alert('크레딧이 부족합니다.'); setBusy(false); return; }
    const outScenes = scenes.filter((s) => s.narration.trim()).map((s) => {
      const keepOriginal = s.visual && KIND2LABEL[(s.visual as any).kind] === s.visualLabel;
      return {
        narration: s.narration, caption: s.caption, emphasis: s.emphasis || undefined,
        visualLabel: s.visualLabel, visual: keepOriginal ? s.visual : undefined, bg: s.bg || undefined,
      };
    });
    const script = {
      ...rawScript.current, template, title: title || topic, hook, scenes: outScenes,
      artStyle: artStyle || undefined,
      voice: voice || undefined, voiceProvider: voice ? voiceProvider : undefined,
      bgm: bgm || undefined,
      approved: true,
    };
    const { error } = await sb.from('jobs').update({ script, status: 'scripted', error: null, video_url: null }).eq('id', jobId);
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
                <div className="card topic-box" style={{ textAlign: 'center', padding: '40px 40px 28px' }}>
                  <div className="spark-pulse" style={{ fontSize: 36, marginBottom: 10 }}>✦</div>
                  <b style={{ fontSize: 16 }}>에이전트가 대본을 쓰고 있어요<span className="dotty"><span>.</span><span>.</span><span>.</span></span></b>
                  <p style={{ color: 'var(--sub)', margin: '8px 0 22px' }}>“{topic}” — 채널 논조에 맞춰 씬을 구성합니다 (10~30초)</p>
                  {[0, 1, 2].map((k) => (
                    <div key={k} className="card" style={{ padding: '14px 16px', marginBottom: 10, textAlign: 'left', opacity: 1 - k * 0.25 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <span className="skel" style={{ width: 54, height: 10 }} />
                        <span className="skel" style={{ width: 30, height: 10 }} />
                      </div>
                      <div className="skel" style={{ width: '92%', marginBottom: 7 }} />
                      <div className="skel" style={{ width: `${74 - k * 12}%` }} />
                    </div>
                  ))}
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
                      <div><label>배경</label>
                        <button type="button" className="pickbtn" onClick={() => setBgOpen(bgOpen === i ? null : i)}>
                          <img src={!s.bg ? (artStyle ? `/ui/style-${artStyle}.jpg` : `/ui/bgart-${template}.jpg`) : s.bg.startsWith('http') ? s.bg.replace('/1600px-', '/480px-') : `/ui/bgart-${template}.jpg`} alt="" style={{ height: 30 }} />
                          {!s.bg ? `생성 — ${(ART_STYLES.find((a) => a.id === artStyle) ?? ART_STYLES[0]).name}` : s.bg === 'gen' ? '✨ 씬 전용 생성' : s.bg.includes('/assets/') ? '내 이미지' : s.bg.startsWith('http') ? '실사 (검색)' : '실사'}
                          <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {bgOpen === i && (
                    <div className="pickgrid" style={{ margin: '0 16px 14px', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
                      <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--sub)', fontWeight: 700 }}>✦ 생성 — 주제에 맞춰 새로 그립니다. 스타일을 고르세요 (영상 전체 공통)</div>
                      {ART_STYLES.map((a) => (
                        <button type="button" key={a.id || 'default'} className={`pickitem${!s.bg && artStyle === a.id ? ' sel' : ''}`}
                          onClick={() => { setArtStyle(a.id); set(i, { bg: undefined }); setBgOpen(null); }}>
                          <img src={a.id ? `/ui/style-${a.id}.jpg` : `/ui/bgart-${template}.jpg`} alt={a.name} style={{ aspectRatio: '9/16' }} />
                          <b>{a.name}</b><small>{a.desc}</small>
                        </button>
                      ))}
                      <button type="button" className={`pickitem${s.bg === 'gen' ? ' sel' : ''}`}
                        onClick={() => { set(i, { bg: 'gen' }); setBgOpen(null); }}>
                        <span style={{ aspectRatio: '9/16', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 7, marginBottom: 6, fontSize: 24 }}>✨</span>
                        <b>이 씬 전용 생성</b><small>이 씬의 내용으로 별도 이미지를 새로 그려요 (+이미지 1장)</small>
                      </button>
                      <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--sub)', fontWeight: 700, marginTop: 4 }}>📷 실사 · 내 이미지</div>
                      <label className="pickitem" style={{ cursor: 'pointer' }}>
                        <span style={{ aspectRatio: '9/16', display: 'grid', placeItems: 'center', background: 'var(--card2)', borderRadius: 7, marginBottom: 6, fontSize: 26 }}>
                          {uploading === i ? <span className="spinner" /> : '📤'}
                        </span>
                        <b>내 이미지</b><small>JPG·PNG 업로드 (8MB)</small>
                        <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBg(i, f); e.target.value = ''; }} />
                      </label>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input placeholder="실사 검색 — 영어 키워드가 정확해요 (예: subway station)" value={bgQuery}
                          onChange={(e) => setBgQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchStock(); } }} />
                        <button type="button" className="btn sm primary" style={{ flex: 'none' }} onClick={searchStock} disabled={bgSearching}>
                          {bgSearching ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '🔍 검색'}
                        </button>
                      </div>
                      {bgResults.map((r) => (
                        <button type="button" key={r.url} className={`pickitem${s.bg === r.url ? ' sel' : ''}`}
                          onClick={() => { set(i, { bg: r.url }); setBgOpen(null); }}>
                          <img src={r.thumb} alt={r.title} style={{ aspectRatio: '9/16' }} />
                          <b style={{ fontSize: 10.5 }}>{r.title.slice(0, 22)}</b><small>{r.license}</small>
                        </button>
                      ))}
                      {bgResults.length === 0 && bgQuery && !bgSearching && (
                        <p style={{ gridColumn: '1 / -1', color: 'var(--faint)', fontSize: 12, margin: 0 }}>상업 사용 가능한 결과만 보여줘요 — 다른 키워드로 시도해보세요</p>
                      )}
                    </div>
                  )}
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
              <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
                <label>생성 배경 아트 스타일</label>
                <button type="button" className="pickbtn" onClick={() => setArtOpen(!artOpen)}>
                  <img src={artStyle ? `/ui/style-${artStyle}.jpg` : `/ui/bgart-${template}.jpg`} alt="" />
                  {(ART_STYLES.find((a) => a.id === artStyle) ?? ART_STYLES[0]).name}
                  <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                </button>
                {artOpen && (
                  <div className="pickgrid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(2,1fr)' }}>
                    {ART_STYLES.map((a) => (
                      <button type="button" key={a.id} className={`pickitem${artStyle === a.id ? ' sel' : ''}`}
                        onClick={() => { setArtStyle(a.id); setArtOpen(false); }}>
                        <img src={a.id ? `/ui/style-${a.id}.jpg` : `/ui/bgart-${template}.jpg`} alt={a.name} />
                        <b>{a.name}</b><small>{a.desc}</small>
                      </button>
                    ))}
                  </div>
                )}
                {scenes.every((s) => s.bg) ? (
                  <p style={{ fontSize: 11, color: 'var(--warn)', margin: '10px 0 0' }}>⚠ 지금은 모든 씬이 실사 배경이라 생성 아트가 쓰이지 않아요. 씬 배경을 '채널 아트'로 바꾸면 적용됩니다.</p>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--faint)', margin: '10px 0 0' }}>'채널 아트' 배경인 씬 {scenes.filter((s) => !s.bg).length}개에 적용 — 렌더 때 주제에 맞춰 이 스타일로 새로 그립니다.</p>
                )}
              </div>
              <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
                <button type="button" className="pickbtn" onClick={() => setBrandOpen(!brandOpen)}>
                  🏷 브랜딩 — {brand.name || '템플릿 기본'}
                  <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                </button>
                {brandOpen && (
                  <div style={{ marginTop: 10 }}>
                    <div className="field" style={{ marginBottom: 10 }}><label>채널 이름 (아웃트로)</label>
                      <input value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} placeholder="템플릿 기본" /></div>
                    <div className="field" style={{ marginBottom: 10 }}><label>시그니처 멘트 (마지막 문장)</label>
                      <input value={brand.signoff} onChange={(e) => setBrand({ ...brand, signoff: e.target.value })} placeholder="템플릿 기본" /></div>
                    <div className="field" style={{ marginBottom: 6 }}><label>태그라인 (워터마크)</label>
                      <input value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} placeholder="템플릿 기본" /></div>
                    <p style={{ fontSize: 11, color: 'var(--faint)', margin: 0 }}>렌더 시 저장·적용돼요. 시그니처를 바꿨다면 마지막 씬의 문장도 같이 고쳐주세요 — 문장이 달라도 아웃트로는 정상 표시됩니다.</p>
                  </div>
                )}
              </div>
              <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
                <label>목소리</label>
                <button type="button" className="pickbtn" onClick={() => setVoiceOpen(!voiceOpen)}>
                  🎙 {voice ? (voiceProvider === 'elevenlabs' ? (elVoices.find((v) => v.id === voice)?.name ?? 'ElevenLabs') : (OPENAI_VOICES.find((v) => v.id === voice)?.name ?? voice)) : '채널 기본'}
                  <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                </button>
                {voiceOpen && (
                  <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                    <button type="button" className="nav-item" style={{ width: '100%', color: 'var(--ink)' }} onClick={() => { setVoice(''); setVoiceOpen(false); }}>채널 기본</button>
                    {OPENAI_VOICES.map((v) => (
                      <div key={v.id} className="nav-item" style={{ width: '100%', color: voice === v.id && voiceProvider === 'openai' ? 'var(--accent)' : 'var(--ink)', cursor: 'pointer' }}
                        onClick={() => { setVoice(v.id); setVoiceProvider('openai'); setVoiceOpen(false); }}>
                        <span className="play" onClick={(e) => { e.stopPropagation(); playPreview(`/ui/voice-${v.id}.mp3`); }}>▶</span>
                        <span>{v.name} <small style={{ color: 'var(--faint)' }}>{v.d}</small></span>
                      </div>
                    ))}
                    {elVoices.length > 0 && <div className="nav-sec">ElevenLabs</div>}
                    {elVoices.map((v) => (
                      <div key={v.id} className="nav-item" style={{ width: '100%', color: voice === v.id && voiceProvider === 'elevenlabs' ? 'var(--accent)' : 'var(--ink)', cursor: 'pointer' }}
                        onClick={() => { setVoice(v.id); setVoiceProvider('elevenlabs'); setVoiceOpen(false); }}>
                        {v.preview ? <span className="play" onClick={(e) => { e.stopPropagation(); playPreview(v.preview!); }}>▶</span> : <span style={{ width: 26 }} />}
                        <span>{v.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ marginTop: 12 }}>BGM</label>
                {BGMS.map((b) => (
                  <div key={b.id || b.name} className="nav-item" style={{ width: '100%', padding: '6px 8px', color: bgm === b.id ? 'var(--accent)' : 'var(--ink)', cursor: 'pointer' }}
                    onClick={() => setBgm(b.id)}>
                    {b.file ? <span className="play" onClick={(e) => { e.stopPropagation(); playPreview(`/ui/${b.file}.mp3`); }}>▶</span> : <span style={{ width: 26 }} />}
                    <span style={{ fontSize: 13 }}>{b.name}</span>
                  </div>
                ))}
              </div>
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
