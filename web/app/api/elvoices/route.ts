import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

function decrypt(b64: string): string {
  const master = Buffer.from(process.env.KEY_MASTER!, 'hex');
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', master, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

/** 사용자의 ElevenLabs 보이스 목록 (이름·미리듣기 URL 포함). */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data: row } = await admin.from('user_keys').select('key_encrypted')
    .eq('user_id', userData.user.id).eq('provider', 'elevenlabs').maybeSingle();
  if (!row) return NextResponse.json({ ok: true, voices: [] });

  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': decrypt(row.key_encrypted) } });
  if (!r.ok) return NextResponse.json({ ok: false, error: 'el_error' }, { status: 502 });
  const j = await r.json();
  const voices = (j.voices ?? []).slice(0, 24).map((v: any) => ({
    id: v.voice_id, name: v.name, preview: v.preview_url ?? null,
  }));
  return NextResponse.json({ ok: true, voices });
}
