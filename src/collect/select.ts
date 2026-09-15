import * as z from 'zod/v4';
import type { Channel } from '../channel.js';
import { generateStructured } from '../llm.js';
import type { Brief, TopicCandidate } from '../types.js';
import type { HistoryEntry } from './history.js';
import type { Article } from './rss.js';
import { applyBuzz } from './buzz.js';

const CandidateSchema = z.object({
  headline: z.string().describe('The issue in one line — a summary of the matter, not a copied article title.'),
  summary: z.string().describe('2–3 sentences. Facts only: what happened.'),
  keywords: z.array(z.string()).describe('3–6 keywords. Used for duplicate detection.'),
  articleIndices: z.array(z.number()).describe('Indices of the articles covering this issue.'),
  coverage: z.number().describe('Number of distinct outlets that covered this issue.'),
  leanCoverage: z.string().describe("Which leanings covered it. e.g. 'left 2, center 3, right 2'"),
  shortformFit: z.number().describe('How well it fits a 30–50s vertical video. 1–10.'),
  channelFit: z.number().describe("Whether this channel's stance has something to say about it. 1–10."),
  freshness: z.number().describe('Broke today vs. dragging on for days. 1–10.'),
  attention: z
    .number()
    .describe('Public attention / buzz. 1–10. Would communities argue about it, would people click on the headline alone, does it touch my money / my home / my safety?'),
  duplicateRisk: z.number().describe('Overlap with recently covered topics. 1–10 (higher = more overlap).'),
  totalScore: z.number().describe('Overall score 1–100 (use the weighted formula in the instructions).'),
  reason: z.string().describe('One sentence explaining the score. Must name the concrete actor angle: "who did what".'),
  searchQuery: z
    .string()
    .describe('One YouTube search query to measure real-world buzz: the responsible person\'s full name or the event\'s proper noun. 2–8 characters, no particles or explanation.'),
});

const SelectionSchema = z.object({
  candidates: z.array(CandidateSchema).describe('Top 5, highest score first.'),
});

const BriefSchema = z.object({
  angle: z.string().describe("The angle this channel takes on the issue. One sentence."),
  facts: z
    .array(
      z.object({
        claim: z
          .string()
          .describe('One fact actually present in the articles. A fact — not interpretation or commentary.'),
        sourceIndices: z.array(z.number()).describe('Indices of the articles reporting this fact.'),
      }),
    )
    .describe('5–10 items. The script may state as fact ONLY what is on this list.'),
  caution: z
    .array(z.string())
    .describe(
      'Things to be careful about: unconfirmed allegations, contested points, anything that must not be asserted. Empty array if none.',
    ),
});

function formatArticles(articles: Article[]): string {
  return articles
    .map(
      (a, i) =>
        `[${i}] (${a.source}/${a.lean}) ${a.title}${a.summary ? `\n    ${a.summary}` : ''}`,
    )
    .join('\n');
}

