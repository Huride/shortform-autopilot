import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { listChannels } from './channel.js';
import { collect } from './collect/rss.js';
import { env } from './config.js';
import { checkChannelFonts } from './fonts.js';
import { buildPinnedComment } from './pipeline/comment.js';
import { usage, usageSummary } from './llm.js';
import { log } from './log.js';
import { daily } from './pipeline/daily.js';
import { build, enabledPlatforms, publish } from './pipeline/index.js';
import { buildWeekly } from './pipeline/weekly.js';
import { createJob, list, load, save } from './store.js';
import { atLeast, type Job, type Platform } from './types.js';

const HELP = `
auto-rills — 시사·정보형 숏폼 자동 생성·발행

  일일 편성
  pnpm cli daily --channel <id> [--dry-run] [--hours 24] [--at <ISO>] [--slot am|pm] [--min-score 60]
                                           24시간 기사 → 주제 선정(화제성 실측·중복 제외) → 사실 추출 → 잡 생성
                                           --min-score: 1순위가 임계 미만이면 편성을 쉰다

  수동
  pnpm cli add "<소재>" [--channel <id>] [--at <ISO시각>]

  주간 결산 (일요일 · 유튜브 전용 가로 롱폼)
  pnpm cli weekly [--channel <id>] [--publish]
                                           그 주 발행분을 챕터로 재구성해 생성·렌더

  공통
  pnpm cli build [<id>]                    대본 → 음성 → 렌더 (id 없으면 미완료 전부)
  pnpm cli publish [<id>] [--to yt,ig]     발행 (id 없으면 렌더 완료분 전부)
  pnpm cli run [--to yt,ig]                build + publish
  pnpm cli status                          큐 상태
  pnpm cli sources <id>                    출처 목록 (고정 댓글용)
  pnpm cli retry <id>                      실패한 잡을 마지막 성공 지점으로 되돌린다
  pnpm cli feeds                           RSS 피드 상태 점검
  pnpm cli doctor                          환경 점검
`;

