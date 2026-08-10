#!/usr/bin/env node
/**
 * Instagram 장기 토큰 자동 갱신.
 *
 * 장기 토큰은 60일 만료다. 갱신하지 않으면 어느 날 발행이 소리 없이 죽는다.
 * refresh_access_token 은 "발급 24시간 이후 ~ 만료 전" 토큰을 새 60일 토큰으로
 * 바꿔준다. 매일 호출해도 무해하다 (24시간 미만이면 오류가 나지만 무시 가능) —
 * daily-run.sh 가 매일 부르므로 만료에 근접할 일 자체가 없어진다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(ROOT, '.env');
if (!existsSync(envPath)) {
  console.error('.env 없음');
  process.exit(1);
}

const envText = readFileSync(envPath, 'utf8');
const match = envText.match(/^IG_ACCESS_TOKEN=(.+)$/m);
if (!match) {
  console.log('IG_ACCESS_TOKEN 없음 — 건너뜀');
  process.exit(0);
}
const current = match[1].trim();

const res = await fetch(
  `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`,
  { signal: AbortSignal.timeout(30_000) },
);
const body = await res.json();

if (!res.ok || !body.access_token) {
  // 발급 24시간 미만이거나 일시 오류 — 내일 다시 시도되므로 치명적이지 않다.
  console.log(`갱신 안 됨 (${res.status}): ${body?.error?.message ?? JSON.stringify(body)}`);
  process.exit(0);
}

writeFileSync(
  envPath,
  envText.replace(/^IG_ACCESS_TOKEN=.+$/m, `IG_ACCESS_TOKEN=${body.access_token}`),
  { mode: 0o600 },
);
const days = Math.round((body.expires_in ?? 0) / 86400);
console.log(`토큰 갱신 완료 — 새 만료까지 ${days}일`);
