import { loadChannel, nextPublishAt } from '../channel.js';
import { appendHistory, recentFor } from '../collect/history.js';
import { collect } from '../collect/rss.js';
import { buildBrief, selectTopic } from '../collect/select.js';
import { log } from '../log.js';
import { createJob, list, localDate, save } from '../store.js';
import type { Job } from '../types.js';

export interface DailyOptions {
  channelId: string;
  windowHours?: number;
  /** 주제 선정까지만 하고 잡을 만들지 않는다. 편성 판단을 눈으로 확인할 때. */
  dryRun?: boolean;
  scheduledAt?: string;
}

/**
 * 하루 한 편의 편성 결정.
 *   24시간 기사 수집 → 이슈 군집·점수 → 1건 선정 → 사실 목록 추출 → 잡 생성
 *
 * 대본·렌더·발행은 기존 build/publish 가 이어받는다.
 */
export async function daily(options: DailyOptions): Promise<Job | null> {
  const { channelId, windowHours = 24, dryRun = false, scheduledAt } = options;
  const channel = loadChannel(channelId);

  // 멱등성: 같은 날 같은 채널 편성이 이미 있으면 건너뛴다.
  // 스케줄러가 재시도 등으로 하루에 여러 번 돌아도 잡이 하나만 생겨야 한다.
  const today = localDate();
  const existing = list().find(
    (j) =>
      j.channelId === channelId &&
      localDate(new Date(j.createdAt)) === today &&
      j.status !== 'failed',
  );
  if (existing && !dryRun) {
    log.info(`오늘(${today}) ${channelId} 편성이 이미 있습니다: ${existing.id} — 건너뜁니다.`);
    return existing;
  }

  log.step(`[${channel.name}] 최근 ${windowHours}시간 기사 수집`);
  const { articles, feedStatus } = await collect(windowHours);
  for (const f of feedStatus) {
    log.info(`  ${f.source.padEnd(6)} ${f.error ? `실패 — ${f.error}` : `${f.count}건`}`);
  }
  if (articles.length === 0) {
    log.error('수집된 기사가 없습니다. 피드 상태를 확인하세요.');
    return null;
  }
  log.info(`  합계 ${articles.length}건`);

  const recent = recentFor(channel.id);
  log.step(`주제 선정 (최근 ${recent.length}건 회피)`);
  const candidates = await selectTopic(articles, channel, recent);

  console.log('');
  for (const [i, c] of candidates.entries()) {
    const mark = i === 0 ? '\x1b[32m★\x1b[0m' : ' ';
    console.log(`  ${mark} [${String(c.totalScore).padStart(3)}] ${c.headline}`);
    console.log(
      `      \x1b[2m보도 ${c.coverage}개 (${c.leanCoverage}) · 숏폼 ${c.shortformFit} · 채널 ${c.channelFit} · 신선도 ${c.freshness} · 중복 ${c.duplicateRisk}\x1b[0m`,
    );
    console.log(`      \x1b[2m${c.reason}\x1b[0m`);
  }
  console.log('');

  const winner = candidates[0];
  if (!winner) {
    log.error('후보가 없습니다.');
    return null;
  }
  if (winner.duplicateRisk >= 8) {
    log.warn(`1순위의 중복 위험이 ${winner.duplicateRisk}/10 입니다. 최근 주제와 겹칩니다.`);
  }

  log.step('사실 목록 추출');
  const brief = await buildBrief(winner, articles, channel);
  log.info(`  각도: ${brief.angle}`);
  log.info(`  사실 ${brief.facts.length}건 · 주의 ${brief.caution.length}건 · 출처 ${brief.sources.length}개`);
  for (const c of brief.caution) log.warn(`  주의: ${c}`);

  if (dryRun) {
    log.info('dry-run — 잡을 만들지 않았습니다.');
    return null;
  }

  // 채널마다 발행 시각을 달리한다 — 여러 채널이 초 단위로 같이 올라가면
  // 같은 스케줄러가 돌리고 있다는 신호가 된다 (docs/CHANNEL.md §3-1).
  const publishAt = scheduledAt ?? nextPublishAt(channel);

  const job = save({
    ...createJob(brief.headline, publishAt),
    channelId: channel.id,
    brief,
    runnerUps: candidates.slice(1),
  });
  if (publishAt) log.info(`  발행 예정 ${publishAt.slice(0, 16).replace('T', ' ')}`);

  appendHistory({
    date: new Date().toISOString(),
    channelId: channel.id,
    headline: brief.headline,
    keywords: brief.keywords,
  });

  log.ok(`잡 생성 · ${job.id}`);
  return job;
}
