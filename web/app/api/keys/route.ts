import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

function encrypt(plain: string): string {
  const master = Buffer.from(process.env.KEY_MASTER!, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', master, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!);
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData.user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { provider, key } = await req.json();
  if (provider !== 'openai' || typeof key !== 'string' || !key.startsWith('sk-')) {
    return NextResponse.json({ ok: false, error: 'invalid_key' }, { status: 400 });
  }

  // 키 검증 — 모델 목록 조회가 되면 유효
  const check = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  if (!check.ok) return NextResponse.json({ ok: false, error: 'key_rejected' }, { status: 400 });

  const { error } = await admin.from('user_keys').upsert({
    user_id: userData.user.id,
    provider: 'openai',
    key_encrypted: encrypt(key),
    validated_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: 'user_id,provider' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
