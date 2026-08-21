# Shortform Autopilot

**A fully automated daily Reels / Shorts pipeline — plus a Sunday longform recap — that runs on one always-on machine.**

Every morning it collects sources, picks the day's best topic, writes a fact-locked
commentary script, synthesizes a voice, renders a vertical video with animated
infographics, and publishes to Instagram Reels and YouTube Shorts. On Sundays it
recomposes the week's briefs into a chaptered landscape recap. A human touches it
for about one tap a day.

This is not a demo — it is the generalized version of a pipeline that runs a real
daily channel. The docs include every trap we hit in production (OAuth 403s,
YouTube's private-lock for un-audited API projects, token loss, headless-Chrome
OOM on long renders, timezone-idempotency bugs) so you don't have to hit them.

## Demo

<p align="center">
  <img src="demo/preview.gif" width="300" alt="Demo preview — hook card, count-up stat, keyword stamp" />
</p>

▶ **[Watch the full 50-second demo with sound](demo/demo.mp4)** — generated
end-to-end by this repo with zero manual editing: the example channel config
plus a hand-written fact brief in, finished video out (script → voice →
background art → animated infographics → render).

## What's inside

```
src/            pipeline: collect → select → brief → script → TTS → render → publish
remotion/       video as React components: shorts (9:16) + weekly recap (16:9)
channels/       a channel is a JSON config, not code — stance, theme, voice, BGM, schedule
scripts/        BGM synthesizer (own the rights, zero Content ID risk), schedulers, auth helpers,
                publish verifier, stats snapshotter, optional second daily slot
docs/           build guide, platform setup (click-level), localization notes
.claude/skills/ /new-channel — develop a new channel from just a topic, with an AI pair
```

## Feature highlights

- **Scheduled publishing (publishAt)**: uploads go up private with a scheduled
  go-public time — so a machine that renders at 6 pm can publish at 7:05 pm
  sharp, and it works even before your YouTube API project passes Google's
  audit (direct public uploads don't). `scripts/verify-publish.mjs` then
  confirms each video actually flipped public (quota-free oEmbed check) and
  alerts Telegram if one is stuck.
- **AI-content disclosure built in**: every YouTube upload carries the
  synthetic-media declaration (platform policy — and increasingly, law), and
  the caption disclosure comes from channel config. On by default.
- **Stats snapshots for honest A/B**: `scripts/stats-snapshot.mjs` logs
  per-video stats (YouTube + optional IG Reels insights) on a timer, so you can
  compare videos *at the same age* — views at +24 h, not lifetime totals. This
  is how you actually test publish slots, formats, and titles. We used it to
  A/B a publish-time change and reverted within two days on clean evidence.
- **Anchor-style sign-off & tagline**: give a channel a fixed closing line
  (`signoff`) and a watermark/outro `tagline` in its config — the script
  prompt enforces the sign-off on every video and the renderer stamps the
  tagline on the corner and outro. Cheap, compounding brand recognition.
- **Fact-lock**: the script generator can only state facts extracted (with sources)
  from the day's articles. Commentary can go hard; facts cannot drift. The pinned
  source comment is generated for you.
- **Retention-engineered visuals**: per-scene punch-zoom cuts, five kinds of
  code-drawn infographic cards (count-up stats, quote panels, VS contrasts, lists,
  punch-word stamps) on every scene, continuous micro-motion, a title-card hook,
  and a logo outro. All drawn in code: zero image cost, zero copyright risk.
- **Self-synthesized BGM**: drums, bass groove, chords, arpeggio — generated as a
  seamless WAV loop by `scripts/make-bgm.mjs`. You own 100% of the rights.
- **Job state machine**: every stage persists to a job file; any crash resumes
  from the last completed stage. Same-day idempotency guards make double-fired
  schedulers harmless.
- **Channels as config**: `channels/*.json` defines stance, frames, guardrails,
  AI disclosure, art direction, fonts/colors/layout, voice, BGM, publish hour.
  A second channel = a second JSON file, with a genuinely different visual and
  audio fingerprint.
- **Mobile ops page**: after publishing, a private page on your storage bucket
  gives you links, one-tap copy for the pinned comment, and a one-tap "set public
  in Studio" button — the whole daily routine from a phone.

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in keys — see docs/PLATFORM-SETUP.md
node scripts/make-bgm.mjs pulse

npx tsx src/cli.ts add "Why EV batteries lose range in winter" --channel example
npx tsx src/cli.ts build      # script → voice → render → out/<job>.mp4
```

Then connect platforms (`docs/PLATFORM-SETUP.md`), enable the daily feed
(`src/collect/sources.ts`), and schedule (`docs/AUTOMATION.md` §7).

Or, with Claude Code: run `/new-channel <your niche>` and let it develop the
concept, write the channel config, and iterate test renders with you.

## Docs

| File | What it covers |
|---|---|
| `docs/AUTOMATION.md` | The full architecture and every production lesson — script prompting rules, retention visuals, scheduling, multi-channel separation, policy risks |
| `docs/PLATFORM-SETUP.md` | Click-level setup: OpenAI, Google Cloud OAuth + the YouTube audit, Meta developer app + Instagram tester flow, Cloudflare R2 |
| `docs/LOCALIZATION.md` | Shipping in another language: which prompts to tune and how length budgets change |

## Requirements

- Node.js ≥ 20.11, pnpm
- An always-on machine for rendering and scheduling (a laptop works; long renders
  are configured for low memory)
- API keys: OpenAI (or Anthropic for the LLM), YouTube Data API, Meta/Instagram,
  any S3-compatible storage with a public URL

## Costs (order of magnitude)

One daily short ≈ pennies of LLM + TTS and one background image (~$0.10–0.25).
A month of daily shorts plus a weekly longform lands around **$10–25/month**.
Rendering is local and free.

## Honest notes

- Code comments and CLI log messages are partly in Korean (the pipeline's origin);
  every LLM prompt, generated-content string, doc, and config is English. See
  `docs/LOCALIZATION.md`.
- YouTube fully-automated *public* publishing requires passing Google's API audit;
  until then the pipeline uploads private and gives you a one-tap manual switch.
- Follow each platform's synthetic-media disclosure rules. The pipeline appends
  an AI disclosure to every description in code — keep it on.
