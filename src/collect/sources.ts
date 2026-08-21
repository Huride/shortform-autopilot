/**
 * RSS feeds for the collect step — **replace these with your beat's outlets.**
 * The list below matches the example channel (consumer tech & economy).
 *
 * Don't collect from only one editorial cluster. Whatever your channel's
 * stance, if collection sees only one side you (1) miss issues entirely and
 * (2) get facts skewed at the source. `lean` here is NOT a filter — the
 * selector uses it to measure "how many distinct clusters covered this issue",
 * which is a strong substance signal. For non-political beats treat the three
 * labels as arbitrary outlet clusters (wire/business/consumer, big/indie,
 * whatever splits your media landscape) and relabel in comments as you like.
 */

export type Lean = 'left' | 'center' | 'right';

export interface Feed {
  source: string;
  lean: Lean;
  url: string;
  /**
   * For feeds whose items carry no publish date: fall back to the channel's
   * lastBuildDate. Freshness becomes approximate, but that beats losing the
   * outlet entirely. Enable per feed, explicitly.
   */
  undatedFallback?: boolean;
}

export const FEEDS: Feed[] = [
  // Broad/wire-style coverage — volume baseline for issue detection
  { source: 'BBC Technology', lean: 'center', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { source: 'Engadget', lean: 'center', url: 'https://www.engadget.com/rss.xml' },

  // Cluster B — consumer-experience-leaning outlets
  { source: 'The Verge', lean: 'left', url: 'https://www.theverge.com/rss/index.xml' },
  { source: 'The Guardian Tech', lean: 'left', url: 'https://www.theguardian.com/uk/technology/rss' },

  // Cluster C — industry/business-leaning outlets
  { source: 'Ars Technica', lean: 'right', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { source: 'TechCrunch', lean: 'right', url: 'https://techcrunch.com/feed/' },
];