/** Pick today's topic from 24 hours of articles. */
export async function selectTopic(
  articles: Article[],
  channel: Channel,
  recent: HistoryEntry[],
): Promise<TopicCandidate[]> {
  const recentBlock = recent.length
    ? recent.map((e) => `- ${e.date.slice(0, 10)} ${e.headline} [${e.keywords.join(', ')}]`).join('\n')
    : '(none)';

  const system = `You are the programming editor of a commentary short-form channel. From 24 hours of articles, pick today's single topic.

First group the articles by underlying story — different headlines about the same event are one issue.
Then score each issue on the criteria below and return the top 5 by total score.

- coverage: an issue many outlets covered simultaneously matters that much more.
- leanCoverage: an issue covered across the spectrum has substance. If only one side covered it, it's a partisan talking point or not yet verified.
- shortformFit: if the background takes 30+ seconds to explain, it doesn't fit short-form. The best issues state their stakes in one sentence.
- channelFit: does this channel's stance have something to say? Don't force unrelated stories into the frame.
- freshness: broke today is best. The same phase dragging for days scores low.
- attention: does this touch people's feelings? High when there is a clear conflict between
  named actors, a dramatic turn (arrest, ruling, resignation, recall), a decision that hits
  my money / my home / my safety, or a one-sentence hypocrisy. Low for administrative
  plumbing, budget allocation, procedural tweaks with no conflict, and stories whose only
  actors are institutions with no human face.
- duplicateRisk: high if it overlaps the recently-covered list. **The same category two days
  in a row counts as overlap even with different keywords.** **A follow-up on the same event
  is the same topic even with a new development — if the event is on the list, give 9–10.**
  Measured: covering the morning's story again in the evening cannibalizes both videos' views.

**Total score, weighted (max 100):**
totalScore = attention×3.0 + channelFit×2.0 + shortformFit×1.5 + freshness×1.5
           + coverage score (outlet count mapped to 1–10)×1.0 + cross-spectrum score×0.3
           − duplicateRisk×2.0 + channel bonuses/penalties below.
The types that must score highest: a **named responsible actor's decision, statement, or
misconduct**, and a **policy decision that changes what people pay**. Both at once is the top.
${channel.selectionRules?.length ? `\n**This channel's bonuses / penalties:**\n${channel.selectionRules.map((r) => `- ${r}`).join('\n')}\n` : ''}
**Hard guards (apply regardless of buzz)**: stories that run entirely on a single unverified
personal allegation, conspiracy-adjacent stories, and re-litigations of legally settled matters
get channelFit 1–2. Those topics win a day of views and lose the channel.
Exclude stories outside the channel's beat (e.g. celebrity/sports for a policy channel).`;

  const { candidates } = await generateStructured({
    system,
    name: 'topic_selection',
    schema: SelectionSchema,
    user: `## Channel stance
${channel.stance}

## Topics this channel prefers
${channel.topicPreference}

## Recently covered (for duplicate avoidance)
${recentBlock}

## Last 24h articles (${articles.length})
${formatArticles(articles)}`,
  });

  // 화제성 실측 — LLM 점수 위에 유튜브 24h 조회 가점(0~15)을 얹는다. 실패해도 편성은 진행.
  // (2026-09-15 실측: '보도 100건' 사안들 사이에 유튜브 조회 300배 차이 — 기사 수는 변별력이 없다)
  return applyBuzz(candidates.sort((a, b) => b.totalScore - a.totalScore));
}

/**
 * Extract the list of "things the script may state as fact" from the selected
 * topic's articles. The script generator cannot claim anything outside this
 * list — in commentary content an unsourced claim is defamation bait and a
 * platform-takedown reason.
 */
export async function buildBrief(
  candidate: TopicCandidate,
  allArticles: Article[],
  channel: Channel,
  /** 기사 본문 발췌(article.ts fetchBodies). 요약이 아닌 원문에서 수치·일정·발언을 우선 추출한다. */
  bodies: string[] = [],
): Promise<Brief> {
  const articles = candidate.articleIndices
    .map((i) => allArticles[i])
    .filter((a): a is Article => Boolean(a));

  if (articles.length === 0) {
    throw new Error('The selected topic has no linked articles.');
  }

  const system = `You are the fact-checker of a commentary channel. Extract facts — and only facts — from the given articles.

- Only what is actually written in the articles goes into facts. Never pad from background knowledge.
- Interpretation, commentary, and forecasts are not facts. "A announced B" is a fact; "A blundered" is commentary.
- Someone's claim is recorded only as the fact that they claimed it. e.g. "The opposition leader claimed that ...".
- Anything under investigation or unconfirmed MUST go into caution.
- If outlets contradict each other on the facts, that goes into caution too.

The angle should fit the channel's stance but must be supportable by the facts.`;

  const { angle, facts, caution } = await generateStructured({
    system,
    name: 'issue_brief',
    schema: BriefSchema,
    user: `## Channel stance
${channel.stance}

## Channel frames
${channel.framing.map((f) => `- ${f}`).join('\n')}

## Selected issue
${candidate.headline}
${candidate.summary}

## Related articles
${formatArticles(articles)}${bodies.length ? `\n\n## Article bodies (verbatim excerpts, not summaries — extract numbers, dates and quotes from here first)\n${bodies.join('\n\n---\n\n')}` : ''}`,
  });

  return {
    headline: candidate.headline,
    summary: candidate.summary,
    keywords: candidate.keywords,
    angle,
    facts: facts.map((f) => ({
      claim: f.claim,
      sources: f.sourceIndices
        .map((i) => articles[i]?.source)
        .filter((s): s is string => Boolean(s)),
    })),
    caution,
    sources: articles.map((a) => ({
      source: a.source,
      lean: a.lean,
      title: a.title,
      link: a.link,
    })),
  };
}
