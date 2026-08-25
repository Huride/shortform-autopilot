import { loadChannel } from '../channel.js';
import { env } from '../config.js';
import { log } from '../log.js';
import { publishToInstagram } from '../publish/instagram.js';
import { publishOpsPage } from '../publish/ops-page.js';
import { uploadPublic } from '../publish/storage.js';
import { publishToYouTube } from '../publish/youtube.js';
import { markFailed, save } from '../store.js';
import { atLeast, type Job, type Platform } from '../types.js';
import { generateBackground } from './image.js';
import { renderShort, toShortProps } from './render.js';
import { generateScript, withDisclosure } from './script.js';
import { synthesizeScript } from './tts.js';

/** 발행 직전까지. 발행은 시간·심사가 걸려 있어 별도 명령으로 분리한다. */
export async function build(job: Job): Promise<Job> {
  if (job.kind === 'weekly') {
    // 주간 결산은 자체 파이프라인(weekly.ts)이 처음부터 렌더까지 책임진다.
    throw new Error(`[${job.id}] 주간 결산 잡은 build 로 처리할 수 없습니다. pnpm cli weekly 를 쓰세요.`);
  }
  let current = job;
  const channel = current.channelId ? loadChannel(current.channelId) : undefined;

  try {
    if (!atLeast(current.status, 'scripted')) {
      log.step(`[${current.id}] 대본 생성 — ${current.topic}`);
      const raw = await generateScript({
        topic: current.topic,
        channel,
        brief: current.brief,
      });
      // AI 고지는 코드에서 붙인다 — 모델이 빠뜨려도 반드시 들어가야 한다.
      let script = channel ? withDisclosure(raw, channel) : raw;
      log.info(`  "${script.title}" · 장면 ${script.scenes.length}개`);
      // 사인오프 캐치프레이즈 장면은 브랜드 아웃트로 화면 위에서 나온다.
      const last = script.scenes[script.scenes.length - 1];
      if (channel?.signoff && last && last.narration.includes(channel.signoff.slice(0, 8))) {
        script = { ...script, scenes: [...script.scenes.slice(0, -1), { ...last, outro: true }] };
      }
      current = save({ ...current, script, status: 'scripted' });
    }

    if (!atLeast(current.status, 'voiced')) {
      if (!current.script) throw new Error('대본이 없습니다.');
      log.step(`[${current.id}] 음성 합성`);
      const audio = await synthesizeScript(current.id, current.script, {
        voice: channel?.voice,
        style: channel?.voiceStyle,
        speed: channel?.voiceSpeed,
        modelId: channel?.ttsSettings?.modelId,
        stability: channel?.ttsSettings?.stability,
        similarityBoost: channel?.ttsSettings?.similarityBoost,
        elStyle: channel?.ttsSettings?.style,
        postTempo: channel?.ttsSettings?.postTempo,
      });
      current = save({ ...current, audio, status: 'voiced' });
    }

    // 배경 이미지는 있으면 좋은 것이지 필수가 아니다 — 실패해도 테마 배경으로 렌더한다.
    const scenesHaveBg = (current.script?.scenes ?? []).every((s) => s.bg);
    if (channel && env.backgroundImages() && !current.backgroundImage && current.brief && !scenesHaveBg) {
      log.step(`[${current.id}] 배경 이미지 생성`);
      try {
        const backgroundImage = await generateBackground(current.id, current.brief, channel);
        log.ok(`  ${backgroundImage}`);
        current = save({ ...current, backgroundImage });
      } catch (error) {
        log.warn(`  실패 — 테마 배경으로 진행합니다: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (!atLeast(current.status, 'rendered')) {
      if (!current.script || !current.audio) throw new Error('대본 또는 음성이 없습니다.');
      log.step(`[${current.id}] 렌더`);
      const props = toShortProps(current.script, current.audio, channel?.theme, {
        signoff: channel?.signoff,
        backgroundImage: current.backgroundImage,
        bgmSrc: channel?.bgm,
        bgmVolume: channel?.bgmVolume,
        brand: channel?.name,
        brandTagline: channel?.tagline,
        brandLogo: channel?.logo,
      });
      const videoPath = await renderShort(current.id, props);
      log.ok(`  ${videoPath}`);
      current = save({ ...current, videoPath, status: 'rendered' });
    }

    return current;
  } catch (error) {
    log.error(`[${current.id}] ${error instanceof Error ? error.message : String(error)}`);
    return markFailed(current, error);
  }
}

export async function publish(job: Job, platforms: Platform[]): Promise<Job> {
  let current = job;

  // 주간 결산은 가로 롱폼이라 인스타 릴스에 못 나간다 — 대상이 섞여 들어와도 막는다.
  if (current.kind === 'weekly') {
    platforms = platforms.filter((p) => p === 'youtube');
    if (platforms.length === 0) {
      log.info(`[${current.id}] 주간 결산은 유튜브 전용입니다 — 발행 대상 없음.`);
      return current;
    }
  }

  const { script, videoPath } = current;
  if (!atLeast(current.status, 'rendered') || !videoPath || !script) {
    throw new Error(`[${current.id}] 아직 렌더되지 않았습니다 (status: ${current.status}).`);
  }
  // With publishAt support the upload itself can happen early — YouTube holds it
  // private until the scheduled moment. Set HOLD_UNTIL_SCHEDULED=true to keep the
  // old behavior (skip until the wall clock passes scheduledAt).
  if (process.env.HOLD_UNTIL_SCHEDULED === 'true'
      && current.scheduledAt && new Date(current.scheduledAt) > new Date()) {
    log.info(`[${current.id}] before scheduled time (${current.scheduledAt}); skipping.`);
    return current;
  }

  const already = new Set((current.published ?? []).map((p) => p.platform));
  const todo = platforms.filter((p) => !already.has(p));
  if (todo.length === 0) {
    log.info(`[${current.id}] 이미 모든 대상에 발행되었습니다.`);
    return current;
  }

  // 인스타는 공개 URL 을 요구한다 — Meta 가 그 URL 로 직접 cURL 해간다.
  if (todo.includes('instagram') && !current.publicUrl) {
    log.step(`[${current.id}] 스토리지 업로드`);
    const publicUrl = await uploadPublic(videoPath, `videos/${current.id}.mp4`);
    log.info(`  ${publicUrl}`);
    current = save({ ...current, publicUrl, status: 'uploaded' });
  }

  const records = [...(current.published ?? [])];

  for (const platform of todo) {
    try {
      log.step(`[${current.id}] 발행 → ${platform}`);
      const record =
        platform === 'youtube'
          ? await publishToYouTube(script, videoPath, { publishAt: current.scheduledAt , ...(current.thumbnailPath ? { thumbnailPath: current.thumbnailPath } : {}) })
          : await publishToInstagram(script, current.publicUrl!);
      log.ok(`  ${record.url ?? record.remoteId}`);
      records.push(record);
      current = save({ ...current, published: records });
    } catch (error) {
      // 한 플랫폼이 죽어도 나머지는 계속 간다. 성공분은 이미 저장돼 재시도해도 중복되지 않는다.
      log.error(`  ${platform}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const done = new Set(records.map((r) => r.platform));
  const allDone = platforms.every((p) => done.has(p));
  current = save({ ...current, published: records, status: allDone ? 'published' : current.status });

  // 운영 페이지 갱신 — 폰에서 링크·고정댓글을 바로 보는 용도. 실패해도 발행은 유효.
  if (records.length > 0) {
    try {
      await publishOpsPage();
    } catch (error) {
      log.warn(`운영 페이지 갱신 실패: ${error instanceof Error ? error.message : error}`);
    }
  }
  return current;
}

export function enabledPlatforms(): Platform[] {
  const platforms: Platform[] = [];
  if (env.youtube.enabled()) platforms.push('youtube');
  if (env.instagram.enabled()) platforms.push('instagram');
  return platforms;
}
