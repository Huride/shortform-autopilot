/**
 * SaaS 렌더 워커 — Supabase jobs 를 폴링해 기존 파이프라인으로 렌더한다.
 * 실행: npx tsx scripts/saas-worker.ts   (상시 구동 머신)
 *
 * 상태 흐름: scripted(대기) → voiced(처리 중 마커) → rendered | failed
 * 사용자 OpenAI 키는 user_keys 에서 복호화해 잡 단위로 주입한다.
 */
import { createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadChannel } from '../src/channel.js';
import { env } from '../src/config.js';
import { log } from '../src/log.js';
import { invalidateBundle, renderShort, toShortProps } from '../src/pipeline/render.js';
import { generateBackground } from '../src/pipeline/image.js';
import { generateScript, withDisclosure } from '../src/pipeline/script.js';
import { synthesizeScript } from '../src/pipeline/tts.js';
import type { Scene, Script } from '../src/types.js';

const SB = process.env.SUPABASE_URL!;
const SK = process.env.SUPABASE_SECRET_KEY!;
const MASTER = Buffer.from(process.env.KEY_MASTER!, 'hex');
const H = { apikey: SK, Authorization: `Bearer ${SK}` };

function decrypt(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const d = createDecipheriv('aes-256-gcm', MASTER, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

type EditorScene = { narration: string; caption: string; emphasis?: string; visualLabel?: string; bg?: string; visual?: Scene['visual'] };

/** 에디터의 느슨한 씬을 렌더러 Script 로 변환. 값이 필요한 카드는 안전한 폴백. */
function toScript(raw: any, signoff?: string): Script {
  const scenes: Scene[] = (raw.scenes as EditorScene[]).filter((s) => s.narration?.trim()).map((s) => {
    const emphasis = s.emphasis?.trim() && s.caption.includes(s.emphasis.trim()) ? s.emphasis.trim() : undefined;
    let visual: Scene['visual'];
    const em = s.emphasis?.trim() || '';
    if (s.visual && typeof s.visual === 'object' && 'kind' in s.visual) {
      // LLM 이 생성한 원본 비주얼 — 에디터에서 종류를 안 바꿨으면 그대로 쓴다.
      visual = s.visual;
      return { narration: s.narration.trim(), caption: s.caption?.trim() || s.narration.slice(0, 20), emphasis, visual, ...(s.bg ? { bg: s.bg } : {}) };
    }
    switch (s.visualLabel) {
      case '카운트업 통계': visual = { kind: 'stat', value: em || s.caption, label: em ? s.caption : '' }; break;
      case '인용 패널': visual = { kind: 'quote', text: s.narration.slice(0, 60), attribution: '' }; break;
      default: visual = { kind: 'keyword', text: em || s.caption };
    }
    return { narration: s.narration.trim(), caption: s.caption?.trim() || s.narration.slice(0, 20), emphasis, visual, ...(s.bg ? { bg: s.bg } : {}) };
  });
  const last = scenes[scenes.length - 1];
  if (signoff && last && last.narration.includes(signoff.slice(0, 6))) {
    scenes[scenes.length - 1] = { ...last, outro: true, visual: undefined };
  }
  return { title: raw.title, hook: raw.hook || raw.title, scenes, description: raw.description ?? '', hashtags: raw.hashtags ?? [] };
}

async function rest(path: string, init?: RequestInit) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, 'Content-Type': 'application/json', ...(init?.headers as any) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r;
}

async function patchJob(id: string, body: object) {
  await rest(`jobs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });
}

async function injectUserKey(userId: string) {
  const kr = await rest(`user_keys?user_id=eq.${userId}&provider=eq.openai&select=key_encrypted`);
  const [krow] = await kr.json();
  if (!krow) throw new Error('설정에서 OpenAI API 키를 먼저 연결해주세요.');
  process.env.OPENAI_API_KEY = decrypt(krow.key_encrypted);
}

/** 1단계: pending 잡 → LLM 대본 생성 → scripted(미승인) 로 에디터에 넘긴다. */
async function generateOne(): Promise<boolean> {
  const r = await rest(`jobs?status=eq.pending&order=created_at.asc&limit=1&select=*`);
  const [job] = await r.json();
  if (!job) return false;
  const claim = await rest(`jobs?id=eq.${job.id}&status=eq.pending`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'pending', error: 'claimed' }),
  });
  if ((await claim.json()).length === 0) return true;

  log.step(`[${job.id.slice(0, 8)}] 대본 생성 — ${job.topic}`);
  try {
    await injectUserKey(job.user_id);
    const template = job.script?.template ?? 'tpl-critic';
    const channel = loadChannel(template);
    const generated = withDisclosure(await generateScript({ topic: job.topic, channel }), channel);
    const script = { ...generated, template, approved: false };
    await patchJob(job.id, { status: 'scripted', script, error: null });
    log.ok(`  대본 ${generated.scenes.length}씬 — 에디터 대기`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`  생성 실패: ${msg}`);
    await patchJob(job.id, { status: 'failed', error: msg.slice(0, 300) });
  }
  return true;
}

async function processOne(): Promise<boolean> {
  // 승인된 대본만 렌더한다 — 미승인(scripted) 은 에디터가 소유한 초안.
  const r = await rest(`jobs?status=eq.scripted&script->>approved=eq.true&order=created_at.asc&limit=1&select=*`);
  const [job] = await r.json();
  if (!job) return false;

  // 클레임 (동시 워커 대비 조건부 갱신)
  const claim = await rest(`jobs?id=eq.${job.id}&status=eq.scripted`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'voiced' }),
  });
  if ((await claim.json()).length === 0) return true;

  log.step(`[${job.id.slice(0, 8)}] ${job.topic}`);
  try {
    await injectUserKey(job.user_id);

    // 에디터에서 검색·선택한 원격 실사 배경 → 로컬로 내려받아 상대 경로로 치환
    // (렌더러의 채널 톤 그레이딩은 scene.bg 경로에 자동 적용된다)
    const dlDir = resolve('remotion/public/bg/dl');
    mkdirSync(dlDir, { recursive: true });
    for (let i = 0; i < (job.script?.scenes?.length ?? 0); i++) {
      const bg = job.script.scenes[i]?.bg;
      if (typeof bg === 'string' && bg.startsWith('http')) {
        const res = await fetch(bg, { headers: { 'User-Agent': 'autopilot-worker/1.0' } });
        if (!res.ok) throw new Error(`배경 다운로드 실패 (${res.status}): 씬 ${i + 1}`);
        const file = `${job.id}-${i}.jpg`;
        writeFileSync(resolve(dlDir, file), Buffer.from(await res.arrayBuffer()));
        job.script.scenes[i].bg = `bg/dl/${file}`;
      }
    }

    const template = job.script?.template ?? 'tpl-critic';
    const baseChannel = loadChannel(template);
    // 에디터에서 고른 생성 배경 아트 스타일 (없으면 채널 기본 artDirection)
    const ART_STYLES: Record<string, { ad: string; style?: 'abstract' | 'satire' }> = {
      minimal: { ad: 'Clean minimal geometric abstraction: a few large flat shapes, generous negative space, one soft accent glow. Calm and premium.' },
      ink: { ad: 'Editorial-cartoon ink illustration: bold black ink lines, cross-hatching, textured paper feel, one spot accent color.', style: 'satire' },
      cinematic: { ad: 'Cinematic moody scene: deep gradient atmosphere, volumetric light, subtle film grain, epic but restrained.' },
      watercolor: { ad: 'Soft watercolor wash textures on dark paper: organic bleeding edges, muted palette, delicate grain.' },
      neon: { ad: 'Dark tech field with thin neon glowing lines and circuit-like geometry, holographic accents, futuristic.' },
    };
    const styleKey = job.script?.artStyle as string | undefined;
    const styleOv = styleKey ? ART_STYLES[styleKey] : undefined;
    const channel = styleOv
      ? { ...baseChannel, artDirection: styleOv.ad, imageStyle: styleOv.style ?? 'abstract' }
      : baseChannel;
    const script = toScript(job.script, channel.signoff);

    // 채널 아트 배경 — 잡당 1장 생성 (실패해도 테마 배경으로 진행)
    let backgroundImage: string | undefined;
    try {
      backgroundImage = await generateBackground(job.id, {
        headline: script.title, summary: job.topic, angle: channel.stance.slice(0, 200),
        keywords: [], facts: [], caution: [], sources: [],
      }, channel);
    } catch (e) {
      log.warn(`  배경 생성 실패 — 테마 배경으로 진행: ${e instanceof Error ? e.message : e}`);
    }

    const audio = await synthesizeScript(job.id, script, {
      voice: channel.voice, style: channel.voiceStyle, speed: channel.voiceSpeed,
    });
    const props = toShortProps(script, audio, channel.theme, {
      signoff: channel.signoff, backgroundImage, bgmSrc: channel.bgm, bgmVolume: channel.bgmVolume,
      brand: channel.name, brandTagline: channel.tagline,
    });
    invalidateBundle(); // 새 오디오·배경이 번들 public 사본에 들어가야 한다
    const videoPath = await renderShort(job.id, props);

    // Supabase Storage 업로드 (M1 — 추후 R2 전환)
    const key = `${job.user_id}/${job.id}.mp4`;
    const up = await fetch(`${SB}/storage/v1/object/videos/${key}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
      body: readFileSync(videoPath),
    });
    if (!up.ok) throw new Error(`upload: ${up.status} ${await up.text()}`);
    const url = `${SB}/storage/v1/object/public/videos/${key}`;

    await patchJob(job.id, { status: 'rendered', video_url: url, error: null });
    log.ok(`  → ${url}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`  실패: ${msg}`);
    await patchJob(job.id, { status: 'failed', error: msg.slice(0, 300) });
  }
  return true;
}

async function main() {
  log.info(`SaaS 워커 시작 — ${SB}`);
  for (;;) {
    try { await generateOne(); await processOne(); } catch (e) { log.error(String(e)); }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
main();
