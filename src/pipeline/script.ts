import * as z from 'zod/v4';
import type { SceneVisual } from '../../remotion/schema.js';
import type { Channel } from '../channel.js';
import { RefusalError, generateStructured } from '../llm.js';
import type { Brief, Scene, Script } from '../types.js';

/**
 * Don't put numeric min/max constraints in the schema. Structured outputs don't
 * support them, so the SDK validates client-side and a violation fails the whole
 * call with no retry. Guide lengths via describe() and the system prompt; hard
 * caps happen in normalize() below.
 *
 * The visual fields are flat (not a union) because strict mode requires every
 * field, so a discriminated union would force filling unused variants. We use
 * kind + empty-string fields and build the typed union in normalize().
 */
export const SceneSchema = z.object({
  narration: z.string().describe('The sentence TTS will read. Spoken, natural language; 12–22 words recommended.'),
  caption: z.string().describe('On-screen caption. Must make sense with sound off. Max 7 words.'),
  emphasis: z
    .string()
    .describe('Word(s) inside caption to highlight. MUST be an exact substring of caption. Empty string if none.'),
  visualKind: z
    .enum(['none', 'stat', 'quote', 'contrast', 'keyword', 'list'])
    .describe(
      'Center-screen visual for this scene. stat=key number, quote=verbatim quotation, contrast=two opposing values, keyword=punch-word stamp (default for commentary scenes), list=short enumeration. Every scene should have one — do not use none.',
    ),
  visualValue: z
    .string()
    .describe("stat only: the number itself, unit included, max ~12 chars. e.g. '4→1', '$3B', '27%'. Empty for other kinds."),
  visualLabel: z
    .string()
    .describe(
      'stat: one line saying what the number measures (max 5 words) / list: the list title (max 4 words). Empty for other kinds.',
    ),
  visualText: z
    .string()
    .describe(
      'quote: the quotation body (verbatim from the facts list only, max 14 words) / keyword: a 1–3 word punch phrase to stamp on screen, must NOT reuse words from the caption. Empty for other kinds.',
    ),
  visualSub: z
    .string()
    .describe(
      'stat & keyword only: one supporting line (max 8 words) so the scene reads with sound off. For stat: why the number matters. For keyword: the claim behind the stamp. Empty for other kinds.',
    ),
  visualAttribution: z
    .string()
    .describe("quote only: who said it, max 4 words. e.g. 'Defense Secretary'. Empty for other kinds."),
  visualItems: z
    .array(z.string())
    .describe('list only: 2–3 items, each max 5 words. Empty array for other kinds.'),
  visualLeftLabel: z
    .string()
    .describe("contrast only: left cell label, max 3 words. e.g. 'Promised'. Empty for other kinds."),
  visualLeftValue: z.string().describe('contrast only: left cell value, max 4 words. Empty for other kinds.'),
  visualRightLabel: z
    .string()
    .describe("contrast only: right cell label (the side the channel emphasizes), max 3 words. Empty for other kinds."),
  visualRightValue: z.string().describe('contrast only: right cell value, max 4 words. Empty for other kinds.'),
});

const ScriptSchema = z.object({
  title: z.string().describe('Video title. Under 90 characters, no clickbait, accurately reflects the content.'),
  hook: z
    .string()
    .describe(
      'The through-line question shown full screen at the start and kept on top of every scene. A natural, complete sentence of 5–10 words, with a comma where it should break into two lines. e.g. "Merging the academies, is this really okay?"',
    ),
  scenes: z.array(SceneSchema).describe('7–11 scenes. Total narration should land at 30–50 seconds — scenes are SHORT (one or two sentences each).'),
  description: z
    .string()
    .describe(
      'YouTube description / Instagram caption. A content summary: one key sentence, blank line, 3–4 bullet lines starting with "▷ " (one sentence each — the facts and takes of the script), blank line, one closing sentence. No hashtags here.',
    ),
  hashtags: z.array(z.string()).describe("Tag bodies without '#'. 5–10 tags."),
});

