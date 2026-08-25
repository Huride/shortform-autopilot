#!/usr/bin/env node
// 카드뉴스 PNG 를 R2 에 올리고 인스타 캐러셀로 발행한다.
// 사용: node scripts/publish-carousel.mjs <carouselDir>
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i)] = line.slice(i + 1).trim();
}
const need = (k) => { if (!env[k]) throw new Error(`.env ${k} 없음`); return env[k]; };

const dir = process.argv[2];
if (!dir) throw new Error('carousel 디렉토리를 지정하세요');
const pngs = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
if (pngs.length < 3) throw new Error(`카드가 ${pngs.length}장뿐입니다`);

// 1) R2 업로드
const s3 = new S3Client({
  region: env.S3_REGION || 'auto',
  endpoint: need('S3_ENDPOINT'),
  credentials: { accessKeyId: need('S3_ACCESS_KEY_ID'), secretAccessKey: need('S3_SECRET_ACCESS_KEY') },
});
const stamp = basename(dir);
const urls = [];
for (const f of pngs) {
  const key = `carousel/${stamp}/${f}`;
  await s3.send(new PutObjectCommand({
    Bucket: need('S3_BUCKET'), Key: key, Body: readFileSync(resolve(dir, f)), ContentType: 'image/png',
  }));
  urls.push(`${need('S3_PUBLIC_BASE_URL').replace(/\/$/, '')}/${key}`);
  console.log('업로드:', key);
}

// 2) 캡션 — 메타에서 두 이슈 훅
const BRAND = process.env.BRAND || '오늘의 브리핑';
let caption = BRAND;
try {
  const meta = JSON.parse(readFileSync(resolve(dir, 'meta.json'), 'utf8'));
  caption = [BRAND, '', ...meta.hooks.map((h, i) => `${String(i + 1).padStart(2, '0')} ${h}`), '',
    '저장해두고 저녁에 다시 확인하세요', '', meta.hashtags.map((h) => `#${h}`).join(' ')].join('\n');
} catch { /* meta 없으면 기본 캡션 */ }

// 3) IG 캐러셀 발행
const G = `https://graph.instagram.com/${env.IG_API_VERSION || 'v23.0'}`;
const uid = need('IG_USER_ID');
const tok = need('IG_ACCESS_TOKEN');
async function graph(path, params) {
  const res = await fetch(`${G}${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: tok }) });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`IG ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}
const children = [];
for (const u of urls) {
  const r = await graph(`/${uid}/media`, { image_url: u, is_carousel_item: 'true' });
  children.push(r.id);
}
const carousel = await graph(`/${uid}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });

// 컨테이너 처리 대기 — IG 는 비동기라 즉시 발행하면 9007 이 난다.
for (let i = 0; i < 30; i++) {
  const st = await (await fetch(`${G}/${carousel.id}?fields=status_code&access_token=${tok}`)).json();
  if (st.status_code === 'FINISHED') break;
  if (st.status_code === 'ERROR') throw new Error(`컨테이너 처리 실패: ${JSON.stringify(st)}`);
  await new Promise((r) => setTimeout(r, 4000));
}
let pub;
for (let i = 0; i < 5; i++) {
  try {
    pub = await graph(`/${uid}/media_publish`, { creation_id: carousel.id });
    break;
  } catch (e) {
    if (i === 4 || !String(e).includes('9007')) throw e;
    await new Promise((r) => setTimeout(r, 6000));
  }
}
console.log('발행 완료:', pub.id);

// 텔레그램 알림
if (env.TELEGRAM_BOT_TOKEN) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `📰 카드뉴스 발행 완료 (${pngs.length}장)\nhttps://instagram.com` }),
  }).catch(() => {});
}
