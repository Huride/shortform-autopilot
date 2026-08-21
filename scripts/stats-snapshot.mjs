// Append a timestamped snapshot of per-video stats to data/stats-snapshots.jsonl.
//
// Why snapshots instead of just reading current totals: cumulative view counts
// can't answer "which publish slot performs better" — you need views *at the
// same video age*. Run this every 2–6 h from cron/launchd and you can compare
// any two videos at matched ages (e.g. views at +24 h), which is the honest way
// to A/B publish times, formats, or titles.
//
// YouTube: uses the same OAuth client as publishing (needs youtube.force-ssl —
// run scripts/youtube-auth.mjs to grant). Instagram: optional, set IG_ACCESS_TOKEN
// and IG_USER_ID to include Reels insights.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(ROOT, 'data'), { recursive: true });
const OUT = resolve(ROOT, 'data/stats-snapshots.jsonl');
const now = new Date().toISOString();
const row = (o) => appendFileSync(OUT, JSON.stringify(o) + '\n');

// ── YouTube ──
const tok = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token',
  }),
})).json()).access_token;
const H = { Authorization: `Bearer ${tok}` };
const search = await (await fetch(
  'https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&maxResults=30&order=date',
  { headers: H },
)).json();
const ids = (search.items ?? []).map((x) => x.id.videoId).join(',');
if (ids) {
  const v = await (await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}`,
    { headers: H },
  )).json();
  for (const it of v.items ?? []) {
    row({ at: now, platform: 'youtube', id: it.id, published: it.snippet.publishedAt,
      title: it.snippet.title.slice(0, 60),
      views: +(it.statistics.viewCount ?? 0), likes: +(it.statistics.likeCount ?? 0),
      comments: +(it.statistics.commentCount ?? 0) });
  }
  console.log(now, 'youtube:', (v.items ?? []).length, 'videos');
}

// ── Instagram (optional) ──
if (process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID) {
  const T = process.env.IG_ACCESS_TOKEN;
  const m = await (await fetch(
    `https://graph.instagram.com/v21.0/${process.env.IG_USER_ID}/media?fields=id,caption,timestamp&limit=12&access_token=${T}`,
  )).json();
  let n = 0;
  for (const it of m.data ?? []) {
    const ins = await (await fetch(
      `https://graph.instagram.com/v21.0/${it.id}/insights?metric=views,reach,likes,comments,shares,saved&access_token=${T}`,
    )).json();
    if (ins.error) continue;
    const g = Object.fromEntries((ins.data ?? []).map((d) => [d.name, d.values?.[0]?.value]));
    row({ at: now, platform: 'instagram', id: it.id, published: it.timestamp,
      title: (it.caption ?? '').split('\n')[0].slice(0, 60),
      views: g.views ?? 0, reach: g.reach ?? 0, likes: g.likes ?? 0,
      shares: g.shares ?? 0, saved: g.saved ?? 0 });
    n++;
  }
  console.log(now, 'instagram:', n, 'posts');
}
