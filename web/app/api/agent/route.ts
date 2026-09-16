import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

function decrypt(b64: string): string {
  const master = Buffer.from(process.env.KEY_MASTER!, 'hex');
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', master, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

const TEMPLATES: Record<string, string> = {
  'tpl-critic': '소비자 비판형', 'tpl-number': '넘버 앵커형', 'tpl-brief': '브리핑형',
  'tpl-fact': '팩트체크형', 'tpl-story': '스토리텔링형',
};

/**
 * 워크스페이스 에이전트 — 사용자 OpenAI 키로 도구 호출 LLM 을 돌린다.
 * 도구: 영상 생성(잡 접수) / 잡 상태 / 대본 재생성(방향 코멘트) / 브랜딩 변경 / 계정 요약.
 * 키가 없으면 needKey 로 응답해 클라이언트가 설정 페이지로 보낸다.
 */
const TOOLS = [
  { type: 'function', function: { name: 'create_video', description: '주제로 새 영상(대본) 생성을 접수한다. 대본이 완성되면 사용자가 에디터에서 확인·수정 후 렌더한다.',
    parameters: { type: 'object', properties: {
      topic: { type: 'string', description: '영상 주제 한 줄' },
      template: { type: 'string', enum: Object.keys(TEMPLATES), description: '템플릿. 사용자가 명시하지 않으면 주제 성격에 맞게 고른다 (기본 tpl-critic)' },
      refUrls: { type: 'array', items: { type: 'string' }, description: '참고자료 URL (선택, 최대 5)' },
    }, required: ['topic'] } } },
  { type: 'function', function: { name: 'list_jobs', description: '최근 영상/잡 목록과 상태(대본 대기, 렌더 중, 완료, 실패)를 가져온다.',
    parameters: { type: 'object', properties: { limit: { type: 'integer', default: 5 } } } } },
  { type: 'function', function: { name: 'regenerate_script', description: '대본을 방향 코멘트와 함께 처음부터 다시 쓴다. job_id 가 없으면 가장 최근 잡.',
    parameters: { type: 'object', properties: { job_id: { type: 'string' }, note: { type: 'string', description: '재작성 방향 (예: 초보자 눈높이로, 더 공격적으로)' } }, required: ['note'] } } },
  { type: 'function', function: { name: 'update_branding', description: '채널 브랜딩(채널 이름·시그니처 멘트·태그라인)을 바꾼다. 바꿀 항목만 넘긴다.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, signoff: { type: 'string' }, tagline: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_account', description: '플랜·남은 크레딧·연결된 키 상태를 가져온다.', parameters: { type: 'object', properties: {} } } },
];

const SYSTEM = `당신은 "Autopilot" 숏폼 영상 스튜디오의 에이전트다. 한국어로 짧고 실무적으로 답한다. 이모지는 쓰지 않는다.
할 수 있는 일: 주제로 영상 생성 접수(create_video), 진행 상황 확인(list_jobs), 대본 재생성(regenerate_script), 브랜딩 변경(update_branding), 계정 확인(get_account).
규칙:
- 사용자가 영상을 만들어 달라고 하면 주제를 정리해 바로 create_video 를 호출한다. 템플릿은 주제 성격으로 고른다: 사실 검증·의혹 → tpl-fact, 소비자 비용·요금·기업 비판 → tpl-critic, 숫자 중심 → tpl-number, 뉴스 요약 → tpl-brief, 사건 서사·인물 이야기 → tpl-story.
- 도구 호출 결과를 바탕으로 무엇을 했는지 한두 문장으로 알리고, 에디터 링크(editorUrl)가 있으면 "에디터에서 확인" 을 안내한다.
- 대본 생성은 무료, 렌더는 10크레딧(무료 플랜은 워터마크, 제거 +5). 목소리·BGM·배경 스타일·색상 톤은 에디터 사이드바에서 고른다고 안내한다.
- 할 수 없는 일(발행 자동화·결제)은 "베타 준비 중"이라고 솔직히 말한다.
- 모르는 사실은 지어내지 않는다.`;

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data: krow } = await admin.from('user_keys').select('key_encrypted').eq('user_id', user.id).eq('provider', 'openai').maybeSingle();
  if (!krow) return NextResponse.json({ ok: true, needKey: true, reply: '에이전트를 쓰려면 먼저 OpenAI API 키를 연결해야 해요. 설정 페이지로 이동할게요.' });
  const apiKey = decrypt(krow.key_encrypted);

  const body = await req.json();
  const history: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const actions: { type: string; label: string; href?: string }[] = [];

  async function runTool(name: string, args: any): Promise<unknown> {
    if (name === 'create_video') {
      const template = TEMPLATES[args.template] ? args.template : 'tpl-critic';
      const refs = (Array.isArray(args.refUrls) ? args.refUrls : []).filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 5);
      const { data, error } = await admin.from('jobs')
        .insert({ user_id: user!.id, topic: String(args.topic).slice(0, 200), status: 'pending', script: { template, ...(refs.length ? { refUrls: refs } : {}) } })
        .select('id').single();
      if (error || !data) return { error: error?.message ?? 'insert failed' };
      const editorUrl = `/app/create?job=${data.id}`;
      actions.push({ type: 'job', label: `영상 접수 — ${args.topic} (${TEMPLATES[template]})`, href: editorUrl });
      return { jobId: data.id, template: TEMPLATES[template], editorUrl, note: '대본은 1~2분 뒤 에디터에 나타난다' };
    }
    if (name === 'list_jobs') {
      const { data } = await admin.from('jobs').select('id, topic, status, error, created_at, script').eq('user_id', user!.id)
        .order('created_at', { ascending: false }).limit(Math.min(Number(args.limit) || 5, 10));
      return (data ?? []).map((j: any) => ({
        id: j.id, topic: j.topic,
        status: j.status === 'rendered' ? '완료' : j.status === 'failed' ? `실패 (${j.error ?? ''})` : j.status === 'voiced' ? '렌더 중' : j.status === 'pending' ? '대본 작성 중' : j.script?.approved ? '렌더 대기' : '대본 초안(에디터)',
        editorUrl: `/app/create?job=${j.id}`, createdAt: j.created_at,
      }));
    }
    if (name === 'regenerate_script') {
      let q = admin.from('jobs').select('id, topic, script, status').eq('user_id', user!.id).in('status', ['scripted', 'rendered', 'failed']).order('created_at', { ascending: false }).limit(1);
      if (args.job_id) q = admin.from('jobs').select('id, topic, script, status').eq('user_id', user!.id).eq('id', args.job_id).limit(1);
      const { data } = await q;
      const j = data?.[0];
      if (!j) return { error: '재생성할 잡이 없다' };
      const { scenes: _s, title: _t, hook: _h, ...settings } = (j.script ?? {}) as any;
      const script = { ...settings, regenerateNote: String(args.note).slice(0, 500), approved: false };
      await admin.from('jobs').update({ script, status: 'pending', error: null }).eq('id', j.id);
      const editorUrl = `/app/create?job=${j.id}`;
      actions.push({ type: 'regen', label: `대본 재생성 — ${j.topic}`, href: editorUrl });
      return { jobId: j.id, topic: j.topic, editorUrl };
    }
    if (name === 'update_branding') {
      const { data: row } = await admin.from('channels').select('id, config').eq('user_id', user!.id).eq('archived', false).order('created_at').limit(1).maybeSingle();
      const patch: Record<string, string> = {};
      for (const k of ['name', 'signoff', 'tagline']) if (typeof args[k] === 'string') patch[k] = args[k].trim();
      const config = { ...(row?.config ?? {}), ...patch };
      if (row) await admin.from('channels').update({ config }).eq('id', row.id);
      else await admin.from('channels').insert({ user_id: user!.id, config });
      actions.push({ type: 'brand', label: `브랜딩 변경 — ${Object.keys(patch).join(', ')}`, href: '/app/settings' });
      return { updated: patch };
    }
    if (name === 'get_account') {
      const { data: p } = await admin.from('profiles').select('plan, credits').eq('id', user!.id).maybeSingle();
      const { data: keys } = await admin.from('user_keys').select('provider').eq('user_id', user!.id);
      return { plan: p?.plan ?? 'free', credits: p?.credits ?? 0, keys: (keys ?? []).map((k: any) => k.provider) };
    }
    return { error: 'unknown tool' };
  }

  const messages: any[] = [{ role: 'system', content: SYSTEM }, ...history];
  let reply = '';
  for (let round = 0; round < 4; round++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-5.5', messages, tools: TOOLS, tool_choice: 'auto' }),
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: `LLM ${r.status}` }, { status: 502 });
    const j = await r.json();
    const msg = j.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        const result = await runTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue;
    }
    reply = msg.content ?? '';
    break;
  }
  return NextResponse.json({ ok: true, reply: reply || '처리했어요.', actions });
}