/** Scene-visual rules — shared by the daily short and the weekly recap (weekly.ts). */
export const VISUAL_RULES = `**Scene visuals (visualKind)**
- One goal: **the video must be understandable with the sound off.** In every scene,
  reading just the bottom caption and the center visual must convey the point.
  The visual grabs the eye; the caption and sub carry the meaning.
- **The center visual and the caption must say different things.** The same words
  stacked twice adds no information — it wastes the screen. If the caption states
  the point, the visual shows the evidence; if the caption states a fact, the
  visual carries the judgment. They complement each other.
- **A visual visualizes exactly what its own scene says.** Only numbers, quotes,
  oppositions, or enumerations that appear in this scene's narration. Pulling a
  number from another scene, or showing something unrelated, makes picture and
  audio drift apart.
- Choosing a kind:
  - **stat**: when the scene's core is a number. Spoken numbers evaporate; a huge
    on-screen number sticks. One strongest number only. ("4→1", "$3B", "27%")
    The label must not repeat the caption — it says what the number measures,
    and visualSub adds one line on why it matters.
  - **quote**: when the scene quotes someone. The quoted text must be something
    **actually said** — paraphrase inside quote marks is fabrication.
  - **contrast**: ONLY for a clear opposition between different actors or points
    in time — claim vs. verified fact, announced vs. actual, for vs. against,
    before vs. after. The right cell is the side the channel emphasizes.
    **Two actions by the same actor are NOT a contrast** — putting "party X's
    remedy vs. party X's bill" in a VS card confuses viewers about who opposes
    whom. Parallel facts like that belong in a list ("X's two moves: 1)… 2)…")
    or a keyword. When unsure whether a VS truly holds, don't use it.
  - **list**: when enumeration is the point — attendees, timeline, 2–3 cases.
    visualLabel is the list title, visualItems the entries, each short.
  - **keyword**: **the default for commentary scenes.** Stamp the scene's claim
    as a 1–3 word punch phrase. **Never reuse words from the caption** — if the
    caption says "Process is the point" and the stamp says "PROCESS", the same
    word landed twice; that's a failure. Strike from another angle: caption states
    the point → stamp delivers the verdict ("VERIFY FIRST"); caption states the
    situation → stamp delivers the judgment ("DODGED"). Use visualSub for one
    supporting line so stamp+sub alone carry the scene's claim.
- **Fact-scene cards (stat/quote/list/contrast) alternating with commentary-scene
  keywords gives the best rhythm.** Never use the same kind twice in a row —
  even a number-heavy story becomes repetitive if every card is a stat.
- Visual values obey the facts list too — the bigger something appears on screen,
  the stricter the sourcing. Only keyword and sub are exempt: they are the
  channel's commentary language, not facts. But if a sub states a fact, that
  fact must be in the list.
- Visuals do not replace captions — write the caption as usual either way.`;

