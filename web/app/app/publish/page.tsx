'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * 발행 · 자동화 — 화면 우선 구현 (2026-09-15).
 * 플랫폼 연결(OAuth)과 자동 편성 워커는 아직 붙지 않았다. 설정값은 channels.config.automation 에
 * 실제로 저장되어, 기능이 붙는 시점에 그대로 쓰인다. 연결 버튼은 "준비 중" 상태.
 */
type Automation = {
  enabled: boolean;
  time: string;            // 'HH:MM' 하루 1편
  template: string;
  keywords: string;        // 쉼표 구분 뉴스 검색 키워드
  rss: string;             // 선택: RSS URL (줄바꿈 구분)
  targets: { youtube: boolean; instagram: boolean };
  review: 'auto' | 'manual'; // 검수 후 발행 여부
  skipWeak: boolean;       // 확실한 이슈 없으면 쉬기 (min-score 가드)
};
const DEFAULT: Automation = {
  enabled: false, time: '07:30', template: 'tpl-critic', keywords: '', rss: '',
  targets: { youtube: true, instagram: false }, review: 'manual', skipWeak: true,
};
const TEMPLATES = [
  ['tpl-critic', '소비자 비판형'], ['tpl-number', '넘버 앵커형'], ['tpl-brief', '브리핑형'],
  ['tpl-fact', '팩트체크형'], ['tpl-story', '스토리텔링형'],
];

