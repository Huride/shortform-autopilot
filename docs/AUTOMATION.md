# The Full-Automation Guide — Reels & Shorts

> How to build a pipeline that generates and publishes one vertical video per day
> with no human in the loop. Topic-agnostic: news commentary, finance, science
> explainers, history — the structure is identical. This repo is the working
> implementation; this document is the design, generalized so you could rebuild
> it from scratch.

## 0. The whole picture

```
[Collect]        RSS/APIs pull the last 24h of source material (300+ items/day)
    ↓
[Select]         LLM scores candidates — newsworthiness, short-form fit, channel fit, dedup
    ↓
[Extract facts]  Build a sourced "facts list" from the selected story's articles
    ↓
[Script]         LLM structured output → scene array {narration, caption, emphasis, visual}
    ↓
[TTS]            Per-scene audio files + measured durations
    ↓
[Background]     One topic-matched generated image (optional)
    ↓
[Render]         Remotion (React → headless-Chrome frame capture → ffmpeg H.264)
    ↓
[Publish]        YouTube Data API + Instagram Graph API (via a public storage URL)
    ↓
[Ops page]       Mobile HTML uploaded to storage — links & one-tap actions
```

A scheduler (launchd/cron) fires the chain every morning. Every stage accumulates
state into a single job file, so a crash anywhere resumes from that point.

## 1. Stack, and why

| Role | Choice | Why |
|---|---|---|
| Runtime | Node.js + TypeScript | Remotion is React; one language everywhere |
| Video | **Remotion** | Video as React components → code review, versioning, per-channel themes. Vastly easier to maintain than ffmpeg filter graphs |
| LLM | any structured-output model | Scripts forced into a JSON Schema — parsing never breaks |
| TTS | OpenAI TTS (or ElevenLabs) | WAV out → measure real duration → scene length = audio length |
| Images | gpt-image-1 etc. | One background per video; falls back to a themed gradient on failure |
| BGM | **self-synthesized** (WAV from code) | Commercial music = Content ID claims, fatal for auto-publishing. A synthesized loop is 100% yours |
| Storage | Cloudflare R2 (S3-compatible) | Instagram doesn't take uploads — it fetches a **public URL** |
| Scheduling | launchd (macOS) / cron·systemd (Linux) | One always-on machine, no servers |

## 2. Data model — everything is a job

Everything accumulates in `data/jobs/<id>.json`:

```
pending → scripted → voiced → rendered → uploaded → published
```

- Each stage needs only the previous stage's output. Run "whatever isn't done yet."
- **Write files atomically** (tmp + rename). A mid-write crash never leaves half a JSON.
- Store publish records per platform → retries never double-post.
- **Refuse to create a second job for the same date+channel** (idempotency guard).
  A double-fired scheduler must be harmless.

## 3. Scripts — structured output is the core

Free-text answers break parsing constantly. Force a scene array via JSON Schema:

```ts
{
  title: string,          // platform title
  hook: string,           // the through-line question (persistent on every scene)
  scenes: [{
    narration: string,    // what TTS reads
    caption: string,      // on-screen line (≤7 words) — for muted viewers
    emphasis: string,     // substring of caption to highlight
    visualKind: 'stat'|'quote'|'contrast'|'keyword'|'list'|'none',
    // + flat per-kind fields (see §4)
  }],
  description: string,
  hashtags: string[]
}
```

Rules that earned their place in production (put them in your prompt):

- **Manage duration by text budget, not scene count.** Models can't count
  seconds. "Total narration 90–130 words" beats any instruction about time.
- **Force connectives between scenes.** Otherwise you get a stack of wire copy.
  The test: read the narration straight through — does it sound like one piece?
- **Ban telegraphic style explicitly.** Models clip grammar to save words and it
  sounds wrong the moment TTS reads it.
- **Captions alone must tell the story.** ~70% of viewers watch muted.
- Don't put numeric min/max in the schema — structured outputs don't support
  them and the client-side validation fails the whole call. Guide with prose,
  hard-cap in a normalize step.