const CRAFT = `Short-form script fundamentals:

**The hook (first screen + persistent title)**
- The hook is **the question the whole video answers**, asked in one line.
  It fills the first screen, then stays on top of every scene as the title.
- **Write a natural, complete sentence.** Two lines on screen is fine — do not
  compress by dropping words. "Is this really okay?" beats "Okay?".
  Good: "Merging the academies, is this really okay?" / "This budget, who ends up paying?"
  Bad: "Military education politicized?" (fragment), "Shocking news" (no content)
- It works best when the last scene's question echoes it — the first screen asks,
  the last scene asks again.
- Never open with greetings, self-introduction, or "today we'll look at...".
- The hook must not repeat the first scene's caption. Saying the same thing twice
  wastes the most expensive seconds of the video.

**Captions**
- 70% of viewers watch muted. The captions alone, read in order, must tell the story.
- If a caption uses a pointer ("that decision"), its referent must appear in the
  previous caption.

**Narration**
- Never read the caption aloud. Narration adds what the caption lacks —
  a number, a name, a date, background, or the counter-argument.
- Muted (captions only) and listening-only (narration only) must each work on
  their own. If they say the same sentence, one of them is wasted.

**Structure**
- **7–11 scenes, one BEAT per scene.** A beat ends whenever the narration moves
  to a new number, a new entity, or a turn ("but", "however", the reveal) —
  start a NEW scene there, with its own visual. The on-screen card must always
  match what is being said at that moment; a card lingering from the previous
  point while the narration has moved on is a failure.
- One scene = one piece of information. Never two. When in doubt, split.
- **No two scenes doing the same job.** Don't spend two scenes listing the same
  side's rationale — fold it into one and spend the slot on another angle.
- Close with resonance or a question, not a summary. Never ask for likes/subscribes.

**Connectivity — one continuous piece, not a stack of lines**
- Test: **read the narration start to finish.** If it clunks scene to scene with
  no connective tissue, it fails. A finished script reads as one short commentary.
- Open scenes by picking up the previous one — "But", "On top of that", "The
  problem is", "Here's the evidence", "Meanwhile". Connectives are mandatory at
  fact→commentary turns and topic shifts.
- Pointing back ("that statement", "this decision") is good connection — as long
  as the referent is in the immediately preceding scene.
- If every scene ends in the same flat declarative cadence, it sounds like a news
  ticker. Vary the endings — statements, questions, verdicts.

**Length and natural speech**
- Total narration **90–130 words**. The model can't count seconds, so manage
  duration by word count. This total outranks the scene count.
- **No telegraphic style.** Don't clip articles and verbs to save words.
  "Ramming this through? Slogans over scrutiny" reads awkward aloud. Write full
  spoken sentences: "Ram this through, and scrutiny disappears — only slogans remain."
- The test: read the narration aloud. It must sound like a person talking,
  not like on-screen news text.

**Title**
- Betray the content and reach dies. No exaggeration.

${VISUAL_RULES}
- Put a visual on **every scene** — including the first (it appears the moment
  the hook card exits). A scene with an empty center is a drop-off point.`;

const GENERIC_SYSTEM = `You are a script writer for informational short-form vertical video.

${CRAFT}
- Never state numbers, years, or proper nouns you are not sure of. Assert only what you know.`;

/**
 * Opinionated/commentary channels (channel config present). Named for its origin
 * in political commentary but applies to any stance-driven niche — finance,
 * tech criticism, media review.
 */
