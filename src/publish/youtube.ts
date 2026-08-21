import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { env } from '../config.js';
import { log } from '../log.js';
import type { PublishRecord, Script } from '../types.js';

/**
 * Shorts 전용 API 는 없다. videos.insert 로 올리고, 세로 + 180초 이하이면
 * 유튜브가 알아서 Shorts 로 분류한다.
 *
 * 쿼터: 2026-06-01 부터 업로드가 전용 버킷으로 분리되어 호출당 1 unit / 하루 100회다.
 * (그 전에는 공유 풀에서 1,600 units 를 먹어 하루 6개가 상한이었다.)
 *
 * 주의: 2020-07-28 이후 생성된 미검증 프로젝트로 올리면 전부 비공개 잠금 상태가 된다.
 * 공개 발행하려면 Google 감사(audit)를 통과해야 한다.
 */
export interface YouTubeOptions {
  /** ISO datetime. When set, the video uploads private with a scheduled publish time. */
  publishAt?: string;
}

export async function publishToYouTube(
  script: Script,
  videoPath: string,
  options: YouTubeOptions = {},
): Promise<PublishRecord> {
  const auth = new google.auth.OAuth2(env.youtube.clientId(), env.youtube.clientSecret());
  auth.setCredentials({ refresh_token: env.youtube.refreshToken() });

  const youtube = google.youtube({ version: 'v3', auth });

  const tags = script.hashtags.slice(0, 15);
  const description = [
    script.description,
    '',
    script.hashtags.map((h) => `#${h}`).join(' '),
    '#Shorts',
  ].join('\n');

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title.slice(0, 100),
        description: description.slice(0, 5000),
        tags,
        categoryId: env.youtube.categoryId(),
        defaultLanguage: env.contentLanguage(),
        defaultAudioLanguage: env.contentLanguage(),
      },
      status: {
        // Scheduled publishing: upload private with publishAt and YouTube flips it
        // public at that time. This works even before your API project passes the
        // Google audit (which is required for direct public uploads).
        privacyStatus: options.publishAt ? 'private' : env.youtube.privacyStatus(),
        ...(options.publishAt ? { publishAt: new Date(options.publishAt).toISOString() } : {}),
        // Made-for-kids must be declared explicitly. Informational channels: false.
        selfDeclaredMadeForKids: false,
        // Realistic AI-generated content must be disclosed (platform policy, and
        // increasingly law). Set YOUTUBE_SYNTHETIC_MEDIA=false only if your
        // content contains no realistic synthetic media. (Cast: the field is
        // accepted by the API but missing from older googleapis typings.)
        ...({ containsSyntheticMedia: env.youtube.syntheticMedia() } as unknown as Record<string, never>),
      },
    },
    media: { body: createReadStream(videoPath) },
  });

  const id = res.data.id;
  if (!id) throw new Error('유튜브가 영상 ID 를 반환하지 않았습니다.');

  if (env.youtube.privacyStatus() === 'private') {
    log.warn('privacyStatus=private 으로 올렸습니다. 감사 통과 후 public 으로 바꾸세요.');
  }

  return {
    platform: 'youtube',
    remoteId: id,
    url: `https://www.youtube.com/shorts/${id}`,
    at: new Date().toISOString(),
  };
}
