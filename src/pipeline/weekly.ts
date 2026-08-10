import * as z from 'zod/v4';
import type { ShortScene, WeeklyChapter, WeeklyProps } from '../../remotion/schema.js';
import { loadChannel, type Channel } from '../channel.js';
import { RefusalError, generateStructured } from '../llm.js';
import { log } from '../log.js';
import { list, localDate, save } from '../store.js';
import { VIDEO, type AudioTrack, type Job, type Scene } from '../types.js';
import { renderWeekly } from './render.js';
import { SceneSchema, VISUAL_RULES, normalizeScenes, withDisclosure } from './script.js';
import { synthesizeScript } from './tts.js';

/**
 * Sunday weekly-recap longform (YouTube-only, landscape 1080p).
 *
 * No new research: the week's daily briefs (already fact-locked) and their
 * generated backgrounds are recomposed into chapters. Only the script is
 * rewritten, in recap voice. We never copy narration/audio from the dailies —
 * verbatim reuse across videos is exactly what YouTube's repetitious-content
 * policy targets.
 */

/**
 * Per-chapter word budget. Rule of thumb: ~2.6 words/sec at typical TTS pacing.
 * 180–220 words per chapter ≈ 70–85s → 7 chapters (a full week) lands 9–10 min,
 * a 4-issue week around 6. Cap is ~10 minutes — never pad to fill; the video is
 * as long as the week's issues.
 */
const CHAPTER_WORDS = '180–220 words';
const MAX_CHAPTERS = 7;

/** Longform caps narration speed lower than shorts — fast reading tires over 10 minutes. */
const WEEKLY_MAX_SPEED = 1.35;

interface WeekIssue {
  date: string; // local YYYY-MM-DD
  job: Job;
}

/** Collect the week's published daily jobs, one per date (latest wins on re-uploads). */
export function gatherWeek(channelId: string, days = 7): WeekIssue[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byDate = new Map<string, Job>();
  for (const job of list()) {
    if (job.channelId !== channelId || job.kind === 'weekly') continue;
    if (!job.brief || !job.published?.length) continue;
    if (new Date(job.createdAt) < cutoff) continue;
    const date = localDate(new Date(job.createdAt));
    const prev = byDate.get(date);
    if (!prev || job.updatedAt > prev.updatedAt) byDate.set(date, job);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-MAX_CHAPTERS)
    .map(([date, job]) => ({ date, job }));
}

/* ─── Step 1: the frame — title, opening, closing, chapter titles ─── */

const FrameSchema = z.object({
  title: z
    .string()
    .describe(
      'Hooking YouTube title, under 70 characters. Clearly a weekly briefing, no clickbait. e.g. "This week in politics: 5 things you need to know"',
    ),
  weekLabel: z.string().describe('The week label, max 4 words. e.g. "Week 32 Briefing".'),
  opening: z
    .array(SceneSchema)
    .describe(
      'Exactly 2 scenes. Scene 1 (12–20 words): one breath that opens the week, spoken over the title card. Scene 2 (18–28 words): preview of the issues covered — the chapter rundown is on screen during this. Total must stay under 45 words; a long intro loses viewers. visualKind: none.',
    ),
  closing: z
    .array(SceneSchema)
    .describe(
      "Closing 2–3 scenes. Tie the individual issues into one through-line in the channel's voice. 35–50 words total. keyword visuals allowed.",
    ),
  chapterTitles: z
    .array(z.string())
    .describe('One chapter title per issue, in the given order. Max 6 words each. Same count as the issues.'),
  description: z
    .string()
    .describe(
      'YouTube description. One key sentence, blank line, one "▷ " summary line per issue, blank line, one closing sentence. No hashtags.',
    ),
  hashtags: z.array(z.string()).describe("Tag bodies without '#'. 5–10."),
});

function frameSystem(channel: Channel): string {
  return `You are the weekly-recap planner of a commentary YouTube channel.
This is a commentary channel, not a news channel — it organizes the week's issues through the channel's lens.

## Channel stance
${channel.stance}

## Channel frames
${channel.framing.map((f) => `- ${f}`).join('\n')}

The opening must make viewers anticipate "what happened this week", and the
closing must bind the individual issues into one through-line of commentary.
Never open with greetings or self-introduction — straight into it.

${VISUAL_RULES}

## Never do
${channel.guardrails.map((g) => `- ${g}`).join('\n')}`;
}

/* ─── Step 2: chapter scripts ─────────────────────────────────────── */

const ChapterSchema = z.object({
  scenes: z.array(SceneSchema).describe(`7–9 scenes. Total narration ${CHAPTER_WORDS}.`),
});