- Fact-based content needs a **fact-lock**: extract a sourced facts list at
  collection time and contract the script to never state anything outside it.
  The bigger a number appears on screen, the stricter the sourcing.

## 4. Visuals — retention comes from the feeling that the screen changes

A static background with captions doesn't hold viewers (measured: ~20% continued
watching). Devices that earned their keep:

1. **Punch-zoom on every scene boundary** — the background pops ~5% and settles
   over 0.4s. One still image starts feeling like cuts.
2. **A center visual on every scene** — cards drawn in code (zero API cost, zero
   copyright risk):
   - `stat`: huge number with count-up, label chip, corner brackets
   - `quote`: quotation panel (verbatim quotes only — paraphrase in quote marks is fabrication)
   - `contrast`: two cells + VS badge
   - `list`: items sliding in staggered
   - `keyword`: a punch-word stamp — the default for commentary beats
   - Rules: visual and caption must say **different things** (same words twice =
     wasted screen). Never the same kind twice in a row. Values only from the facts list.
3. **Continuous micro-motion** — cards keep a subtle scale breathe after landing.
   A frozen frame reads as static within 3 seconds.
4. **A 2-second title-card hook** — the through-line question, large, over a
   translucent scrim with the background alive behind it. Exit by staggered
   per-line slides, not a flat fade.
5. **A 2-second logo outro** — circular-cropped channel logo. The last frame is
   the only moment viewers memorize the channel name. No platform handles here
   (the same file goes to multiple platforms).

Remotion notes:
- Props must be `type`, not `interface` (Composition constraint).
- Compute duration in `calculateMetadata` from the sum of scene lengths.
- Don't rely on system fonts long-term; bundle with `@font-face` or a server
  migration silently falls back to defaults.
- For long renders (5min+, 1080p) set `concurrency` to 1–2 — the default
  (cores/2) OOM-kills headless Chrome on modest machines.

## 5. TTS

- Take WAV. Streaming responses can carry a placeholder data-chunk size
  (0xFFFFFFFF), so **compute duration from actual bytes**. Scene length = audio length.
- Speed changes only via the **speed parameter** — style instructions like
  "read faster" measurably do nothing.
- Short-form feels right at 1.15–1.25x; 1.5x if aggressive. Longform ≤1.35x
  (fast narration fatigues over 10 minutes).
- Different voice per channel — audible fingerprint separation.

## 6. Platform connections

> Click-level procedures (which console, which button, which value goes where)
> live in `PLATFORM-SETUP.md`. This section is the design view.

### YouTube (Data API v3)
1. GCP project → enable YouTube Data API v3 → OAuth client (Desktop).
2. Consent screen in test mode: **add your account under Test users**
   (miss this → 403 access_denied).
3. `videos.insert` needs `youtube.upload`. **Read/update/delete need broader
   scopes** (`youtube` / `youtube.force-ssl`) — consider requesting wide up front.
4. **Uploads from un-audited projects (created after 2020-07) are locked private.**
   Fully-automated public publishing requires the **API audit**. Until it passes:
   upload private → the channel owner flips to public in Studio (that path is
   never blocked). Do NOT send `privacyStatus: 'public'` before the audit — the
   video gets locked private and even Studio can't flip it.
5. Quota: uploads have a dedicated bucket (1 unit each, 100/day). Not a concern.
6. Capture the refresh token with a **script that writes it straight to .env**.
   Codes are single-use; print-then-mask means starting over.
7. Set `selfDeclaredMadeForKids: false` explicitly (informational content).

### Instagram (Graph API — the Instagram Login path)
1. Meta developer app → add the Instagram product (the Instagram Login path
   needs no Facebook Page).
2. In development mode, invite the account under **App Roles → Instagram
   Tester**, then accept inside the Instagram app (Settings → Website
   permissions) — tokens won't issue before acceptance.