export default function Publish() {
  const [a, setA] = useState<Automation>(DEFAULT);
  const [row, setRow] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [plan, setPlan] = useState('free');
  const [state, setState] = useState<'idle' | 'saving' | 'ok'>('idle');

  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    sb.from('channels').select('id, config').eq('archived', false).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setRow(data.id); setConfig(data.config ?? {});
        if (data.config?.automation) setA({ ...DEFAULT, ...data.config.automation });
      });
    sb.from('profiles').select('plan').maybeSingle().then(({ data }) => { if (data?.plan) setPlan(data.plan); });
  }, []);

  async function save() {
    const sb = getSupabase(); if (!sb) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    setState('saving');
    const next = { ...config, automation: a };
    if (row) await sb.from('channels').update({ config: next }).eq('id', row);
    else {
      const { data } = await sb.from('channels').insert({ user_id: session.user.id, config: next }).select('id').single();
      if (data) setRow(data.id);
    }
    setConfig(next); setState('ok'); setTimeout(() => setState('idle'), 2500);
  }

  const gated = plan !== 'autopilot';

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar">
        <h1>발행 · 자동화 <span className="badge dim" style={{ marginLeft: 8 }}>베타 준비 중</span></h1>
      </div>
      <div className="content">
        {gated && (
          <div className="card" style={{ padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', maxWidth: 960 }}>
            <span style={{ fontSize: 20 }}>🚀</span>
            <div style={{ flex: 1, fontSize: 13 }}>
              <b>자동 발행은 오토파일럿 플랜 기능이에요.</b> 지금은 화면을 미리 둘러보고 설정을 저장해둘 수 있어요 — 플랜을 올리고 연동을 마치면 그대로 켜집니다.
            </div>
            <a className="btn sm primary" href="/app/settings">플랜 보기</a>
          </div>
        )}

        <h2 style={{ fontSize: 14, margin: '0 0 10px', color: 'var(--sub)' }}>1. 플랫폼 연결</h2>
        <div className="set-grid" style={{ marginBottom: 26 }}>
          <div className="card set-card">
            <h3>▶ YouTube <span className="badge dim">미연결</span></h3>
            <p className="sub">내 채널에 Shorts를 예약 발행합니다. 구글의 공식 API를 내 계정으로 쓰는 구조라, 아래 설정을 한 번만 해두면 됩니다 (약 20분).</p>
            <ol style={{ fontSize: 12.5, color: 'var(--ink)', paddingLeft: 18, margin: '0 0 14px', lineHeight: 1.7 }}>
              <li>Google Cloud 콘솔에서 프로젝트 생성</li>
              <li><b>YouTube Data API v3</b> 사용 설정</li>
              <li>OAuth 동의 화면 구성 → 데스크톱/웹 클라이언트 ID 발급</li>
              <li>아래 버튼으로 채널 계정 로그인 → 업로드 권한 승인</li>
            </ol>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn primary" disabled title="베타 준비 중">구글 계정으로 연결</button>
              <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>단계별 스크린샷 가이드 제공 예정</span>
            </div>
          </div>
          <div className="card set-card">
            <h3>◎ Instagram <span className="badge dim">미연결</span></h3>
            <p className="sub">릴스 예약 발행 + 스토리 자동 공유. 인스타그램 비즈니스/크리에이터 계정과 Meta 개발자 앱이 필요합니다 (약 30분).</p>
            <ol style={{ fontSize: 12.5, color: 'var(--ink)', paddingLeft: 18, margin: '0 0 14px', lineHeight: 1.7 }}>
              <li>인스타그램 계정을 <b>비즈니스 또는 크리에이터</b>로 전환</li>
              <li>Meta for Developers에서 앱 생성 → Instagram 제품 추가</li>
              <li>아래 버튼으로 Instagram 로그인 → 콘텐츠 게시 권한 승인</li>
              <li>60일 토큰은 자동 갱신됩니다</li>
            </ol>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn primary" disabled title="베타 준비 중">Instagram으로 연결</button>
              <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>Meta 앱 심사 안내 포함 예정</span>
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: 14, margin: '0 0 10px', color: 'var(--sub)' }}>2. 자동 편성</h2>
        <div className="card set-card" style={{ maxWidth: 960, marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', margin: 0, fontSize: 14, fontWeight: 700 }}>
              <input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} style={{ width: 16, height: 16 }} />
              매일 자동으로 영상 만들기
            </label>
            <span className="badge dim">연동 완료 후 활성화</span>
          </div>
          <p className="sub">매일 정한 시각에 뉴스를 수집해 주제를 고르고(화제성·중복 자동 판정), 대본·렌더까지 만들어 둡니다. 검수 모드면 확인 버튼을 누를 때까지 발행하지 않아요.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>편성 시각 (하루 1편)</label>
              <input type="time" value={a.time} onChange={(e) => setA({ ...a, time: e.target.value })} /></div>
            <div className="field"><label>템플릿</label>
              <select value={a.template} onChange={(e) => setA({ ...a, template: e.target.value })}>
                {TEMPLATES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>주제 키워드 — 뉴스에서 이 키워드로 이슈를 찾아요 (쉼표 구분)</label>
              <input value={a.keywords} onChange={(e) => setA({ ...a, keywords: e.target.value })} placeholder="예: 통신요금, 배달앱, 전기차 보조금" /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>RSS 피드 (선택, 줄바꿈 구분) — 특정 매체·블로그를 소스로 쓰고 싶을 때</label>
              <textarea rows={2} value={a.rss} onChange={(e) => setA({ ...a, rss: e.target.value })} placeholder="https://…/rss" style={{ fontSize: 12.5 }} /></div>
            <div className="field"><label>발행 대상</label>
              <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, cursor: 'pointer' }}><input type="checkbox" checked={a.targets.youtube} onChange={(e) => setA({ ...a, targets: { ...a.targets, youtube: e.target.checked } })} /> YouTube Shorts</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, cursor: 'pointer' }}><input type="checkbox" checked={a.targets.instagram} onChange={(e) => setA({ ...a, targets: { ...a.targets, instagram: e.target.checked } })} /> Instagram 릴스</label>
              </div></div>
            <div className="field"><label>발행 방식</label>
              <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, cursor: 'pointer' }}><input type="radio" checked={a.review === 'manual'} onChange={() => setA({ ...a, review: 'manual' })} /> 검수 후 발행 (권장)</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, cursor: 'pointer' }}><input type="radio" checked={a.review === 'auto'} onChange={() => setA({ ...a, review: 'auto' })} /> 자동 발행</label>
              </div></div>
            <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={a.skipWeak} onChange={(e) => setA({ ...a, skipWeak: e.target.checked })} style={{ width: 15, height: 15 }} />
              확실한 이슈가 없는 날은 쉬기 <span style={{ color: 'var(--faint)' }}>— 억지 편성이 채널을 평범하게 만들어요</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
            <button className="btn primary" disabled={state === 'saving'} onClick={save}>{state === 'saving' ? '저장 중…' : state === 'ok' ? '✓ 저장됨' : '설정 저장'}</button>
            <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>지금 저장해두면 연동이 열릴 때 그대로 적용돼요.</span>
          </div>
        </div>

        <h2 style={{ fontSize: 14, margin: '0 0 10px', color: 'var(--sub)' }}>3. 발행 이력</h2>
        <div className="card" style={{ maxWidth: 960 }}>
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>
            자동 발행이 시작되면 여기에 날짜·플랫폼·조회수가 쌓여요.<br />
            <span style={{ fontSize: 12 }}>발행 후 검증(공개 상태·예약 시각 확인)과 성과 비교도 이 화면에서 봅니다.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