function chapterSystem(channel: Channel): string {
  return `You are the script writer for the weekly recap of a commentary YouTube channel.
**This is a commentary channel.** It takes positions grounded in facts.

## Channel stance
${channel.stance}

## Channel frames
${channel.framing.map((f) => `- ${f}`).join('\n')}

## Chapter rules
- You are writing **one chapter** of a weekly recap. 7–9 scenes, total narration
  ${CHAPTER_WORDS}. The total outranks the scene count — come in short and the
  longform collapses into a stack of shorts.
- A chapter is a **complete piece of commentary** on its own: what happened
  (facts) → why it matters (take) → what the other side says (if available) →
  how to read it (take).
- **Alternate fact scenes and commentary scenes.** Facts alone are news, not
  commentary. If more than half the scenes end as flat declaratives, it fails.
- **Recap voice**: "this week", "on Tuesday" — looking back over the week.
  Same-day deictics ("today", "tomorrow") are forbidden.
- Full spoken sentences. No telegraphic style. It must sound natural aloud.
  Breathe wider than shorts, but no filler padding.
- Captions must work with sound off. Max 7 words per scene.

## Fact rules — constraints, not style
- Only the "facts list" below may be stated as fact. Nothing from outside it.
- Anything under "caution" must be hedged: keep "alleged", "claimed", "under investigation".
- Go hard on the take, stay exact on the facts.

${VISUAL_RULES}
- Put a visual on **every scene**. Longform screens linger — an empty center
  reads even emptier than in shorts. Never use none.

## Never do
${channel.guardrails.map((g) => `- ${g}`).join('\n')}`;
}

function chapterUser(issue: WeekIssue, index: number, prevTitle: string | undefined): string {
  const brief = issue.job.brief!;
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(issue.job.createdAt).getDay()
  ];
  return `## The issue (covered ${weekday}, ${issue.date})
${brief.headline}
${brief.summary}

## The angle this channel took
${brief.angle}

## Facts list (only these may be stated as fact)
${brief.facts.map((f, i) => `${i + 1}. ${f.claim}  [${f.sources.join(', ')}]`).join('\n')}

## Caution (must be hedged)
${brief.caution.length ? brief.caution.map((c) => `- ${c}`).join('\n') : '- (none)'}

This is chapter ${index + 1} of the weekly recap.${
    prevTitle
      ? ` The previous chapter was "${prevTitle}" — open the first scene with a natural transition ("Next up", "Meanwhile", "Then there's...").`
      : ' It is the first chapter — it follows the opening, so go straight into the story.'
  }
Write the chapter script from the above.`;
}

/* ─── Assembly ────────────────────────────────────────────────────── */

function toShortScenes(scenes: Scene[], tracks: AudioTrack[], offset: number): ShortScene[] {
  return scenes.map((scene, i) => {
    const track = tracks[offset + i];
    if (!track) throw new Error(`Missing audio for scene ${offset + i}.`);
    return {
      caption: scene.caption,
      ...(scene.emphasis ? { emphasis: scene.emphasis } : {}),
      ...(scene.visual ? { visual: scene.visual } : {}),
      ...(track.staticPath ? { audioSrc: track.staticPath } : {}),
      durationInFrames: Math.max(Math.round(track.durationSec * VIDEO.fps), 1),
    };
  });
}

/** Chapter timestamps for the YouTube description — 3+ entries starting at 00:00 create chapter markers. */
function timestamps(opening: ShortScene[], chapters: WeeklyChapter[]): string {
  const fmt = (frames: number): string => {
    const sec = Math.floor(frames / VIDEO.fps);
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };
  const sum = (scenes: ShortScene[]) => scenes.reduce((a, s) => a + s.durationInFrames, 0);

  const lines = ['00:00 Intro'];
  let cursor = sum(opening);
  for (const chapter of chapters) {
    lines.push(`${fmt(cursor)} ${chapter.title}`);
    cursor += 66 + sum(chapter.scenes); // CHAPTER_CARD_FRAMES
  }
  return lines.join('\n');
}

