import * as z from 'zod/v4';
import type { Channel } from '../channel.js';
import { generateStructured } from '../llm.js';
import type { Brief, TopicCandidate } from '../types.js';
import type { HistoryEntry } from './history.js';
import type { Article } from './rss.js';

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
  duplicateRisk: z.number().describe('Overlap with recently covered topics. 1–10 (higher = more overlap).'),
  totalScore: z.number().describe('Overall score 1–100.'),
  reason: z.string().describe('One sentence explaining the score.'),
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
- duplicateRisk: high if it overlaps the recently-covered list — and a high value must slash the total score.

**Important**: stories that run entirely on a single unverified personal allegation, conspiracy-adjacent stories, and re-litigations of legally settled matters get a LOW channelFit. Those topics shorten a channel's life.
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

  return candidates.sort((a, b) => b.totalScore - a.totalScore);
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
${formatArticles(articles)}`,
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
