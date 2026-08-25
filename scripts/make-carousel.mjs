#!/usr/bin/env node
// 전일 저녁 + 당일 아침 잡에서 인스타 카드뉴스(4:5 스틸 8장)를 만든다.
// 사용: node scripts/make-carousel.mjs [amJobId] [pmJobId]  (미지정 시 최근 발행 2건 자동)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = resolve(ROOT, 'data/jobs');

function loadJob(id) {
  return JSON.parse(readFileSync(resolve(JOBS, `${id}.json`), 'utf8'));
}
function latestPublished(n) {
  const all = readdirSync(JOBS).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(JOBS, f), 'utf8')))
    .filter((j) => j.script && (j.published ?? []).some((p) => p.platform === 'youtube'))
    .sort((a, b) => (a.createdAt ?? a.id).localeCompare(b.createdAt ?? b.id));
  return all.slice(-n);
}

const args = process.argv.slice(2);
const jobs = args.length >= 2 ? [loadJob(args[0]), loadJob(args[1])] : latestPublished(2);
if (jobs.length < 2) { console.error('발행 잡 2건이 필요합니다.'); process.exit(1); }

const channel = JSON.parse(readFileSync(resolve(ROOT, `channels/${process.env.CHANNEL || 'example'}.json`), 'utf8'));
const theme = channel.theme;
const brand = channel.name;

// 이슈당: 훅 1장 + 핵심 장면 2장 (stat/quote/contrast 우선 — 카드로 강한 순)
const RANK = { stat: 0, quote: 1, contrast: 2, list: 3, keyword: 4 };
function pickScenes(script) {
  return script.scenes
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.visual && s.visual.kind !== 'none')
    .sort((a, b) => (RANK[a.visual.kind] ?? 9) - (RANK[b.visual.kind] ?? 9) || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i);
}

// 나레이션 정제 — TTS 태그 제거, 2문장까지
function cleanBody(narration) {
  const t = narration.replace(/\[[a-z]+\]\s?/g, '').trim();
  const sents = t.split(/(?<=[.!?…])\s+/);
  return sents.slice(0, 2).join(' ');
}

const today = new Date();
const dateLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
const cards = [
  { kind: 'cover', date: dateLabel, items: jobs.map((j) => j.script.hook), bg: jobs[0].backgroundImage },
];
jobs.forEach((j, n) => {
  const firstLine = (j.script.description ?? '').split('\n')[0] ?? '';
  cards.push({ kind: 'hook', issueNo: n + 1, text: j.script.hook, summary: firstLine, bg: j.backgroundImage });
  for (const s of pickScenes(j.script)) {
    cards.push({
      kind: 'scene',
      caption: s.caption,
      ...(s.emphasis ? { emphasis: s.emphasis } : {}),
      visual: s.visual,
      body: cleanBody(s.narration),
      bg: j.backgroundImage,
    });
  }
});
cards.push({ kind: 'closing', signoff: channel.signoff ?? '', note: '매일 점심, 오늘의 이슈 정리 — 팔로우', bg: jobs[1].backgroundImage });

const outDir = resolve(ROOT, 'out/carousel', dateLabel.replaceAll('.', ''));
mkdirSync(outDir, { recursive: true });
for (const [i, card] of cards.entries()) {
  const propsPath = resolve(outDir, `card-${i}.json`);
  const png = resolve(outDir, `card-${String(i).padStart(2, '0')}.png`);
  const { bg, ...cardOnly } = card;
  const props = { theme, brand, logo: channel.logo, ...(bg ? { bg } : {}), card: cardOnly };
  (await import('node:fs')).writeFileSync(propsPath, JSON.stringify(props));
  execFileSync('npx', ['remotion', 'still', 'remotion/index.ts', 'CarouselCard', png, `--props=${propsPath}`, '--public-dir=remotion/public'], {
    cwd: ROOT, stdio: ['ignore','pipe','inherit'], env: { ...process.env, NODE_OPTIONS: '' },
  });
  console.log('카드', i, card.kind);
}
(await import('node:fs')).writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({
  hooks: jobs.map((j) => j.script.hook),
  hashtags: [...new Set(jobs.flatMap((j) => j.script.hashtags ?? []))].slice(0, 15),
}));
console.log('완료:', outDir);