function parseFlags(args: string[]): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const next = args[i + 1];
      // 다음 토큰이 또 다른 플래그거나 없으면 불리언 플래그로 본다 (--dry-run 등).
      if (next === undefined || next.startsWith('--')) {
        flags.set(arg.slice(2), '');
      } else {
        flags.set(arg.slice(2), next);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function resolvePlatforms(flag: string | undefined): Platform[] {
  if (!flag) {
    const enabled = enabledPlatforms();
    if (enabled.length === 0) {
      throw new Error('발행 대상이 없습니다. .env 에 유튜브 또는 인스타 자격증명을 넣으세요.');
    }
    return enabled;
  }
  return flag.split(',').map((raw) => {
    const t = raw.trim().toLowerCase();
    if (t === 'yt' || t === 'youtube') return 'youtube';
    if (t === 'ig' || t === 'instagram') return 'instagram';
    throw new Error(`알 수 없는 플랫폼: ${raw}`);
  });
}

function summary(job: Job): string {
  const platforms = (job.published ?? []).map((p) => p.platform[0]!.toUpperCase()).join('');
  const when = job.scheduledAt ? ` @${job.scheduledAt.slice(0, 16)}` : '';
  const channel = job.channelId ? `${job.channelId.padEnd(6)}` : '—     ';
  return `${job.id}  ${channel} ${job.status.padEnd(9)} ${platforms.padEnd(3)}${when}  ${job.script?.title ?? job.topic}`;
}

/** 산출물이 실제로 남아 있는 마지막 단계까지 되감는다. */
function rewind(job: Job): Job {
  if (job.videoPath && existsSync(job.videoPath)) return { ...job, status: 'rendered', error: undefined };
  if (job.audio?.length) return { ...job, status: 'voiced', error: undefined };
  if (job.script) return { ...job, status: 'scripted', error: undefined };
  return { ...job, status: 'pending', error: undefined };
}

function doctor(): void {
  const rows: [string, boolean | 'warn', string][] = [];
  const has = (fn: () => unknown): boolean => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };

  const [major, minor] = process.versions.node.split('.').map(Number);
  rows.push([
    'Node',
    (major ?? 0) > 20 || ((major ?? 0) === 20 && (minor ?? 0) >= 11),
    `v${process.versions.node} (>=20.11)`,
  ]);

  const llm = env.llmProvider();
  rows.push([
    `LLM (${llm})`,
    llm === 'openai' ? has(env.openaiApiKey) : has(env.anthropicApiKey),
    llm === 'openai'
      ? `${env.openaiModel()} · reasoning=${env.openaiReasoningEffort()}`
      : env.model(),
  ]);

  const channels = listChannels();
  rows.push(['채널 설정', channels.length > 0, channels.join(', ') || 'channels/*.json 없음']);

  // 폰트가 없어도 렌더는 성공한다 — 조용히 기본 산세리프로 떨어질 뿐이라
  // 채널끼리 같은 얼굴이 된다. 그래서 점검 대상이다.
  const fonts = checkChannelFonts();
  if (fonts === null) {
    rows.push(['채널 폰트', 'warn', 'fc-list 없음 — 설치 여부 확인 불가']);
  } else {
    const missing = fonts.filter((f) => !f.installed);
    rows.push([
      '채널 폰트',
      missing.length === 0 || 'warn',
      missing.length === 0
        ? fonts.map((f) => `${f.channelId}=${f.family}`).join(' · ')
        : `누락: ${missing.map((f) => `${f.channelId}(${f.family})`).join(', ')} — 기본 폰트로 떨어집니다`,
    ]);
  }

  const tts = env.tts.provider();
  rows.push([
    `TTS (${tts})`,
    tts === 'openai' ? has(env.openaiApiKey)
      : tts === 'elevenlabs' ? has(env.tts.elevenLabsKey) && has(env.tts.voiceId)
      : 'warn',
    tts === 'openai' ? `${env.tts.openaiModel()} · 기본 목소리 ${env.tts.openaiVoice()}`
      : tts === 'elevenlabs' ? `elevenlabs · ${env.tts.modelId()}`
      : 'stub (무음 · 길이만 추정)',
  ]);

  let ffprobe = false;
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    ffprobe = true;
  } catch {
    /* 없어도 CBR 환산으로 대체된다 */
  }
  rows.push(['ffprobe', ffprobe ? true : 'warn', ffprobe ? '설치됨' : '없음 — MP3 비트레이트로 길이 환산']);

  rows.push([
    '스토리지 (인스타 필수)',
    env.storage.enabled() ? has(env.storage.publicBaseUrl) : 'warn',
    env.storage.enabled() ? env.storage.publicBaseUrl() : '미설정 — 인스타 발행 불가',
  ]);

  rows.push([
    'YouTube',
    env.youtube.enabled() ? has(env.youtube.refreshToken) : 'warn',
    env.youtube.enabled() ? `privacyStatus=${env.youtube.privacyStatus()}` : '미설정',
  ]);

  rows.push([
    'Instagram',
    env.instagram.enabled() ? has(env.instagram.accessToken) : 'warn',
    env.instagram.enabled() ? env.instagram.graphHost() : '미설정',
  ]);

  console.log('');
  for (const [name, ok, note] of rows) {
    const mark = ok === true ? '\x1b[32m✓\x1b[0m' : ok === 'warn' ? '\x1b[33m!\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${mark} ${name.padEnd(24)} \x1b[2m${note}\x1b[0m`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseFlags(rest);

  switch (command) {
    case 'daily': {
      const channelId = flags.get('channel');
      if (!channelId) {
        throw new Error(`--channel 을 지정하세요. 사용 가능: ${listChannels().join(', ')}`);
      }
      await daily({
        channelId,
        windowHours: Number(flags.get('hours')) || 24,
        dryRun: flags.has('dry-run'),
        scheduledAt: flags.get('at') || undefined,
        slot: flags.get('slot') || undefined,
        minScore: flags.get('min-score') ? Number(flags.get('min-score')) : undefined,
      });
      break;
    }

    case 'add': {
      const topic = positional.join(' ').trim();
      if (!topic) throw new Error('소재를 입력하세요. 예: pnpm cli add "전기차 배터리 겨울 성능"');
      const channelId = flags.get('channel');
      const job = save({
        ...createJob(topic, flags.get('at') || undefined),
        ...(channelId ? { channelId } : {}),
      });
      log.ok(`추가됨 · ${job.id}`);
      break;
    }

    case 'feeds': {
      const { articles, feedStatus } = await collect(Number(flags.get('hours')) || 24);
      console.log('');
      for (const f of feedStatus) {
        const mark = f.error ? '\x1b[31m✗\x1b[0m' : f.count > 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[33m!\x1b[0m';
        console.log(`  ${mark} ${f.source.padEnd(8)} ${String(f.count).padStart(4)}건 ${f.error ?? ''}`);
      }
      console.log(`\n  합계 ${articles.length}건\n`);
      break;
    }

    case 'sources': {
      const id = positional[0];
      if (!id) throw new Error('잡 ID 를 입력하세요.');
      const job = load(id);
      if (!job.brief) {
        log.info('이 잡에는 취재 출처가 없습니다 (수동 추가된 잡).');
        break;
      }
      // 고정 댓글에 그대로 붙여넣는 완성형 — 인용된 매체만, 매체당 2건, 최대 8건.
      const comment = buildPinnedComment(job);
      console.log(comment ? `\n${comment}\n` : '\n출처를 구성할 수 없습니다.\n');
      break;
    }

    case 'build': {
      const targets = positional[0]
        ? [load(positional[0])]
        : list().filter(
            (j) => !atLeast(j.status, 'rendered') && j.status !== 'failed' && j.kind !== 'weekly',
          );
      if (targets.length === 0) {
        log.info('빌드할 잡이 없습니다.');
        break;
      }
      for (const job of targets) await build(job);
      break;
    }

    case 'publish': {
      const platforms = resolvePlatforms(flags.get('to'));
      const targets = positional[0]
        ? [load(positional[0])]
        : list().filter((j) => atLeast(j.status, 'rendered') && j.status !== 'published');
      if (targets.length === 0) {
        log.info('발행할 잡이 없습니다.');
        break;
      }
      for (const job of targets) await publish(job, platforms);
      break;
    }

    case 'run': {
      const platforms = resolvePlatforms(flags.get('to'));
      for (const job of list().filter(
        (j) => j.status !== 'published' && j.status !== 'failed' && j.kind !== 'weekly',
      )) {
        const built = await build(job);
        if (atLeast(built.status, 'rendered')) await publish(built, platforms);
      }
      break;
    }

    case 'weekly': {
      // 일요일 주간 결산 롱폼 — 그 주 발행분을 챕터로 재구성해 유튜브 전용으로.
      const channelId = flags.get('channel') ?? 'example';
      const job = await buildWeekly(channelId);
      if (flags.has('publish')) {
        await publish(job, ['youtube']);
      } else {
        log.info(`렌더 완료 — 발행하려면: pnpm cli publish ${job.id} --to yt`);
      }
      break;
    }

    case 'status': {
      const jobs = list();
      if (jobs.length === 0) {
        log.info('큐가 비어 있습니다.');
        break;
      }
      console.log('');
      for (const job of jobs) console.log(`  ${summary(job)}`);
      console.log('');
      break;
    }

    case 'retry': {
      const id = positional[0];
      if (!id) throw new Error('잡 ID 를 입력하세요.');
      const job = save(rewind(load(id)));
      log.ok(`${job.id} → ${job.status}`);
      break;
    }

    case 'doctor':
      doctor();
      break;

    default:
      console.log(HELP);
  }
}

main()
  .then(() => {
    if (usage.calls > 0) log.info(usageSummary());
  })
  .catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    if (usage.calls > 0) log.info(usageSummary());
    process.exitCode = 1;
  });
