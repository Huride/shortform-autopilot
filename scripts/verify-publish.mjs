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
import { google } from 'googleapis';

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

// 공개 전환 확인 직후 채널 고지를 고정 댓글로 단다 (영상 나레이션에서 뺀 대신).
async function postDisclosureComment(job, videoId) {
  try {
    const ch = JSON.parse(readFileSync(resolve(ROOT, `channels/${job.channelId}.json`), 'utf8'));
    if (!ch.disclosure) return;
    const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
    const yt = google.youtube({ version: 'v3', auth });
    await yt.commentThreads.insert({
      part: ['snippet'],
      requestBody: { snippet: {
        videoId,
        topLevelComment: { snippet: { textOriginal: ch.disclosure } },
      } },
    });
    console.log('disclosure comment posted', videoId);
  } catch (e) {
    await alert(`⚠ 고지 댓글 게시 실패 (${videoId}): ${String(e).slice(0, 120)} — 수동으로 달아주세요`);
  }
}

const now = Date.now();
const jobs = existsSync(JOBS)
  ? readdirSync(JOBS).filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(resolve(JOBS, f), 'utf8')))
  : [];

for (const job of jobs) {
  const videoId = (job.published ?? []).find((p) => p.platform === 'youtube')?.remoteId;
  if (!videoId || state[videoId]) continue;
  const due = job.scheduledAt ? new Date(job.scheduledAt).getTime() : null;
  if (due === null || due > now) continue;          // not scheduled / not due yet
  if (now - due > 7 * 86400_000) { state[videoId] = 'stale'; continue; }

  const ok = (await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  )).ok;
  if (ok) {
    state[videoId] = 'public';
    await postDisclosureComment(job, videoId);
    await alert(`✅ [${job.channelId}] "${job.topic ?? videoId}" is public as scheduled\nhttps://youtu.be/${videoId}`);
  } else if (now - due > 20 * 60_000) {
    state[videoId] = 'stuck';
    await alert(`⚠ [${job.channelId}] "${job.topic ?? videoId}" was scheduled for ${job.scheduledAt} but is still not public!\nhttps://studio.youtube.com/video/${videoId}/edit`);
  } // within 20min grace: recheck next run
}
writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('verify-publish done', new Date().toISOString());
