# Localization

The pipeline ships English-native: every LLM prompt, schema description,
generated-content string (descriptions, pinned comments, chapter timestamps),
doc, and the example channel are in English. To produce content in another
language, tune these:

## 1. Where the language lives

| Location | What it controls |
|---|---|
| `src/pipeline/script.ts` | Short-form script system prompts, scene schema descriptions, visual rules |
| `src/pipeline/weekly.ts` | Weekly recap frame + chapter prompts |
| `src/collect/select.ts` | Topic scoring and fact-extraction prompts |
| `src/pipeline/image.ts` | Background art-direction prompt (image prompt itself stays English — image models prefer it) |
| `channels/<id>.json` | stance / framing / topicPreference / guardrails / voiceStyle / disclosure — all injected into prompts verbatim, so write them in your target language |
| `src/pipeline/comment.ts` | Pinned-comment boilerplate strings |

The fastest path: keep the English system prompts and simply write your channel
config (stance, frames, disclosure...) in the target language, adding one line to
the stance like "Write all output in French." That works, but a fully translated
prompt set tuned to the language's rhythm produces noticeably better scripts.

## 2. Length budgets change per language

Duration control works by text budget because models can't count seconds. The
budgets in the prompts are tuned for English (~2.6 words/sec at 1.2x TTS):

| Budget | English value | How to re-derive |
|---|---|---|
| Short total narration | 90–130 words | target 30–50s × your language's spoken words(or chars)/sec |
| Weekly chapter | 180–220 words | target ~70–85s per chapter |
| Caption | ≤ 7 words | must fit one line at ~84–96px on a 1080px-wide frame |
| Keyword stamp | 1–3 words (≤26 chars) | must fit at 148px type |
| Hook | 5–10 words | two comfortable lines max |

Dense scripts (e.g. Korean ≈ 11 chars/sec at 1.5x) need character budgets instead
of word budgets — the original Korean pipeline used 280–330 chars per short.
Measure once: synthesize a paragraph, divide length by seconds, set budgets.

The hard caps in `toVisual()` (`src/pipeline/script.ts`) mirror these budgets in
characters — adjust them together with the prompts.

## 3. Fonts

`channels/<id>.json` → `theme.fontStack`. Non-Latin scripts need fonts that are
actually installed (check with `pnpm cli doctor`); for server rendering, bundle
font files into `remotion/public` with `@font-face` so rendering never silently
falls back.

## 4. What stays Korean (roadmap)

Some code comments and CLI log lines remain in Korean from the original
production pipeline. They never reach generated content or published output.
PRs translating them are trivial — the strings are all in `src/cli.ts` and
`src/log.ts` call sites.
