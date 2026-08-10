---
name: new-channel
description: Give it just a topic/niche and it develops a short-form automation channel with you — concept, channel config, theme, test renders, platform hookup. e.g. /new-channel personal finance basics
---

# Develop a short-form automation channel

The user gives a topic (args); build a new channel on this repo's pipeline.
Architecture background: `docs/AUTOMATION.md`. API & platform setup:
`docs/PLATFORM-SETUP.md`.

## Steps

### Step 1 — Develop the concept (conversation)

Don't create files yet. Nail these down with the user first
(use AskUserQuestion, batched):

- **Perspective/stance**: how does this channel *read* its subject? Neutral
  explainer, or opinionated commentary? If commentary, draft 3–5 frames together.
- **Audience & tone**: who is it for, in what register (formal/casual,
  serious/playful).
- **Source supply**: where does daily material come from — RSS feeds (news-type)
  or a fixed topic pool (explainer-type)? For RSS, add feeds to
  `src/collect/sources.ts`; for a topic pool, start with manual `add` operation.
- **Channel name & identity**: propose 2–3 name candidates and let them choose.

### Step 2 — Create channels/<id>.json

Read `channels/example.json` for the structure, then write a new one.
Required fields and principles:

- `stance` / `framing` / `topicPreference` — the Step-1 decisions, written as
  sentences that go straight into prompts.
- `guardrails` — **loading fails if empty.** Concrete survival rules for the
  niche (no fabricated facts, hedge unconfirmed matters, no group disparagement,
  no synthesizing real people, plus niche-specific risks).
- `disclosure` — the AI-production disclosure (appended to descriptions in code).
- `theme` — **visually distinct from existing channels**: different combination
  of font, colors, layout, caption style, progress indicator, hook shape.
  Verify fonts with `pnpm cli doctor`.
- `voice`/`voiceStyle`/`voiceSpeed` — a different voice from existing channels.
- `artDirection`/`imageStyle` — background art style. The no-recognizable-real-
  person rule is enforced in code, but write the style text under that premise.
- `bgm` — add a preset to `scripts/make-bgm.mjs` PRESETS (different key, tempo,
  rhythm section from existing channels) and generate. `bgmVolume` around 0.15.
- `publishHour` — different from existing channels.
- `logo` — if the user provides one, place it at `remotion/public/brand/<id>.png`.

### Step 3 — Test run (no publishing)

1. `pnpm typecheck` — config/code consistency.
2. Create a job from one topic: RSS-type →
   `npx tsx src/cli.ts daily --channel <id> --dry-run` to inspect selection,
   then without dry-run; topic-pool-type →
   `npx tsx src/cli.ts add "<topic>" --channel <id>`.
3. `npx tsx src/cli.ts build <jobId>` — script → voice → render.
4. Send the mp4 to the user for review (compress with ffmpeg if over 30MB).
5. Take feedback on script tone, visuals, and voice; adjust the channel JSON and
   repeat. **This loop is the point of the skill** — everything tunable lives in
   the config file.

### Step 4 — Platform hookup (after user confirmation)

Walk through `docs/PLATFORM-SETUP.md` (click-level procedures). Key points:

- A fully separated channel needs its own GCP project, Meta app, and storage
  bucket. A sub-channel of the same operator can share existing ones — but the
  code currently uses a single credential set, so per-channel env support must
  be built first if separating.
- YouTube: un-audited projects are locked private → apply for the audit.
  Until it passes: private uploads + manual Studio publishing.
- Instagram: tester mode works from day one. Daily 60-day-token refresh is mandatory.

### Step 5 — Schedule

Add a schedule for the channel modeled on the existing scripts in `scripts/`
(launchd plists on macOS — the repo must live outside TCC-protected folders).
Separate generation and publish times, and don't collide with existing channels.

## Cautions

- For niches with defamation exposure (politics, finance claims, health), lock
  down fact-lock (no claims outside the facts list) and hedging guardrails hard.
- Even when everything works, **publishing starts only after explicit user
  confirmation.**
