import { put } from '@vercel/blob';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const { email, interest, website } = req.body ?? {};
  // 허니팟 — 봇이 숨은 필드를 채우면 조용히 성공으로 응답
  if (website) return res.status(200).json({ ok: true });
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  const at = new Date().toISOString();
  const key = `signups/${at.slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  await put(
    key,
    JSON.stringify({
      email: email.trim().toLowerCase(),
      interest: typeof interest === 'string' ? interest.slice(0, 100) : '',
      at,
      ref: req.headers.referer ?? '',
      ua: req.headers['user-agent'] ?? '',
    }),
    { access: 'private', contentType: 'application/json' },
  );
  return res.status(200).json({ ok: true });
}
