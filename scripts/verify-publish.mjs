// Verify that scheduled videos actually went public — and alert if they didn't.
//
// YouTube's oEmbed endpoint returns 200 only for public videos and needs no API
// quota or auth scope, which makes it a perfect dead-man's check for scheduled
// publishes. Run this from cron/launchd a few minutes after each publish slot.
//
// Env: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (optional — logs to stdout without).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = resolve(ROOT, 'data/jobs');
const statePath = resolve(ROOT, 'data/verify-state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

async function alert(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  if (!tok) { console.log('[alert]', text); return; }
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
  });
}

const now = Date.now();
const jobs = existsSync(JOBS)
  ? readdirSync(JOBS).filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(resolve(JOBS, f), 'utf8')))
  : [];

for (const job of jobs) {
  const videoId = job.publish?.youtube?.videoId;
  if (!videoId || state[videoId]) continue;
  const due = job.scheduledAt ? new Date(job.scheduledAt).getTime() : null;
  if (due === null || due > now) continue;          // not scheduled / not due yet
  if (now - due > 7 * 86400_000) { state[videoId] = 'stale'; continue; }

  const ok = (await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  )).ok;
  if (ok) {
    state[videoId] = 'public';
    await alert(`✅ [${job.channelId}] "${job.topic ?? videoId}" is public as scheduled\nhttps://youtu.be/${videoId}`);
  } else if (now - due > 20 * 60_000) {
    state[videoId] = 'stuck';
    await alert(`⚠ [${job.channelId}] "${job.topic ?? videoId}" was scheduled for ${job.scheduledAt} but is still not public!\nhttps://studio.youtube.com/video/${videoId}/edit`);
  } // within 20min grace: recheck next run
}
writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('verify-publish done', new Date().toISOString());
