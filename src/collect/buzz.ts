import { google } from 'googleapis';
import { env } from '../config.js';
import { log } from '../log.js';

/**
 * 화제성 실측 — 유튜브에서 지난 24시간 안에 올라온 이 검색어 영상들의 상위 조회 합.
 * 편성 LLM 이 기사 텍스트만 보고 매기는 attention 은 "기사가 많다"와 "사람들이 본다"를 구분 못 한다.
 * 2026-09-15 아침 실측: 홍지선(국토장관 후보자) 상위 5편 합 6천 vs 김승원 206만, 김민석 76만 —
 * 같은 날 '보도 100건'인 사안들 사이에 300배 차이가 있었다. 유튜브가 우리 발행 플랫폼이므로 이 신호가 가장 직접적이다.
 * 비용: search.list 100 + videos.list 1 = 후보당 101 유닛. 슬롯당 5후보 ≈ 505, 하루 ≈ 1,010 (일 한도 10,000).
 */
export interface Buzz {
  query: string;
  /** 24h 내 검색 결과 영상 수 (상한 25) */
  videos: number;
  /** 상위 5편 조회 합 */
  topViews: number;
  /** totalScore 에 더하는 가점 0~15 */
  bonus: number;
}

/** 상위 5편 조회 합 → 가점. 5천 이하 0, 5만 6, 50만 12, 100만 이상 ≈ 14~15 (로그 스케일). */
export function buzzBonus(topViews: number): number {
  if (topViews <= 0) return 0;
  const b = (Math.log10(topViews) - 3.7) * 6;
  return Math.max(0, Math.min(15, Math.round(b)));
}

export async function measureBuzz(query: string): Promise<Buzz | null> {
  const q = query.trim();
  if (!q || !env.youtube.enabled()) return null;
  const auth = new google.auth.OAuth2(env.youtube.clientId(), env.youtube.clientSecret());
  auth.setCredentials({ refresh_token: env.youtube.refreshToken() });
  const yt = google.youtube({ version: 'v3', auth });
  const publishedAfter = new Date(Date.now() - 24 * 3600_000).toISOString();
  const s = await yt.search.list({
    part: ['id'],
    type: ['video'],
    q,
    publishedAfter,
    order: 'viewCount',
    maxResults: 25,
    regionCode: 'KR',
    relevanceLanguage: 'ko',
  });
  const ids = (s.data.items ?? []).map((i) => i.id?.videoId).filter((v): v is string => Boolean(v));
  let topViews = 0;
  if (ids.length) {
    const v = await yt.videos.list({ part: ['statistics'], id: ids });
    const views = (v.data.items ?? []).map((x) => Number(x.statistics?.viewCount ?? 0)).sort((a, b) => b - a);
    topViews = views.slice(0, 5).reduce((a, b) => a + b, 0);
  }
  return { query: q, videos: ids.length, topViews, bonus: buzzBonus(topViews) };
}

/** 후보 목록에 화제성 가점을 얹는다. 실패는 편성을 막지 않는다 — 가점 0 으로 진행. */
export async function applyBuzz<T extends { searchQuery?: string; totalScore: number; headline: string }>(
  candidates: T[],
): Promise<(T & { buzz?: Buzz })[]> {
  if (!env.buzz()) return candidates;
  const out: (T & { buzz?: Buzz })[] = [];
  for (const c of candidates) {
    const query = c.searchQuery?.trim();
    if (!query) { out.push(c); continue; }
    try {
      const buzz = await measureBuzz(query);
      if (!buzz) { out.push(c); continue; }
      log.info(`  화제성 "${buzz.query}": 24h ${buzz.videos}편 · 상위5 조회 ${buzz.topViews.toLocaleString()} → +${buzz.bonus}`);
      out.push({ ...c, buzz, totalScore: c.totalScore + buzz.bonus });
    } catch (e) {
      log.warn(`  화제성 측정 실패 "${query}": ${e instanceof Error ? e.message : e}`);
      out.push(c);
    }
  }
  return out.sort((a, b) => b.totalScore - a.totalScore);
}