3. Publish flow: create container (`media?media_type=REELS&video_url=<public URL>`)
   → poll status until FINISHED → `media_publish`. There is no file upload —
   Meta fetches your public URL. Hence the public storage requirement.
4. Long-lived tokens last 60 days. **Call `refresh_access_token` daily** at the
   top of the pipeline (refresh is idempotent).
5. Reels-tab eligibility: 5–90 seconds. Warn after render if exceeded.
6. Auto-posting stories works (`media_type=STORIES`), but "share reel to story"
   does not exist in the API — that one is manual in the app.

### Storage (R2)
- Create bucket → **enable the public development URL** (or a custom domain)
- Issue S3-compatible credentials → upload with `@aws-sdk/client-s3`
- Stream uploads need an explicit `ContentLength`

## 7. Scheduling

- **macOS**: use **launchd**, not crontab. Editing crontab from a remote session
  can hang forever on a TCC permission prompt. Also `~/Documents` is
  TCC-protected and launchd can't read it — **keep the repo directly under home**.
- Trigger generation (e.g. 07:00) and publishing (e.g. 08:05) separately so a
  slow generation never shifts your publish time. Re-check the publish-time
  guard (`scheduledAt`) in code anyway.
- **Dates must be local.** Deciding "today" in UTC breaks morning runs in
  east-of-UTC timezones (local morning = UTC yesterday) and the idempotency
  guard misfires.
- Log to dated files. Design every failure to resume by simply re-running the
  same command.

## 8. The ops page (remote/mobile operation)

After publishing, upload a static HTML page to a fixed storage key: recent
publishes, links, one-tap copy for the pinned source comment, and manual-action
buttons (e.g. "set public in Studio"). The operator finishes the daily routine
from a phone bookmark. Use an unguessable key for the URL.

## 9. Multi-channel — a channel is config, not code

One `channels/<id>.json` defines the entire channel:

```
stance / frames / topic preference (injected into prompts) · guardrails ·
AI disclosure · art direction · theme (font/colors/layout/caption style/progress) ·
voice/style/speed · BGM path+volume · publish hour · logo
```

Adding an opposite-stance or different-niche channel = adding one JSON file.
Make the channels **actually different in sight and sound** (font, layout,
progress indicator, musical key, voice, publish hour) — if the output looks
machine-identical, account separation is meaningless. For full separation, split
the GCP project, Meta app, and storage domain per channel too.

## 10. Policy risks (fatal for auto-publishing)

- **Music**: never commercial tracks. Content ID claims kill automated channels.
  Synthesized loops you own outright are the answer.
- **AI disclosure**: append it to descriptions **in code**. Anything that must
  always happen cannot depend on the model remembering.
- **Mass-produced content** (YouTube, since 2025-07): plain repetitive narration
  is a monetization target. Interpretation, commentary, and composition are the
  defense.
- **Factual distortion**: asserting unconfirmed claims (especially about people)
  goes straight to legal exposure. Fact-lock + forced hedging + a guardrail list
  as a prompt contract.
- **Real-person depiction**: generated images must never contain a recognizable
  real person. Constrain image prompts to anonymous/symbolic figures only.

## 11. Costs (2026 ballpark)

One daily short: fractions of a dollar of LLM + TTS plus one generated
background ($0.10–0.25) → **$10–25/month** including a weekly longform.
Rendering is local and free. Images are the biggest line — design for background
reuse and code-drawn visuals from day one.

## 12. Build order (smallest verifiable units)

1. **Day 1** — job model + CLI skeleton + a Remotion composition (one mp4 from dummy data)
2. **Day 2** — LLM script (structured output) + TTS → a video that talks
3. **Day 3** — collection, selection, fact extraction → full dry run
4. **Day 4** — storage + Instagram (one real publish in tester mode)
5. **Day 5** — YouTube (private upload) + submit the audit
6. **Day 6** — scheduler + ops page + logs. After that, iterate visuals against analytics.

Every step must end in **an artifact that actually plays**. Building the whole
pipeline and pressing play at the end is a debugging hell.
