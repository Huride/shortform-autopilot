/**
 * 기사 본문 수집 — RSS/구글뉴스 링크에서 원문 텍스트를 추린다.
 * 사실 목록 추출의 재료 심화용: 헤드라인·요약(400자)에서 잘리던 숫자·일정·발언 원문을 확보한다.
 * 페이월·스크립트 렌더 사이트는 빈약하게 나올 수 있다 (LLM 추출이 노이즈를 감당).
 */
import { log } from '../log.js';

/** 구글뉴스 신형 링크(rss/articles/...)를 원문 URL 로 푼다 — batchexecute 방식. */
async function resolveGoogleNewsUrl(link: string): Promise<string | null> {
  try {
    const page = await (await fetch(link, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12_000),
    })).text();
    const sig = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    const id = link.split('/articles/')[1]?.split('?')[0];
    if (!sig || !ts || !id) return null;
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['ko', 'KR'], null, null, 1, 1, 'KR:ko', null, 180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]], 'ko', 'KR', 1, [2, 3, 4, 8], 1, 0, '655000234', 0, 0, null, 0], id, Number(ts), sig]);
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
      body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    return text.match(/https?:\/\/[^"\\]+/g)?.find((u) => !u.includes('google')) ?? null;
  } catch {
    return null;
  }
}

export async function fetchArticleText(url: string, maxChars = 3500): Promise<string> {
  try {
    const target = url.includes('news.google.com/rss/articles/')
      ? (await resolveGoogleNewsUrl(url)) ?? url
      : url;
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);
  } catch {
    return '';
  }
}

/** 기사 목록에서 상위 n건의 본문을 병렬 수집. 300자 미만(수집 실패·페이월)은 버린다. */
export async function fetchBodies(
  items: { title: string; source?: string; link?: string }[],
  n = 3,
): Promise<string[]> {
  const targets = items.filter((a) => a.link).slice(0, n);
  const bodies = await Promise.all(
    targets.map(async (a) => {
      const text = await fetchArticleText(a.link!);
      return text.length > 300 ? `[${a.source ?? ''}] ${a.title}\n${text}` : null;
    }),
  );
  const ok = bodies.filter((b): b is string => b !== null);
  log.info(`  본문 확보 ${ok.length}/${targets.length}건`);
  return ok;
}
