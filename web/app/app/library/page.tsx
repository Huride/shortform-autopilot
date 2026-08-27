'use client';
import { useEffect, useState } from 'react';
import Vid from '@/components/Vid';
import { getSupabase } from '@/lib/supabase';

type Job = { id: string; topic: string; status: string; video_url: string | null; error: string | null; created_at: string; updated_at?: string; approved?: boolean | null };

const SAMPLES = [
  { k: 'brief', title: '[샘플] 오늘 꼭 알아야 할 3가지', d: '쓰리씽' },
  { k: 'critic', title: '[샘플] 수수료는 내렸는데 앱 가격은 왜 그대로?', d: '더 마진' },
  { k: 'number', title: '[샘플] 오늘의 숫자 4.2%', d: '넘버스' },
  { k: 'fact', title: '[샘플] 라면값 인상설 팩트체크', d: '진짜야?' },
  { k: 'story', title: '[샘플] 1위 회사는 어쩌다 사라졌나', d: '그때 그 회사' },
];
const STAGE: Record<string, string> = { pending: '대본 작성 중…', scripted: '렌더 대기', voiced: '음성·렌더 진행 중…', rendered: '완료' };

export default function Library() {
  const [tab, setTab] = useState(typeof location !== 'undefined' && location.search.includes('tab=1') ? 1 : 0);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let stop = false;
    const load = async () => {
      const { data } = await sb.from('jobs').select('id, topic, status, video_url, error, created_at, updated_at, approved:script->approved').order('created_at', { ascending: false });
      if (!stop && data) setJobs(data as Job[]);
    };
    load();
    const t = setInterval(load, 5000); // 진행 상태 폴링
    return () => { stop = true; clearInterval(t); };
  }, []);

  const done = jobs.filter((j) => j.status === 'rendered' && j.video_url);
  const doing = jobs.filter((j) => j.status === 'pending' || j.status === 'voiced' || (j.status === 'scripted' && j.approved === true));
  const failed = jobs.filter((j) => j.status === 'failed');
  // 렌더 없이 저장만 해둔 대본 초안 (완성 영상이 이미 있는 잡은 완성 탭에 있으니 제외)
  const drafts = jobs.filter((j) => j.status === 'scripted' && j.approved !== true && !j.video_url);

  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar"><h1>보관함</h1>
        <a className="btn sm primary" href="/app/create">＋ 새 영상</a>
      </div>
      <div className="content">
        <div className="tabs">
          {['완성 영상', '진행 중', '샘플'].map((t, i) => (
            <button key={t} className={`tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{t}
              <span className="cnt">{[done.length, doing.length + failed.length + drafts.length, 5][i]}</span>
            </button>
          ))}
        </div>

        {tab === 0 && (done.length === 0
          ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>아직 완성된 영상이 없어요 — <a href="/app/create" style={{ color: 'var(--accent)' }}>첫 영상을 만들어보세요</a></div>
          : <div className="vid-grid">
              {done.map((j) => (
                <div className="vid-card" key={j.id}>
                  <div className="thumb" style={{ padding: 0, background: '#0A101F' }}>
                    <Vid src={`${j.video_url!}?v=${encodeURIComponent(j.updated_at ?? '')}`} poster="" />
                  </div>
                  <div className="vid-meta"><b>{j.topic}</b>
                    <div className="row"><span className="d">{new Date(j.created_at).toLocaleDateString('ko-KR')}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <a className="btn sm" href={`/app/create?job=${j.id}`}>✏ 대본</a>
                        <a className="btn sm" href={j.video_url!} download>⬇</a>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
        )}

        {tab === 1 && (
          <div className="card">
            {doing.length + failed.length + drafts.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>진행 중인 렌더가 없습니다</div>}
            {drafts.map((j) => (
              <div className="job-row" key={j.id}>
                <div className="title">{j.topic}<small>{new Date(j.created_at).toLocaleDateString('ko-KR')} 저장</small></div>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <a className="btn sm" href={`/app/create?job=${j.id}`}>✏ 이어서 편집</a>
                  <span className="badge dim">대본 초안</span>
                </span>
              </div>
            ))}
            {doing.map((j) => (
              <div className="job-row" key={j.id}>
                <div className="title">{j.topic}<small>{new Date(j.created_at).toLocaleTimeString('ko-KR')}</small></div>
                <span className="badge amber" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}><span className="spinner" style={{ width: 11, height: 11 }} />{STAGE[j.status] ?? j.status}</span>
              </div>
            ))}
            {failed.map((j) => (
              <div className="job-row" key={j.id}>
                <div className="title">{j.topic}<small style={{ color: 'var(--warn)' }}>{j.error?.slice(0, 80)}</small></div>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <a className="btn sm" href={`/app/create?job=${j.id}`}>✏ 대본 수정 후 재시도</a>
                  <span className="badge warn">실패</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 2 && (
          <div className="vid-grid">
            {SAMPLES.map((v) => (
              <div className="vid-card" key={v.k}>
                <div className="thumb" style={{ padding: 0, background: '#0A101F' }}>
                  <Vid src={`/media/tpl-${v.k}-web.mp4`} poster={`/media/poster-${v.k}.jpg`} />
                </div>
                <div className="vid-meta"><b>{v.title}</b><div className="row"><span className="d">{v.d} · 템플릿 샘플</span></div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
