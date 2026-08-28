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

/**
 * 스타일 학습 — 기존 채널의 썸네일·카드뉴스 스크린샷 1~3장을 비전 모델로 분석해
 * {bg, accent, mood, artDirection} 스타일 프로필을 뽑는다. 결과는 클라이언트가
 * channels.config.styleProfile 로 저장하고, 에디터 색상 톤·아트 스타일의 기본값이 된다.
 * 사용자의 OpenAI 키를 쓴다 (BYO-key 원칙 — 분석 비용도 사용자 부담).
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data: row } = await admin.from('user_keys').select('key_encrypted')
    .eq('user_id', userData.user.id).eq('provider', 'openai').maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: '설정에서 OpenAI 키를 먼저 연결해주세요.' }, { status: 400 });

  const form = await req.formData();
  const files = form.getAll('images').filter((f): f is File => f instanceof File).slice(0, 3);
  if (files.length === 0) return NextResponse.json({ ok: false, error: '이미지를 1장 이상 올려주세요.' }, { status: 400 });
  for (const f of files) {
    if (f.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: '이미지는 8MB 이하만 가능해요.' }, { status: 400 });
  }

  const images = await Promise.all(files.map(async (f) => ({
    type: 'image_url' as const,
    image_url: { url: `data:${f.type || 'image/jpeg'};base64,${Buffer.from(await f.arrayBuffer()).toString('base64')}`, detail: 'low' as const },
  })));

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decrypt(row.key_encrypted)}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a brand-design analyst for short-form video. From the reference images (a creator's existing thumbnails/posts/frames), extract a reusable style profile.
Return JSON exactly: {"bg": "#hex dominant dark-ish background color suitable as a video backdrop", "accent": "#hex the single strongest brand accent color", "mood": "one short Korean phrase describing the visual mood", "artDirection": "English, 1-2 sentences describing ONLY reusable style traits (palette, texture, lighting, illustration technique) for generating video backgrounds in this brand's look. NEVER describe specific objects, people, text or compositions from the images."}`,
        },
        { role: 'user', content: [{ type: 'text', text: 'Extract the style profile from these references.' }, ...images] },
      ],
    }),
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: `분석 실패 (${r.status})` }, { status: 502 });
  const j = await r.json();
  let profile;
  try { profile = JSON.parse(j.choices?.[0]?.message?.content ?? '{}'); } catch { profile = null; }
  if (!profile?.bg || !profile?.accent || !/^#[0-9a-fA-F]{6}$/.test(profile.bg) || !/^#[0-9a-fA-F]{6}$/.test(profile.accent)) {
    return NextResponse.json({ ok: false, error: '스타일을 추출하지 못했어요. 다른 이미지로 시도해주세요.' }, { status: 422 });
  }
  return NextResponse.json({
    ok: true,
    profile: {
      bg: profile.bg, accent: profile.accent,
      mood: String(profile.mood ?? '').slice(0, 60),
      artDirection: String(profile.artDirection ?? '').slice(0, 500),
    },
  });
}
