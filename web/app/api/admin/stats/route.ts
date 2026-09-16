import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'johan@gccompany.co.kr,hsyangjohan@gmail.com').split(',').map((s) => s.trim());

/** 운영 통계 — 운영자 계정만. 가입·잡·렌더·체험 집계를 Supabase 에서 직접 읽는다. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  const { data: u } = await admin.auth.getUser(token);
  if (!u.user?.email || !ADMIN_EMAILS.includes(u.user.email)) return NextResponse.json({ ok: false }, { status: 403 });

  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [{ data: profiles }, { data: jobs }, { data: keys }] = await Promise.all([
    admin.from('profiles').select('id, plan, credits, created_at'),
    admin.from('jobs').select('id, user_id, status, created_at, updated_at, script').gte('created_at', since),
    admin.from('user_keys').select('user_id, provider'),
  ]);
  const day = (iso: string) => iso.slice(0, 10);
  const days: Record<string, { signups: number; jobs: number; rendered: number; failed: number; trial: number }> = {};
  for (let i = 13; i >= 0; i--) days[day(new Date(Date.now() - i * 86400_000).toISOString())] = { signups: 0, jobs: 0, rendered: 0, failed: 0, trial: 0 };
  for (const p of profiles ?? []) { const d = day(p.created_at); if (days[d]) days[d].signups++; }
  for (const j of jobs ?? []) {
    const d = day(j.created_at); if (!days[d]) continue;
    days[d].jobs++;
    if (j.status === 'rendered') days[d].rendered++;
    if (j.status === 'failed') days[d].failed++;
    if ((j.script as any)?.trial) days[d].trial++;
  }
  const activeUsers = new Set((jobs ?? []).map((j) => j.user_id)).size;
  return NextResponse.json({
    ok: true,
    totals: {
      users: (profiles ?? []).length,
      paid: (profiles ?? []).filter((p) => p.plan !== 'free').length,
      withKey: new Set((keys ?? []).filter((k) => k.provider === 'openai').map((k) => k.user_id)).size,
      jobs14d: (jobs ?? []).length,
      rendered14d: (jobs ?? []).filter((j) => j.status === 'rendered').length,
      failed14d: (jobs ?? []).filter((j) => j.status === 'failed').length,
      trial14d: (jobs ?? []).filter((j) => (j.script as any)?.trial).length,
      activeUsers14d: activeUsers,
    },
    days: Object.entries(days).map(([d, v]) => ({ d, ...v })),
    failures: (jobs ?? []).filter((j) => j.status === 'failed').slice(-10).map((j) => ({ id: j.id, at: j.updated_at })),
  });
}
