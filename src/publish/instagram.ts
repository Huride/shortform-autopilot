import { setTimeout as sleep } from 'node:timers/promises';
import { env } from '../config.js';
import { log } from '../log.js';
import type { PublishRecord, Script } from '../types.js';

/**
 * 릴스 발행은 2단계다.
 *   1) POST /{ig-user-id}/media?media_type=REELS&video_url=...  → creation_id
 *   2) status_code 가 FINISHED 될 때까지 폴링 (인코딩이 비동기라 필수)
 *   3) POST /{ig-user-id}/media_publish?creation_id=...
 *
 * 전제: 프로페셔널 계정 + instagram_business_content_publish 권한(앱 심사) + 공개 video_url.
 * 한도: 계정당 24시간 이동 윈도우 100건.
 */

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function base(): string {
  return `https://${env.instagram.graphHost()}/${env.instagram.apiVersion()}`;
}

async function graph(
  path: string,
  params: Record<string, string>,
  method: 'GET' | 'POST' = 'POST',
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ ...params, access_token: env.instagram.accessToken() });
  const url = method === 'GET' ? `${base()}${path}?${query}` : `${base()}${path}`;

  const res = await fetch(url, {
    method,
    ...(method === 'POST'
      ? {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: query,
        }
      : {}),
  });

  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string; code?: number } | undefined;
    throw new Error(`Instagram ${res.status} (${err?.code ?? '?'}): ${err?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

/** 컨테이너 인코딩이 끝날 때까지 기다린다. FINISHED 전에 publish 하면 실패한다. */
async function waitForContainer(creationId: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const body = await graph(`/${creationId}`, { fields: 'status_code,status' }, 'GET');
    const status = String(body.status_code ?? '');

    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`컨테이너 처리 실패 (${status}): ${String(body.status ?? '')}`);
    }

    log.info(`  컨테이너 ${status || 'IN_PROGRESS'} — 대기 중`);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`컨테이너 인코딩이 ${POLL_TIMEOUT_MS / 1000}초 안에 끝나지 않았습니다.`);
}

async function publishContainer(
  params: Record<string, string>,
): Promise<string> {
  const created = await graph(`/${env.instagram.userId()}/media`, params);
  const creationId = String(created.id ?? '');
  if (!creationId) throw new Error('컨테이너 ID 를 받지 못했습니다.');
  log.info(`  컨테이너 생성 · ${creationId}`);

  await waitForContainer(creationId);

  const published = await graph(`/${env.instagram.userId()}/media_publish`, {
    creation_id: creationId,
  });
  const mediaId = String(published.id ?? '');
  if (!mediaId) throw new Error('발행 응답에 미디어 ID 가 없습니다.');
  return mediaId;
}

export async function publishToInstagram(
  script: Script,
  publicVideoUrl: string,
): Promise<PublishRecord> {
  const caption = [script.description, '', script.hashtags.map((h) => `#${h}`).join(' ')]
    .join('\n')
    .slice(0, 2200);

  const mediaId = await publishContainer({
    media_type: 'REELS',
    video_url: publicVideoUrl,
    caption,
    share_to_feed: 'true',
  });

  // 릴스 발행 후 같은 영상을 스토리로도 흘린다. 팔로워 도달이 한 번 더 생기고,
  // 24시간 뒤 사라지는 스토리의 성격이 "오늘의 이슈"와 맞는다.
  // 스토리 실패는 치명적이지 않다 — 릴스는 이미 나갔으므로 경고만 남긴다.
  if (env.instagram.storyEnabled()) {
    try {
      log.info('  스토리 발행');
      const storyId = await publishContainer({
        media_type: 'STORIES',
        video_url: publicVideoUrl,
      });
      log.info(`  스토리 완료 · ${storyId}`);
    } catch (error) {
      log.warn(`  스토리 실패 (릴스는 발행됨): ${error instanceof Error ? error.message : error}`);
    }
  }

  // permalink 를 저장해두면 status 출력과 사후 확인이 편하다. 실패해도 발행은 유효.
  let url: string | undefined;
  try {
    const media = await graph(`/${mediaId}`, { fields: 'permalink' }, 'GET');
    url = typeof media.permalink === 'string' ? media.permalink : undefined;
  } catch {
    /* permalink 조회 실패는 무시 */
  }

  return {
    platform: 'instagram',
    remoteId: mediaId,
    ...(url ? { url } : {}),
    at: new Date().toISOString(),
  };
}