export async function buildWeekly(channelId: string): Promise<Job> {
  const channel = loadChannel(channelId);
  const issues = gatherWeek(channelId);
  if (issues.length < 3) {
    throw new Error(`Only ${issues.length} published dailies in the last 7 days. A weekly recap needs at least 3.`);
  }
  log.step(`Weekly recap — ${issues.length} issues (${issues[0]!.date} ~ ${issues.at(-1)!.date})`);

  const id = `${localDate()}-weekly`;
  const existing = list().find((j) => j.id === id);

  // A job that died mid-render retries the render only — no new script/TTS spend.
  if (existing?.weeklyProps && !existing.videoPath) {
    log.step(`[${id}] retrying render from saved script and audio`);
    const videoPath = await renderWeekly(id, existing.weeklyProps);
    log.ok(`  ${videoPath}`);
    return save({ ...existing, videoPath, status: 'rendered' });
  }
  if (existing && existing.status !== 'failed') {
    throw new Error(`Today's weekly recap already exists (${id}, ${existing.status}). Delete data/jobs/${id}.json to rebuild.`);
  }

  try {
    // 1) Frame: title, opening, closing, chapter titles
    log.step('Building the frame');
    const issueList = issues
      .map(
        (it, i) =>
          `${i + 1}. [${it.date}] ${it.job.brief!.headline}\n   angle: ${it.job.brief!.angle}\n   key facts: ${it.job.brief!.facts.slice(0, 3).map((f) => f.claim).join(' / ')}`,
      )
      .join('\n\n');
    const frame = await generateStructured({
      system: frameSystem(channel),
      user: `These are the issues covered this week:\n\n${issueList}\n\nBuild the weekly-recap frame from these ${issues.length} issues.`,
      schema: FrameSchema,
      name: 'weekly_frame',
    });
    log.info(`  "${frame.title}"`);

    // 2) Chapter scripts — pass the previous chapter's title for transition narration
    const chapterScenes: Scene[][] = [];
    for (const [i, issue] of issues.entries()) {
      log.step(`Chapter ${i + 1}/${issues.length} — ${issue.job.brief!.headline.slice(0, 40)}…`);
      const raw = await generateStructured({
        system: chapterSystem(channel),
        user: chapterUser(issue, i, i > 0 ? frame.chapterTitles[i - 1] : undefined),
        schema: ChapterSchema,
        name: 'weekly_chapter',
      });
      const scenes = normalizeScenes(raw.scenes);
      if (scenes.length === 0) throw new Error(`Chapter ${i + 1} script came back empty.`);
      chapterScenes.push(scenes);
    }

    // The opening sits under a full-screen title card, so its visuals would be invisible — strip them.
    const opening = normalizeScenes(frame.opening, { stripVisuals: true });
    const closing = normalizeScenes(frame.closing);
    if (opening.length === 0 || closing.length === 0) {
      throw new Error('Opening or closing came back empty.');
    }

    // 3) TTS — flatten every scene into one list, synthesize, then map back by index
    const flat: Scene[] = [...opening, ...chapterScenes.flat(), ...closing];
    log.step(`Synthesizing speech — ${flat.length} scenes`);
    const tracks = await synthesizeScript(
      id,
      { title: frame.title, hook: frame.title, scenes: flat, description: '', hashtags: [] },
      {
        voice: channel.voice,
        style: channel.voiceStyle,
        speed: Math.min(channel.voiceSpeed ?? 1.2, WEEKLY_MAX_SPEED),
      },
    );

    // 4) Assemble → render
    let offset = 0;
    const openingScenes = toShortScenes(opening, tracks, offset);
    offset += opening.length;
    const chapters: WeeklyChapter[] = issues.map((issue, i) => {
      const scenes = toShortScenes(chapterScenes[i]!, tracks, offset);
      offset += chapterScenes[i]!.length;
      return {
        title: frame.chapterTitles[i]?.trim() || issue.job.brief!.headline.slice(0, 40),
        ...(issue.job.backgroundImage ? { backgroundImage: issue.job.backgroundImage } : {}),
        scenes,
      };
    });
    const closingScenes = toShortScenes(closing, tracks, offset);

    const props: WeeklyProps = {
      title: frame.title,
      weekLabel: frame.weekLabel,
      opening: openingScenes,
      chapters,
      closing: closingScenes,
      theme: channel.theme,
      ...(channel.bgm ? { bgmSrc: channel.bgm } : {}),
      ...(channel.bgmVolume !== undefined ? { bgmVolume: channel.bgmVolume } : {}),
      brand: channel.name,
      ...(channel.logo ? { brandLogo: channel.logo } : {}),
    };

    const description = withDisclosure(
      {
        title: frame.title,
        hook: frame.title,
        scenes: flat,
        description: `${frame.description}\n\n[Chapters]\n${timestamps(openingScenes, chapters)}`,
        hashtags: frame.hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean).slice(0, 10),
      },
      channel,
    );

    log.step('Rendering');
    const now = new Date().toISOString();
    let job: Job = save({
      id,
      kind: 'weekly',
      topic: `Weekly recap (${issues[0]!.date} ~ ${issues.at(-1)!.date})`,
      channelId,
      script: description,
      audio: tracks,
      weeklyProps: props, // saved before render so a crash resumes from here
      status: 'voiced',
      createdAt: now,
      updatedAt: now,
    });
    const videoPath = await renderWeekly(id, props);
    log.ok(`  ${videoPath}`);
    job = save({ ...job, videoPath, status: 'rendered' });
    return job;
  } catch (error) {
    if (error instanceof RefusalError) {
      throw new Error(`The model refused the weekly recap (${error.message}).`);
    }
    throw error;
  }
}