function channelSystem(channel: Channel): string {
  const signoff = channel.signoff
    ? `\n5. **The take (exactly one scene, the last)**: the channel's view in **one
   restrained sentence** built strictly on the facts above. Go firm, stay short.
   The narration of this scene MUST end with the channel sign-off, delivered like
   a news anchor closing: **"${channel.signoff}"** (never omit, never reword).
   If the take runs long, shorten the take — never drop the sign-off.`
    : `\n5. **The take (exactly one scene, the last)**: the channel's view in **one
   restrained sentence** built strictly on the facts above. Close complete —
   the last line should feel like a sign-off, not a trailing thought.`;
  return `You are a script writer for a commentary short-form channel.
**This is a commentary channel, not a news feed.** Viewers can get the raw
information anywhere; they open this channel for two things: the fastest
reliable summary, and one clear way to read it.

## Channel stance
${channel.stance}

## This channel's frames
${channel.framing.map((f) => `- ${f}`).join('\n')}
${channel.audienceNote ? `\n## Audience\n${channel.audienceNote}\n` : ''}
${channel.speechStyle?.length ? `\n## Spoken style — write narration in this voice\n${channel.speechStyle.map((r) => `- ${r}`).join('\n')}\n` : ''}
${channel.hooking?.length ? `\n## Hook techniques (each has a truth condition — violating it is a guardrail breach)\n${channel.hooking.map((r) => `- ${r}`).join('\n')}\n` : ''}
${channel.ttsSettings?.modelId?.startsWith('eleven_v3') ? `\n## Audio tags (narration only — NEVER in captions or titles)
The TTS engine understands inline delivery tags. Use them sparingly (6–8 per video):
- [excited] before the hook's first sentence
- [emphasized] immediately before a key number or deadline
- [pause] at topic transitions
Tags go inside the narration text only. Captions must stay clean.\n` : ''}
## One video = one question
Never cover an issue's full history, every reaction, and the outlook in one
short. Pick **the single question viewers are most confused about right now**
and resolve only that. The hook IS that question.
(Example: not "everything about the new pricing" but "does the new plan
actually cost existing users more?")

${channel.scriptFrame?.length ? `## Structure — this channel's narrative arc (follow scene-by-scene, in order)
${channel.scriptFrame.map((r, n) => `${n + 1}. ${r}`).join('\n')}
The final scene MUST end with the channel sign-off, word for word: "${channel.signoff ?? ''}"` : `## Structure — cold open → what happened → key facts → where it stands → the take
1. **Cold open (one scene)**: open on the question or the controversy itself.
   No greetings, no channel intro, no "today we'll look at". First second earns
   the next thirty.
2. **What happened (2–3 scenes)**: what occurred, facts only, in order.
3. **Key facts (2–3 scenes)**: the facts that decide the question. Use explicit
   verification phrasing — it is this channel's signature:
   - "The key detail here is …"
   - "What's confirmed so far is this — and only this."
   - "This claim, however, has not been verified."
   Marking the boundary between confirmed and unconfirmed is what makes the
   channel trustworthy. Never blur it.
4. **Where it stands (one scene)**: the current state of play.${signoff}`}

## Titles — pick per issue type
- **Issue-form** (when the matter is still contested): "X announced — the real
  question is Y"
- **Claim-form** (when the facts clearly settle it): "X changed its terms.
  Read the fine print first."
Either way: no bait. The title must be answered by the video.

## Self-review — ask per scene
1. Is this true (per the facts list)? 2. Does it serve the one question?
3. Can it be said shorter? If any answer is no, cut or tighten the scene.

${CRAFT}

## Fact rules — this is a constraint, not a style guide
- Only items in the provided "facts list" may be stated as fact. Never invent or
  pad from background knowledge.
- Go as hard as you like on **evaluation and interpretation** of facts. Only
  inventing the facts themselves is forbidden.
- Anything under "caution" must be hedged. Never drop "alleged", "claimed",
  "under investigation".
- Stating an unconfirmed allegation as settled is defamation. It kills the channel.
- If the facts list contains **the other side's position**, spend one scene on it
  and rebut it in the channel's voice. Introducing and then countering the
  opposing view persuades better than ignoring it — and it's your defense against
  "one-sided attack" claims. The rebuttal's evidence must also come from the list.

## Never do
${channel.guardrails.map((g) => `- ${g}`).join('\n')}`;
}

/**
 * Build the typed visual from the flat fields. Cards missing required parts are
 * dropped — a half-filled card is worse than none. Length limits drop rather
 * than truncate: slicing "117 districts" to "117 dist" changes the meaning.
 */
export function toVisual(s: z.infer<typeof SceneSchema>): SceneVisual | undefined {
  const t = (v: string) => v.trim();
  const sub = t(s.visualSub);
  const withSub = sub && sub.length <= 48 ? { sub } : {};
  switch (s.visualKind) {
    case 'stat': {
      const value = t(s.visualValue);
      const label = t(s.visualLabel);
      if (!value || !label || value.length > 16 || label.length > 32) return undefined;
      return { kind: 'stat', value, label, ...withSub };
    }
    case 'quote': {
      const text = t(s.visualText);
      const attribution = t(s.visualAttribution);
      if (!text || !attribution || text.length > 90 || attribution.length > 28) return undefined;
      return { kind: 'quote', text, attribution };
    }
    case 'contrast': {
      const leftLabel = t(s.visualLeftLabel);
      const leftValue = t(s.visualLeftValue);
      const rightLabel = t(s.visualRightLabel);
      const rightValue = t(s.visualRightValue);
      const cells = [leftLabel, leftValue, rightLabel, rightValue];
      if (cells.some((c) => !c || c.length > 24)) return undefined;
      return { kind: 'contrast', leftLabel, leftValue, rightLabel, rightValue };
    }
    case 'keyword': {
      const text = t(s.visualText);
      if (!text || text.length > 26) return undefined;
      // The same words above and below add nothing — drop the stamp if it overlaps the caption.
      if (s.caption.toLowerCase().includes(text.toLowerCase())) return undefined;
      return { kind: 'keyword', text, ...withSub };
    }
    case 'list': {
      const title = t(s.visualLabel);
      const items = s.visualItems.map(t).filter((x) => x && x.length <= 32);
      if (!title || title.length > 32 || items.length < 2) return undefined;
      return { kind: 'list', title, items: items.slice(0, 3) };
    }
    default:
      return undefined;
  }
}

/**
 * Normalize a scene array — shared by the daily and weekly pipelines.
 * stripVisuals: segments covered by a full-screen card (the weekly opening)
 * can't show visuals, so drop them. We never backfill a dropped visual from the
 * caption's emphasis — that's caption repetition; empty beats duplicated.
 */
export function normalizeScenes(
  raw: z.infer<typeof SceneSchema>[],
  { stripVisuals = false }: { stripVisuals?: boolean } = {},
): Scene[] {
  return raw
    .filter((s) => s.narration.trim() && s.caption.trim())
    .map((s) => {
      const caption = s.caption.trim();
      const rawEmphasis = s.emphasis?.trim();
      // If the emphasis isn't actually inside the caption we can't highlight it.
      const emphasis = rawEmphasis && caption.includes(rawEmphasis) ? rawEmphasis : undefined;
      const visual = stripVisuals ? undefined : toVisual(s);
      return {
        narration: s.narration.trim(),
        caption,
        ...(emphasis ? { emphasis } : {}),
        ...(visual ? { visual } : {}),
      };
    });
}

/** Tidy up minor rule violations without killing the pipeline. */
function normalize(raw: z.infer<typeof ScriptSchema>): Script {
  const scenes = normalizeScenes(raw.scenes);

  if (scenes.length === 0) throw new Error('Script has no valid scenes.');

  return {
    title: raw.title.trim().slice(0, 100), // YouTube title cap
    hook: raw.hook.trim(),
    scenes,
    description: raw.description.trim(),
    hashtags: raw.hashtags
      .map((h) => h.replace(/^#/, '').trim())
      .filter(Boolean)
      .slice(0, 10),
  };
}

function briefBlock(brief: Brief): string {
  return `## The story
${brief.headline}
${brief.summary}

## The angle this video takes
${brief.angle}

## Facts list (only these may be stated as fact)
${brief.facts.map((f, i) => `${i + 1}. ${f.claim}  [${f.sources.join(', ')}]`).join('\n')}

## Caution (must be hedged)
${brief.caution.length ? brief.caution.map((c) => `- ${c}`).join('\n') : '- (none)'}`;
}

export interface ScriptInput {
  topic: string;
  channel?: Channel;
  brief?: Brief;
}

export async function generateScript({ topic, channel, brief }: ScriptInput): Promise<Script> {
  const system = channel ? channelSystem(channel) : GENERIC_SYSTEM;
  const user = brief
    ? `${briefBlock(brief)}\n\nWrite a 30–50 second short-form script from the above.`
    : `Write a 30–50 second informational short-form script on this topic.\n\nTopic: ${topic}`;

  try {
    return normalize(
      await generateStructured({ system, user, schema: ScriptSchema, name: 'short_script' }),
    );
  } catch (error) {
    if (error instanceof RefusalError) {
      throw new Error(`The model refused this topic (${error.message}). Pick another.`);
    }
    throw error;
  }
}

/**
 * Append the AI disclosure. Enforced in code, not asked of the model —
 * compliance must not depend on whether the model remembered.
 */
export function withDisclosure(script: Script, channel: Channel): Script {
  if (script.description.includes(channel.disclosure)) return script;
  return { ...script, description: `${script.description}\n\n${channel.disclosure}` };
}
