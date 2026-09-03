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
  { id: 'cartoon', name: '만평', desc: '한 컷 풍자 · 한글 문구 자동 검수' },
];
const TEMPLATES = [
  { id: 'tpl-critic', name: '소비자 비판형', emph: 'box', emphName: '라벨 강조' },
  { id: 'tpl-number', name: '넘버 앵커형', emph: 'glow', emphName: '네온 강조' },
  { id: 'tpl-brief', name: '브리핑형', emph: 'underline', emphName: '밑줄 강조' },
  { id: 'tpl-fact', name: '팩트체크형', emph: 'chip', emphName: '도장 강조' },
  { id: 'tpl-story', name: '스토리텔링형', emph: 'color', emphName: '색상 강조' },
];
// 템플릿 기본 색상 — 색상 톤 피커의 '기본' 스와치 미리보기용 (channels/*.json theme 과 동일)
const TPL_COLORS: Record<string, { bg: string; accent: string }> = {
  'tpl-critic': { bg: '#221A0E', accent: '#F59E0B' },
  'tpl-number': { bg: '#101B33', accent: '#F0A03C' },
  'tpl-brief': { bg: '#0E2018', accent: '#4CC490' },
  'tpl-fact': { bg: '#200F1B', accent: '#E879A6' },
  'tpl-story': { bg: '#0F1830', accent: '#7DD3FC' },
};
const COLOR_TONES = [
  { name: '딥 네이비', bg: '#0B1526', accent: '#4C9AFF' },
  { name: '블랙 골드', bg: '#121212', accent: '#E3B341' },
  { name: '포레스트', bg: '#0E1F18', accent: '#4ADE80' },
  { name: '와인', bg: '#26101A', accent: '#F472B6' },
  { name: '슬레이트', bg: '#1A1D24', accent: '#94A3B8' },
  { name: '바이올렛', bg: '#171130', accent: '#A78BFA' },
  { name: '크림슨', bg: '#1F0D0D', accent: '#F87171' },
  { name: '아이보리 라이트', bg: '#F4EFE6', accent: '#C2410C' },
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
  const [colors, setColors] = useState<{ bg: string; accent: string } | null>(null); // null = 템플릿 기본
  const [colorOpen, setColorOpen] = useState(false);
  const [outroOn, setOutroOn] = useState(true);
  const [outroTagline, setOutroTagline] = useState(true);
  const [outroBg, setOutroBg] = useState(''); // '' = 테마 기본, 'art' = 생성 아트, url = 업로드 이미지
  const [outroUploading, setOutroUploading] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [savedMsg, setSavedMsg] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenNote, setRegenNote] = useState('');
  const [refUrls, setRefUrls] = useState<string[]>(['']);
  const [plan, setPlan] = useState('free');
  const [noWm, setNoWm] = useState(false); // 무료 플랜: 워터마크 제거 옵션 (+5cr)
  const [styleProfile, setStyleProfile] = useState<{ bg: string; accent: string; mood?: string; artDirection?: string } | null>(null);
  const fullConfig = useRef<Record<string, unknown>>({}); // 브랜딩 저장 시 styleProfile 등 다른 config 를 지우지 않기 위한 원본

  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/elvoices', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.json()).then((j) => { if (j.ok) setElVoices(j.voices); }).catch(() => {});
    });
    sb.from('channels').select('id, config').eq('archived', false).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBrandRow(data.id);
          fullConfig.current = data.config ?? {};
          setBrand({ name: data.config?.name ?? '', signoff: data.config?.signoff ?? '', tagline: data.config?.tagline ?? '' });
          if (data.config?.styleProfile?.bg) setStyleProfile(data.config.styleProfile);
        }
      });
    sb.from('profiles').select('plan').maybeSingle().then(({ data }) => { if (data?.plan) setPlan(data.plan); });
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

  async function uploadOutroBg(file: File) {
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    setOutroUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: fd });
      const j = await r.json();
      if (j.ok) setOutroBg(j.url);
      else alert('업로드 실패: ' + j.error);
    } finally { setOutroUploading(false); }
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
      setColors(j.script.colors ?? null);
      const oc = j.script.outro ?? {};
      setOutroOn(oc.enabled !== false); setOutroTagline(oc.tagline !== false); setOutroBg(oc.bg ?? '');
      setWatermark(j.script.watermark !== false);
      setNoWm(j.script.noWatermark === true);
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
    setColors(null); setOutroOn(true); setOutroTagline(true); setOutroBg(''); setWatermark(true);
    const refs = refUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
    const { data, error } = await sb.from('jobs')
      .insert({ user_id: session.user.id, topic: tpc, status: 'pending', script: { template, ...(refs.length ? { refUrls: refs } : {}) } })
      .select('id').single();
    if (error || !data) { setGenError('접수 실패: ' + error?.message); setPhase('topic'); return; }
    setJobId(data.id);
  }

  // 에디터 상태 → 잡 script JSON. 저장·렌더·재생성이 같은 조립을 쓴다.
  function buildScript() {
    const outScenes = scenes.filter((s) => s.narration.trim()).map((s) => {
      const keepOriginal = s.visual && KIND2LABEL[(s.visual as any).kind] === s.visualLabel;
      return {
        narration: s.narration, caption: s.caption, emphasis: s.emphasis || undefined,
        visualLabel: s.visualLabel, visual: keepOriginal ? s.visual : undefined, bg: s.bg || undefined,
      };
    });
    return {
      ...rawScript.current, template, title: title || topic, hook, scenes: outScenes,
      artStyle: artStyle || undefined,
      voice: voice || undefined, voiceProvider: voice ? voiceProvider : undefined,
      bgm: bgm || undefined,
      colors: colors ?? undefined,
      outro: { enabled: outroOn, tagline: outroTagline, bg: (outroOn && outroBg) || undefined },
      watermark,
      noWatermark: (plan === 'free' && noWm) || undefined,
    };
  }

  async function saveBranding(sb: NonNullable<ReturnType<typeof getSupabase>>, userId: string) {
    const bconfig = { ...fullConfig.current, name: brand.name.trim(), signoff: brand.signoff.trim(), tagline: brand.tagline.trim() };
    if (brandRow) await sb.from('channels').update({ config: bconfig }).eq('id', brandRow);
    else if (bconfig.name || bconfig.signoff || bconfig.tagline) {
      const { data: nb } = await sb.from('channels').insert({ user_id: userId, config: bconfig }).select('id').single();
      if (nb) setBrandRow(nb.id);
    }
  }

  // 렌더 없이 대본만 저장 — 크레딧 차감 없음, 상태·완성 영상은 그대로 둔다.
  async function saveDraft() {
    const sb = getSupabase(); if (!sb || !jobId) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/login'; return; }
    setBusy(true);
    await saveBranding(sb, session.user.id);
    const { error } = await sb.from('jobs').update({ script: { ...buildScript(), approved: false } }).eq('id', jobId);
    setBusy(false);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500);
  }

  // 방향 코멘트와 함께 대본을 처음부터 다시 쓴다. 스타일·색상 등 설정은 유지.
  async function regenerate() {
    const sb = getSupabase(); if (!sb || !jobId) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/login'; return; }
    setBusy(true);
    const { scenes: _s, title: _t, hook: _h, ...settings } = buildScript() as any;
    const script = { ...settings, regenerateNote: regenNote.trim() || undefined, approved: false };
    const { error } = await sb.from('jobs').update({ script, status: 'pending', error: null }).eq('id', jobId);
    setBusy(false);
    if (error) { alert('재생성 접수 실패: ' + error.message); return; }
    setRegenOpen(false); setRegenNote('');
    setPhase('generating');
  }

  async function approveRender() {
    const sb = getSupabase(); if (!sb || !jobId) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/login'; return; }
    setBusy(true);
    await saveBranding(sb, session.user.id);
    const cost = 10 + (plan === 'free' && noWm ? 5 : 0);
    const { data: prof } = await sb.from('profiles').select('credits').eq('id', session.user.id).single();
    if ((prof?.credits ?? 0) < cost) { alert('크레딧이 부족합니다.'); setBusy(false); return; }
    const script = { ...buildScript(), approved: true };
    const { error } = await sb.from('jobs').update({ script, status: 'scripted', error: null, video_url: null }).eq('id', jobId);
    if (error) { alert('저장 실패: ' + error.message); setBusy(false); return; }
    await sb.from('profiles').update({ credits: (prof!.credits as number) - cost }).eq('id', session.user.id);
    location.href = '/app/library?tab=1';
  }

  // 스타일 학습을 마친 사용자는 '내 브랜드' 아트 스타일을 고를 수 있다 (워커가 artDirection 으로 사용)
  const artOptions = useMemo(() => [
    ART_STYLES[0]!,
    ...(styleProfile?.artDirection ? [{ id: 'brand', name: '🎨 내 브랜드', desc: styleProfile.mood || '학습된 스타일' }] : []),
    ...ART_STYLES.slice(1),
  ], [styleProfile]);

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
                    <label style={{ marginTop: 16 }}>참고자료 링크 (선택)</label>
                    {refUrls.map((u, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input value={u} placeholder="https:// 기사·블로그 주소" inputMode="url"
                          onChange={(e) => setRefUrls((p) => p.map((v, j) => (j === i ? e.target.value : v)))} style={{ flex: 1 }} />
                        {refUrls.length > 1 ? (
                          <button type="button" className="btn sm" onClick={() => setRefUrls((p) => p.filter((_, j) => j !== i))} title="칸 삭제">✕</button>
                        ) : null}
                      </div>
                    ))}
                    {refUrls.length < 5 ? (
                      <button type="button" className="btn sm" onClick={() => setRefUrls((p) => [...p, ''])}>＋ 링크 추가</button>
                    ) : null}
                    <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '6px 0 0' }}>넣어주신 페이지의 본문을 읽고 대본의 사실 근거로 사용해요 (최대 5개). 뉴스가 없는 노하우·제도 주제일수록 효과가 커요.</p>
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
                          {!s.bg && artStyle === 'brand' && styleProfile ? (
                            <span style={{ width: 18, height: 30, borderRadius: 4, background: `linear-gradient(160deg, ${styleProfile.bg} 55%, ${styleProfile.accent})`, flexShrink: 0 }} />
                          ) : (
                            <img src={!s.bg ? (artStyle && artStyle !== 'brand' ? `/ui/style-${artStyle}.jpg` : `/ui/bgart-${template}.jpg`) : s.bg.startsWith('http') ? s.bg.replace('/1600px-', '/480px-') : `/ui/bgart-${template}.jpg`} alt="" style={{ height: 30 }} />
                          )}
                          {!s.bg ? `생성 — ${(artOptions.find((a) => a.id === artStyle) ?? artOptions[0]!).name}` : s.bg === 'gen' ? '✨ 씬 전용 생성' : s.bg.includes('/assets/') ? '내 이미지' : s.bg.startsWith('http') ? '실사 (검색)' : '실사'}
                          <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {bgOpen === i && (
                    <div className="pickgrid" style={{ margin: '0 16px 14px', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
                      <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--sub)', fontWeight: 700 }}>✦ 생성 — 주제에 맞춰 새로 그립니다. 스타일을 고르세요 (영상 전체 공통)</div>
                      {artOptions.map((a) => (
                        <button type="button" key={a.id || 'default'} className={`pickitem${!s.bg && artStyle === a.id ? ' sel' : ''}`}
                          onClick={() => { setArtStyle(a.id); set(i, { bg: undefined }); setBgOpen(null); }}>
                          {a.id === 'brand' && styleProfile ? (
                            <span style={{ display: 'block', aspectRatio: '9/16', borderRadius: 7, marginBottom: 6, background: `linear-gradient(160deg, ${styleProfile.bg} 55%, ${styleProfile.accent})` }} />
                          ) : (
                            <img src={a.id ? `/ui/style-${a.id}.jpg` : `/ui/bgart-${template}.jpg`} alt={a.name} style={{ aspectRatio: '9/16' }} />
                          )}
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
                  {artStyle === 'brand' && styleProfile ? (
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${styleProfile.bg} 60%, ${styleProfile.accent})`, flexShrink: 0 }} />
                  ) : (
                    <img src={artStyle ? `/ui/style-${artStyle}.jpg` : `/ui/bgart-${template}.jpg`} alt="" />
                  )}
                  {(artOptions.find((a) => a.id === artStyle) ?? artOptions[0]!).name}
                  <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                </button>
                {artOpen && (
                  <div className="pickgrid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(2,1fr)' }}>
                    {artOptions.map((a) => (
                      <button type="button" key={a.id} className={`pickitem${artStyle === a.id ? ' sel' : ''}`}
                        onClick={() => { setArtStyle(a.id); setArtOpen(false); }}>
                        {a.id === 'brand' && styleProfile ? (
                          <span style={{ display: 'block', aspectRatio: '9/16', borderRadius: 7, marginBottom: 6, background: `linear-gradient(160deg, ${styleProfile.bg} 55%, ${styleProfile.accent})` }} />
                        ) : (
                          <img src={a.id ? `/ui/style-${a.id}.jpg` : `/ui/bgart-${template}.jpg`} alt={a.name} />
                        )}
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
                <label>색상 톤</label>
                <button type="button" className="pickbtn" onClick={() => setColorOpen(!colorOpen)}>
                  <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 6, background: (colors ?? TPL_COLORS[template]).bg, border: '1px solid var(--line)', position: 'relative', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', right: 2, bottom: 2, width: 9, height: 9, borderRadius: '50%', background: (colors ?? TPL_COLORS[template]).accent }} />
                  </span>
                  {colors
                    ? (styleProfile && colors.bg === styleProfile.bg && colors.accent === styleProfile.accent
                      ? '내 브랜드'
                      : COLOR_TONES.find((t) => t.bg === colors.bg && t.accent === colors.accent)?.name ?? '커스텀')
                    : '템플릿 기본'}
                  <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>▾</span>
                </button>
                {colorOpen && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                      {[
                        { name: '기본', ...TPL_COLORS[template], isDefault: true },
                        ...(styleProfile ? [{ name: '🎨 내 브랜드', bg: styleProfile.bg, accent: styleProfile.accent, isDefault: false }] : []),
                        ...COLOR_TONES.map((t) => ({ ...t, isDefault: false })),
                      ].map((t) => {
                        const sel = t.isDefault ? !colors : colors?.bg === t.bg && colors?.accent === t.accent;
                        return (
                          <button type="button" key={t.name} onClick={() => { setColors(t.isDefault ? null : { bg: t.bg, accent: t.accent }); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', background: sel ? 'var(--accent-dim, rgba(124,140,255,.12))' : 'transparent', border: sel ? '1px solid var(--accent)' : '1px solid var(--line)', color: 'var(--ink)', fontSize: 11 }}>
                            <span style={{ width: 20, height: 20, borderRadius: 6, background: t.bg, border: '1px solid var(--line)', position: 'relative', flexShrink: 0 }}>
                              <span style={{ position: 'absolute', right: 2, bottom: 2, width: 8, height: 8, borderRadius: '50%', background: t.accent }} />
                            </span>
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--faint)' }}>
                      직접 선택
                      <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>배경
                        <input type="color" value={(colors ?? TPL_COLORS[template]).bg}
                          onChange={(e) => setColors({ ...(colors ?? TPL_COLORS[template]), bg: e.target.value })}
                          style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--line)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
                      </label>
                      <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>포인트
                        <input type="color" value={(colors ?? TPL_COLORS[template]).accent}
                          onChange={(e) => setColors({ ...(colors ?? TPL_COLORS[template]), accent: e.target.value })}
                          style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--line)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
                      </label>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--faint)', margin: '8px 0 0' }}>배경·강조·진행바 색이 함께 바뀌고, 글자색은 배경 밝기에 맞춰 자동 조정돼요.</p>
                  </div>
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
                    <p style={{ fontSize: 11, color: 'var(--faint)', margin: '0 0 12px' }}>렌더 시 저장·적용돼요. 시그니처를 바꿨다면 마지막 씬의 문장도 같이 고쳐주세요 — 문장이 달라도 아웃트로는 정상 표시됩니다.</p>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} style={{ width: 15, height: 15 }} />
                      좌상단 워터마크 표시
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={outroOn} onChange={(e) => setOutroOn(e.target.checked)} style={{ width: 15, height: 15 }} />
                      마지막 브랜드 페이지 (아웃트로)
                    </label>
                    {outroOn ? (
                      <div style={{ margin: '8px 0 0 23px' }}>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', marginBottom: 8, color: 'var(--ink)' }}>
                          <input type="checkbox" checked={outroTagline} onChange={(e) => setOutroTagline(e.target.checked)} style={{ width: 14, height: 14 }} />
                          태그라인 문구 표시
                        </label>
                        <div style={{ fontSize: 11.5, color: 'var(--faint)', marginBottom: 6 }}>아웃트로 배경</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {[{ id: '', label: '테마 색상' }, { id: 'art', label: '생성 아트' }].map((o) => (
                            <button type="button" key={o.id || 'default'} onClick={() => setOutroBg(o.id)}
                              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: outroBg === o.id ? '1px solid var(--accent)' : '1px solid var(--line)', color: outroBg === o.id ? 'var(--accent)' : 'var(--ink)', background: 'transparent' }}>
                              {o.label}
                            </button>
                          ))}
                          <label style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: outroBg.startsWith('http') ? '1px solid var(--accent)' : '1px solid var(--line)', color: outroBg.startsWith('http') ? 'var(--accent)' : 'var(--ink)' }}>
                            {outroUploading ? '업로드 중…' : outroBg.startsWith('http') ? '📷 내 이미지 ✓' : '📷 이미지 업로드'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOutroBg(f); e.target.value = ''; }} />
                          </label>
                        </div>
                        {outroBg.startsWith('http') ? (
                          <img src={outroBg} alt="아웃트로 배경" style={{ marginTop: 8, height: 44, borderRadius: 8, border: '1px solid var(--line)' }} />
                        ) : null}
                        <p style={{ fontSize: 11, color: 'var(--faint)', margin: '8px 0 0' }}>이미지 배경 위에는 가독성용 색 스크림이 얹혀요. '생성 아트'는 영상 배경과 같은 그림을 써요.</p>
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: 'var(--faint)', margin: '6px 0 0 23px' }}>끄면 브랜드 화면 없이 마지막 씬에서 바로 끝나요.</p>
                    )}
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
                {plan === 'free' ? (
                  <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', margin: 0 }}>
                      <input type="checkbox" checked={noWm} onChange={(e) => setNoWm(e.target.checked)} style={{ width: 14, height: 14 }} />
                      서비스 워터마크 제거 <b style={{ color: 'var(--accent)' }}>+5크레딧</b>
                    </label>
                    <p style={{ fontSize: 11, color: 'var(--faint)', margin: '6px 0 0' }}>무료 플랜 영상엔 "made with Autopilot" 워터마크가 붙어요. 구독하면 항상 제거됩니다.</p>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={saveDraft}>
                    {savedMsg ? '✓ 저장됨' : '💾 대본 저장'}
                  </button>
                  <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => setRegenOpen(!regenOpen)}>
                    🔄 재생성
                  </button>
                </div>
                {regenOpen ? (
                  <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
                    <label style={{ fontSize: 11.5 }}>방향 코멘트 (선택)</label>
                    <textarea value={regenNote} onChange={(e) => setRegenNote(e.target.value)} rows={3}
                      placeholder={'예: 요금제 비교표 중심으로 더 구체적으로\n예: 초보자 눈높이로 쉽게, 덜 공격적으로'}
                      style={{ width: '100%', marginTop: 6, fontSize: 13, resize: 'vertical' }} />
                    <button className="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={regenerate}>
                      {busy ? '접수 중…' : '대본 새로 쓰기 (무료)'}
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--faint)', margin: '8px 0 0' }}>지금 대본을 버리고 처음부터 다시 써요. 색상·목소리·아웃트로 등 설정은 유지됩니다.</p>
                  </div>
                ) : null}
                <button className="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={approveRender}>
                  {busy ? '접수 중…' : `렌더 시작 (${10 + (plan === 'free' && noWm ? 5 : 0)}크레딧)`}
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
