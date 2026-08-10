/**
 * 정치 섹션 RSS 피드. 2026-08-07 기준 전부 응답 확인됨.
 *
 * 성향을 한쪽으로 몰아 수집하지 않는다. 채널 논조가 어느 쪽이든,
 * 수집 단계가 한쪽만 보면 (1) 이슈 자체를 놓치고 (2) 사실관계가 틀어진다.
 * lean 은 필터가 아니라 "몇 개 진영이 이 이슈를 다뤘나"를 재는 신호로 쓴다.
 */

export type Lean = 'left' | 'center' | 'right';

export interface Feed {
  source: string;
  lean: Lean;
  url: string;
  /**
   * item 에 발행시각이 없는 피드. 채널의 lastBuildDate 로 대체한다.
   * 정치 섹션 RSS 는 최신 수십 건만 담기 때문에 24시간 창 안으로 보는 게 안전하지만,
   * 시각이 추정값이므로 freshness 판정은 그만큼 부정확해진다. 매체를 통째로
   * 잃는 것보다는 낫다는 판단이고, 그래서 피드별로 명시적으로 켠다.
   */
  undatedFallback?: boolean;
}

export const FEEDS: Feed[] = [
  // 통신사 — 보도량이 많아 이슈 탐지의 기준선이 된다
  { source: '연합뉴스', lean: 'center', url: 'https://www.yna.co.kr/rss/politics.xml' },
  { source: '뉴시스', lean: 'center', url: 'https://www.newsis.com/RSS/politics.xml' },

  // 중도
  { source: 'SBS', lean: 'center', url: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01' },
  { source: '서울신문', lean: 'center', url: 'https://www.seoul.co.kr/xml/rss/rss_politics.xml' },

  // 보수
  {
    source: '조선일보',
    lean: 'right',
    url: 'https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml',
  },
  { source: '동아일보', lean: 'right', url: 'https://rss.donga.com/politics.xml' },

  // 진보
  // 한겨레는 item 에 pubDate 를 넣지 않는다 (2026-08 확인).
  { source: '한겨레', lean: 'left', url: 'https://www.hani.co.kr/rss/politics', undatedFallback: true },
  { source: '경향신문', lean: 'left', url: 'https://www.khan.co.kr/rss/rssdata/politic_news.xml' },
  { source: '오마이뉴스', lean: 'left', url: 'http://rss.ohmynews.com/rss/politics.xml' },
];
