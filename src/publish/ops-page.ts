import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, env } from '../config.js';
import { log } from '../log.js';
import { buildPinnedComment } from '../pipeline/comment.js';
import { list, localDate } from '../store.js';
import type { Job } from '../types.js';
import { uploadPublic } from './storage.js';

/**
 * 폰에서 보는 운영 페이지.
 *
 * 운영자가 원격(주로 모바일)에서 일하므로, 매일 발행이 끝나면 최근 발행분의
 * 링크와 고정 댓글 텍스트를 R2 의 고정 URL 에 올려둔다. 터미널 없이
 * 브라우저 북마크 하나로 확인·복사가 끝나야 한다.
 *
 * 내용은 전부 공개 정보(발행된 링크 + 언론 인용)지만, URL 은 추측 어려운
 * 키로 둔다 (OPS_PAGE_KEY).
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function jobSection(job: Job): string {
  const yt = job.published?.find((p) => p.platform === 'youtube');
  const ig = job.published?.find((p) => p.platform === 'instagram');
  const comment = buildPinnedComment(job);
  const date = localDate(new Date(job.createdAt)); // KST 기준

  return `
<section>
  <h2>${esc(date)} — ${esc(job.script?.title ?? job.topic)}</h2>
  <p class="links">
    ${ig?.url ? `<a href="${esc(ig.url)}">Open Instagram Reel</a>` : '<span class="off">Instagram: not published</span>'}
    ${yt?.url ? `<a href="${esc(yt.url)}">Open YouTube</a>` : '<span class="off">YouTube: not published</span>'}
    ${
      // 감사 통과 전에는 private 으로 올라간다 — 공개 전환을 폰에서 1탭으로.
      // Shorts 초기 배포는 공개 직후가 관건이라 전환이 빠를수록 좋다.
      yt ? `<a class="studio" href="https://studio.youtube.com/video/${esc(yt.remoteId)}/edit">Set public in Studio</a>` : ''
    }
  </p>
  ${
    comment
      ? `<p class="hint">Pinned comment (tap to select all):</p>
<textarea readonly onclick="this.select()">${esc(comment)}</textarea>
<button onclick="navigator.clipboard.writeText(this.previousElementSibling.value).then(()=>{this.textContent='Copied ✓';setTimeout(()=>this.textContent='Copy comment',1500)})">Copy comment</button>`
      : '<p class="off">No source info (manually added job)</p>'
  }
</section>`;
}

export function buildOpsHtml(jobs: Job[]): string {
  const updated = new Date().toLocaleString();
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Creator Ops</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0F1115; color: #FAFAF9; line-height: 1.6;
         font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 20px 16px 60px; }
  h1 { font-size: 1.3rem; } h1 span { color: #DC2626; }
  .updated { color: #71717A; font-size: 0.8rem; margin-bottom: 8px; }
  section { border-top: 1px solid #27272A; padding: 18px 0; }
  h2 { font-size: 1rem; margin: 0 0 10px; }
  .links a { display: inline-block; background: #DC2626; color: #fff; text-decoration: none;
             padding: 8px 14px; border-radius: 8px; margin-right: 8px; font-size: 0.9rem; }
  .links a:nth-child(2) { background: #3F3F46; }
  .links a.studio { background: transparent; border: 1px solid #3F3F46; color: #A1A1AA; margin-top: 8px; }
  .off { color: #71717A; font-size: 0.85rem; }
  .hint { color: #A1A1AA; font-size: 0.8rem; margin: 12px 0 6px; }
  textarea { width: 100%; height: 130px; background: #18181B; color: #D4D4D8;
             border: 1px solid #3F3F46; border-radius: 8px; padding: 10px;
             font-size: 0.78rem; line-height: 1.5; box-sizing: border-box; }
  button { margin-top: 8px; background: #27272A; color: #FAFAF9; border: 1px solid #3F3F46;
           border-radius: 8px; padding: 10px 16px; font-size: 0.9rem; }
</style>
</head>
<body>
<main>
  <h1><span>●</span> Creator Ops</h1>
  <div class="updated">Updated: ${esc(updated)}</div>
  ${jobs.map(jobSection).join('\n')}
</main>
</body>
</html>`;
}

/** 최근 발행분으로 운영 페이지를 만들어 R2 에 올린다. 실패해도 발행에는 영향 없다. */
export async function publishOpsPage(): Promise<string | null> {
  if (!env.storage.enabled()) return null;

  const jobs = list()
    .filter((j) => j.published?.length)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 7);
  if (jobs.length === 0) return null;

  const localPath = resolve(PATHS.out, 'ops.html');
  mkdirSync(PATHS.out, { recursive: true });
  writeFileSync(localPath, buildOpsHtml(jobs), 'utf8');

  const url = await uploadPublic(localPath, env.storage.opsPageKey(), 'text/html; charset=utf-8');
  log.info(`  운영 페이지 갱신 · ${url}`);
  return url;
}
