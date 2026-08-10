import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as z from 'zod/v4';
import type { Channel } from '../channel.js';
import { PATHS, env } from '../config.js';
import { generateStructured } from '../llm.js';
import { log } from '../log.js';
import type { Brief } from '../types.js';

/**
 * Topic-matched background image generation.
 *
 * One image per video. Per-scene images would (1) multiply cost ~9x and
 * (2) destroy the channel's visual identity — a different picture every scene
 * makes the channel unrecognizable. One image, slowly panned and zoomed, wins.
 */

/**
 * Constraints the model cannot override. Kept separate from prompt generation
 * and appended in code.
 *
 * The absolute line for both styles: **never depict a recognizable real person.**
 * A generated image where a public figure is identifiable — even as caricature —
 * enters deepfake/likeness-rights territory in most jurisdictions, and that is
 * the line this pipeline does not cross. Blocking photorealism serves the same
 * goal: remove any chance of being mistaken for a real photo.
 *
 * The satire style allows only the anonymous-figure grammar of editorial
 * cartoons: faceless suited figures, back views, personified objects. Real
 * newspaper cartoons use these, and without pointing at a specific person they
 * are safe as satire.
 */
const COMMON_CONSTRAINTS = [
  'Never depict a real person recognizably. No combination of facial features, hairstyle, and body shape that evokes a specific public figure.',
  'Never produce photorealistic imagery.',
  'No text, numbers, logos, party symbols, or national flags.',
  'Never reconstruct an actual event scene.',
  'The center and bottom 40% of the frame is where captions sit. Keep that area dark and visually simple.',
  'Dark overall. Bright regions must not hurt caption legibility.',
];

const STYLE_CONSTRAINTS: Record<ImageStyle, string[]> = {
  abstract: [
    'No people, faces, or human silhouettes of any kind. No crowds, no back views.',
    'Abstract or symbolic illustration only.',
  ],
  satire: [
    'Editorial-cartoon style: bold ink lines, exaggerated proportions, cross-hatching.',
    'Figures must be anonymous only: blank faces (no facial features), back views, shadow silhouettes, or personified objects.',
    'Build the satire from situation and composition — like a giant rubber stamp crushing small desks. Mock structures, not individuals.',
  ],
};

export type ImageStyle = 'abstract' | 'satire';

const PromptSchema = z.object({
  concept: z.string().describe('One abstract concept that visually represents this issue. One sentence.'),
  prompt: z
    .string()
    .describe(
      'The image-generation prompt, in English. Concrete about composition, color, texture, lighting. Absolutely no people and no text.',
    ),
});

const STYLE_EXAMPLES: Record<ImageStyle, string> = {
  abstract: `Good: a geometric pattern of empty meeting-room chairs, cracked concrete texture, overlapping document silhouettes,
cold light falling down a staircase, mismatched gears.
Bad: a politician giving a speech, a photorealistic parliament building, a protest crowd.`,
  satire: `Good: a giant approval stamp pressing down on three small caps, a faceless suited figure
tipping a scale atop a pile of documents, an anonymous hand hammering a machine whose gears don't mesh.
Bad: a caricature resembling a specific politician, any real person's face, a reconstruction of an actual press conference.`,
};

/** Re-asserted in English at the end. Even if the generated prompt drifts, this wins. */
const STYLE_SUFFIX: Record<ImageStyle, string> = {
  abstract:
    'Absolute requirements: no people, no faces, no human figures or silhouettes. No text, letters, numbers, logos, flags, or party symbols. Not photorealistic — abstract or symbolic illustration only.',
  satire:
    'Absolute requirements: editorial cartoon style with bold ink lines and cross-hatching. Any human figures must be strictly anonymous — blank faces with no facial features, back views, or shadow silhouettes only. Must NOT resemble any real person or politician. No text, letters, numbers, logos, flags, or party symbols. Not photorealistic.',
};

/** Build a background-image prompt that symbolizes the issue in the brief. */
async function buildPrompt(brief: Brief, channel: Channel): Promise<string> {
  const style = channel.imageStyle ?? 'abstract';
  const constraints = [...COMMON_CONSTRAINTS, ...STYLE_CONSTRAINTS[style]].join('\n');

  const { concept, prompt } = await generateStructured({
    name: 'background_prompt',
    schema: PromptSchema,
    maxTokens: 4000,
    system: `You are the background-image art director for a short-form channel.
${style === 'satire' ? 'Design a single editorial-cartoon frame that satirizes the issue. The target of the mockery is a structure or situation, never a person.' : 'Design a background that expresses the issue abstractly and symbolically, never depicting it literally.'}

Absolute rules (cannot be broken):
${constraints}

${STYLE_EXAMPLES[style]}`,
    user: `## Channel art direction
${channel.artDirection ?? 'Dark, restrained tone. Weight without exaggeration.'}

## The issue
${brief.headline}
${brief.summary}

## This video's angle
${brief.angle}`,
  });

  log.info(`  concept: ${concept}`);

  return `${prompt}

${STYLE_SUFFIX[style]} Dark overall tone. Keep the center and bottom 40% of the frame dark and visually simple for subtitle overlay. Vertical composition.`;
}

/** Returns a path relative to remotion/public. */
export async function generateBackground(
  jobId: string,
  brief: Brief,
  channel: Channel,
): Promise<string> {
  const prompt = await buildPrompt(brief, channel);

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.openaiApiKey()}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model: env.imageModel(),
      prompt,
      // Vertical: 1024x1536 (2:3), covered onto the 9:16 canvas.
      size: '1024x1536',
      quality: env.imageQuality(),
      n: 1,
    }),
  });

  const body = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Image generation ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image response has no b64_json.');

  const outPath = resolve(PATHS.background, `${jobId}.png`);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, Buffer.from(b64, 'base64'));

  return relative(PATHS.remotionPublic, outPath);
}
