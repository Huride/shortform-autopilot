import { XMLParser } from 'fast-xml-parser';
import { log } from '../log.js';
import { FEEDS, type Feed, type Lean } from './sources.js';

export interface Article {
  title: string;
  summary: string;
  source: string;
  lean: Lean;
  link: string;
  publishedAt: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // CDATA·엔티티가 섞여 들어와도 문자열로 눕힌다.
  parseTagValue: false,
  trimValues: true,
});

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

/** HTML 태그와 엔티티를 걷어낸다. RSS description 에는 마크업이 흔히 섞여 있다. */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw: string): string | null {
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function fetchFeed(feed: Feed, sinceMs: number): Promise<Article[]> {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; auto-rills/0.1)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const parsed = parser.parse(await res.text()) as Record<string, any>;
  const channel = parsed?.rss?.channel;
  const rawItems = channel?.item ?? parsed?.feed?.entry ?? [];
  const items: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : [rawItems];

  // item 에 시각이 없는 피드용 대체값. 없으면 수집 시각으로 본다.
  const feedDate = feed.undatedFallback
    ? (parseDate(text(channel?.lastBuildDate)) ?? new Date().toISOString())
    : null;

  const articles: Article[] = [];
  for (const item of items) {
    const title = stripHtml(text(item.title));
    if (!title) continue;

    const published =
      parseDate(text(item.pubDate)) ??
      parseDate(text(item.published)) ??
      parseDate(text(item['dc:date'])) ??
      feedDate;

    // 발행시각이 없고 대체값도 없는 항목은 버린다 — 24시간 창을 판정할 수 없으면
    // 오래된 기사가 오늘의 이슈로 섞여 들어온다.
    if (!published || Date.parse(published) < sinceMs) continue;

    const link = text(item.link) || text((item.link as Record<string, unknown>)?.['@_href']);

    articles.push({
      title,
      summary: stripHtml(text(item.description) || text(item.summary)).slice(0, 400),
      source: feed.source,
      lean: feed.lean,
      link,
      publishedAt: published,
    });
  }
  return articles;
}

export interface CollectResult {
  articles: Article[];
  /** 피드별 수집 결과. 죽은 피드를 조용히 넘기지 않고 드러낸다. */
  feedStatus: { source: string; count: number; error?: string }[];
}

export async function collect(windowHours = 24): Promise<CollectResult> {
  const sinceMs = Date.now() - windowHours * 3600_000;

  const settled = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed, sinceMs)));

  const articles: Article[] = [];
  const feedStatus: CollectResult['feedStatus'] = [];

  for (const [i, result] of settled.entries()) {
    const feed = FEEDS[i]!;
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
      feedStatus.push({ source: feed.source, count: result.value.length });
    } else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      feedStatus.push({ source: feed.source, count: 0, error });
      log.warn(`  ${feed.source} 수집 실패: ${error}`);
    }
  }

  // 같은 기사가 여러 경로로 들어오는 경우를 제목으로 접는다.
  const seen = new Set<string>();
  const deduped = articles.filter((a) => {
    const key = `${a.source}::${a.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { articles: deduped, feedStatus };
}
