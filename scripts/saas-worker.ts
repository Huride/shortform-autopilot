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
import { buildBrief } from '../src/collect/select.js';
import type { Article } from '../src/collect/rss.js';
import { XMLParser } from 'fast-xml-parser';
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
function toScript(raw: any, signoffs: (string | undefined)[] = []): Script {
  const scenes: Scene[] = (raw.scenes as EditorScene[]).filter((s) => s.narration?.trim()).map((s) => {
    const emphasis = s.emphasis?.trim() && s.caption.includes(s.emphasis.trim()) ? s.emphasis.trim() : undefined;
    let visual: Scene['visual'];
    const em = s.emphasis?.trim() || '';
    if (s.visual && typeof s.visual === 'object' && 'kind' in s.visual) {
      // LLM 이 생성한 원본 비주얼 — 에디터에서 종류를 안 바꿨으면 그대로 쓴다.
      visual = s.visual;
      return { narration: s.narration.trim(), caption: s.caption?.trim() || s.narration.slice(0, 20), emphasis, visual, ...(s.bg && s.bg !== 'gen' ? { bg: s.bg } : {}) };
    }
    switch (s.visualLabel) {
      case '카운트업 통계': visual = { kind: 'stat', value: em || s.caption, label: em ? s.caption : '' }; break;
      case '인용 패널': visual = { kind: 'quote', text: s.narration.slice(0, 60), attribution: '' }; break;
      default: visual = { kind: 'keyword', text: em || s.caption };
    }
    return { narration: s.narration.trim(), caption: s.caption?.trim() || s.narration.slice(0, 20), emphasis, visual, ...(s.bg && s.bg !== 'gen' ? { bg: s.bg } : {}) };
  });
  const last = scenes[scenes.length - 1];
  const hit = signoffs.some((s) => s && last?.narration.includes(s.slice(0, 6)));
  if (hit && last) {
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

/**
 * 주제 기반 실시간 뉴스 수집 — 구글 뉴스 RSS 검색 (키 불필요).
 * LLM 학습 지식은 시점이 멈춰 있어 최근 사건을 모른다. 수동 주제도
 * 기사 팩트를 물려야 "실제 부도인데 부도설로 헤지" 같은 사실 오류가 없다.
 */
async function searchNews(topic: string): Promise<Article[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { 'User-Agent': 'shortform-autopilot-worker/1.0' } });
  if (!res.ok) return [];
  const xml = await res.text();
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const items = parsed?.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const strip = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim();
  return list.slice(0, 6).map((it: any): Article => ({
    title: strip(it.title),
    summary: strip(it.description).slice(0, 300),
    source: strip(it.source?.['#text'] ?? it.source) || 'Google News',
    lean: 'center',
    link: String(it.link ?? ''),
    publishedAt: String(it.pubDate ?? ''),
  })).filter((a: Article) => a.title);
}

/** 사용자 채널 브랜딩 — channels 테이블 첫 행의 config {name, signoff, tagline}. */
async function loadBranding(userId: string): Promise<{ name?: string; signoff?: string; tagline?: string }> {
  const r = await rest(`channels?user_id=eq.${userId}&archived=eq.false&order=created_at.asc&limit=1&select=config`);
  const [row] = await r.json();
  const c = row?.config ?? {};
  return {
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : undefined,
    signoff: typeof c.signoff === 'string' && c.signoff.trim() ? c.signoff.trim() : undefined,
    tagline: typeof c.tagline === 'string' && c.tagline.trim() ? c.tagline.trim() : undefined,
  };
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
    const brand = await loadBranding(job.user_id);
    const base = loadChannel(template);
    const channel = { ...base, ...(brand.name ? { name: brand.name } : {}), ...(brand.signoff ? { signoff: brand.signoff } : {}), ...(brand.tagline ? { tagline: brand.tagline } : {}) };
    // 실시간 사실 수집 → 팩트락. 기사가 없으면(개념·노하우형 주제) 일반 지식 모드.
    let brief;
    try {
      // 문장형 주제("~에 대해 분석하고 …하는 영상")는 검색이 안 잡힌다 —
      // 실패 시 지시어를 걷어낸 핵심 키워드로 재검색.
      let articles = await searchNews(job.topic);
      if (articles.length < 2) {
        const keywords = job.topic
          .replace(/(에 대해|대해서|관련|여부|분석|정리|팩트\s*체크|사실\s*전달|하는|하고|해주는|영상|후|및)/g, ' ')
          .replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
        if (keywords && keywords !== job.topic) {
          log.info(`  키워드 재검색: "${keywords}"`);
          articles = await searchNews(keywords);
        }
      }
      if (articles.length >= 2) {
        log.info(`  기사 ${articles.length}건 수집 — 팩트 추출`);
        brief = await buildBrief({
          headline: job.topic,
          summary: articles.slice(0, 3).map((a) => a.title).join(' / '),
          keywords: [], articleIndices: articles.map((_, i) => i),
          coverage: articles.length, leanCoverage: '', shortformFit: 0,
          channelFit: 0, freshness: 0, duplicateRisk: 0, totalScore: 0,
          reason: 'user topic',
        }, articles, channel);
      } else {
        log.info('  관련 기사 없음 — 일반 지식 모드');
      }
    } catch (e) {
      log.warn(`  수집 실패 — 일반 지식 모드: ${e instanceof Error ? e.message : e}`);
    }
    const generated = withDisclosure(await generateScript({ topic: job.topic, channel, brief }), channel);
    const script = {
      ...generated, template, approved: false,
      ...(brief ? { factCount: brief.facts.length, newsSources: brief.sources } : {}),
    };
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

    // 잡 단위 TTS 설정 — 이전 잡의 env 가 남지 않게 매번 리셋
    delete process.env.TTS_PROVIDER;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    const pickedVoice = job.script?.voice as string | undefined;
    if (pickedVoice && job.script?.voiceProvider === 'elevenlabs') {
      const er = await rest(`user_keys?user_id=eq.${job.user_id}&provider=eq.elevenlabs&select=key_encrypted`);
      const [erow] = await er.json();
      if (!erow) throw new Error('설정에서 ElevenLabs 키를 먼저 연결해주세요.');
      process.env.TTS_PROVIDER = 'elevenlabs';
      process.env.ELEVENLABS_API_KEY = decrypt(erow.key_encrypted);
      process.env.ELEVENLABS_VOICE_ID = pickedVoice;
    }

    // 에디터에서 검색·선택한 원격 실사 배경 → 로컬로 내려받아 상대 경로로 치환
    // (렌더러의 채널 톤 그레이딩은 scene.bg 경로에 자동 적용된다)
    const dlDir = resolve('remotion/public/bg/dl');
    mkdirSync(dlDir, { recursive: true });
    for (let i = 0; i < (job.script?.scenes?.length ?? 0); i++) {
      const bg = job.script.scenes[i]?.bg;
      if (typeof bg === 'string' && bg.startsWith('http')) {
        let saved = false;
        // 위키미디어는 버스트에 429 를 던진다 — 백오프 재시도 후, 그래도 실패면
        // 잡을 죽이지 않고 해당 씬만 채널 아트로 폴백한다.
        for (let attempt = 0; attempt < 4 && !saved; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 4000 * attempt));
          const res = await fetch(bg, {
            headers: { 'User-Agent': 'shortform-autopilot-worker/1.0 (background fetch; contact: ops@autopilot)' },
          }).catch(() => null);
          if (res?.ok) {
            const file = `${job.id}-${i}.jpg`;
            writeFileSync(resolve(dlDir, file), Buffer.from(await res.arrayBuffer()));
            job.script.scenes[i].bg = `bg/dl/${file}`;
            saved = true;
          } else if (res && res.status !== 429 && res.status < 500) {
            break; // 404 등 — 재시도 무의미
          }
        }
        if (!saved) {
          log.warn(`  씬 ${i + 1} 배경 다운로드 실패 — 채널 아트로 폴백`);
          delete job.script.scenes[i].bg;
        }
        await new Promise((r) => setTimeout(r, 1200)); // 연속 요청 간격
      }
    }

    const template = job.script?.template ?? 'tpl-critic';
    const baseChannel = loadChannel(template);
    // 에디터에서 고른 생성 배경 아트 스타일 (없으면 채널 기본 artDirection)
    const ART_STYLES: Record<string, { ad: string; style?: 'abstract' | 'satire' | 'photo' }> = {
      photo: { ad: 'Cinematic photorealistic still-life or place photography: real-world textures, shallow depth of field, moody natural light, dark tones.', style: 'photo' },
      minimal: { ad: 'Clean minimal geometric abstraction: a few large flat shapes, generous negative space, one soft accent glow. Calm and premium.' },
      ink: { ad: 'Editorial-cartoon ink illustration: bold black ink lines, cross-hatching, textured paper feel, one spot accent color.', style: 'satire' },
      cinematic: { ad: 'Cinematic moody scene: deep gradient atmosphere, volumetric light, subtle film grain, epic but restrained.' },
      watercolor: { ad: 'Soft watercolor wash textures on dark paper: organic bleeding edges, muted palette, delicate grain.' },
      neon: { ad: 'Dark tech field with thin neon glowing lines and circuit-like geometry, holographic accents, futuristic.' },
    };
    const styleKey = job.script?.artStyle as string | undefined;
    const styleOv = styleKey ? ART_STYLES[styleKey] : undefined;
    const brand = await loadBranding(job.user_id);
    // 색상 톤 오버라이드 — 에디터에서 고른 배경/포인트 색. 글자색은 배경 밝기로 자동 결정.
    const colors = job.script?.colors as { bg?: string; accent?: string } | undefined;
    let themeOv: typeof baseChannel.theme | undefined;
    if (baseChannel.theme && (colors?.bg || colors?.accent)) {
      const hex = (colors.bg ?? baseChannel.theme.bg).replace('#', '');
      const [r, g, b] = [0, 2, 4].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
      const lum = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      themeOv = {
        ...baseChannel.theme,
        ...(colors.bg ? { bg: colors.bg } : {}),
        ...(colors.accent ? { accent: colors.accent } : {}),
        fg: lum > 0.55 ? '#17171C' : '#F6F4F0',
      };
    }
    const channel = {
      ...baseChannel,
      ...(themeOv ? { theme: themeOv } : {}),
      ...(styleOv ? { artDirection: styleOv.ad, imageStyle: styleOv.style ?? ('abstract' as const) } : {}),
      ...(brand.name ? { name: brand.name } : {}),
      ...(brand.signoff ? { signoff: brand.signoff } : {}),
      ...(brand.tagline ? { tagline: brand.tagline } : {}),
      ...(pickedVoice ? { voice: pickedVoice } : {}),
    };
    const pickedBgm = job.script?.bgm as string | undefined;
    const bgmSrc = pickedBgm === 'none' ? undefined : pickedBgm || channel.bgm;
    // 아웃트로 설정 — enabled=false 면 브랜드 화면·사인오프 매칭 자체를 생략한다.
    const outroCfg = (job.script?.outro ?? {}) as { enabled?: boolean; tagline?: boolean; bg?: string };
    const outroOn = outroCfg.enabled !== false;
    const watermarkOn = (job.script?.watermark as boolean | undefined) !== false;
    const script = toScript(job.script, outroOn ? [channel.signoff, baseChannel.signoff] : []);

    // 씬 전용 생성 — bg='gen' 씬은 그 씬의 내용(자막·나레이션)을 소재로
    // 개별 이미지를 그린다. 씬마다 다른 그림이 필요할 때 사용 (씬당 이미지 1장).
    for (let i = 0; i < script.scenes.length; i++) {
      if ((job.script.scenes[i] as any)?.bg === 'gen') {
        const sc = script.scenes[i]!;
        log.info(`  씬 ${i + 1} 전용 이미지 생성`);
        try {
          const p = await generateBackground(`${job.id}-s${i}`, {
            headline: sc.caption, summary: sc.narration, angle: channel.stance.slice(0, 200),
            keywords: [], facts: [], caution: [], sources: [],
          }, channel);
          script.scenes[i] = { ...sc, bg: p };
        } catch (e) {
          log.warn(`  씬 ${i + 1} 전용 생성 실패 — 공용 아트로 폴백: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    // 채널 아트 배경 — '채널 아트' 를 쓰는 씬이 있을 때만 잡당 1장 생성
    // (모든 씬이 실사면 어차피 가려진다 — 생성 비용을 쓰지 않는다)
    const needsArt = script.scenes.some((s) => !s.bg) || (outroOn && outroCfg.bg === 'art');
    let backgroundImage: string | undefined;
    if (!needsArt) log.info('  모든 씬이 실사 배경 — 채널 아트 생성 건너뜀');
    try {
      if (needsArt) backgroundImage = await generateBackground(job.id, {
        headline: script.title, summary: job.topic, angle: channel.stance.slice(0, 200),
        keywords: [], facts: [], caution: [], sources: [],
      }, channel);
    } catch (e) {
      log.warn(`  배경 생성 실패 — 테마 배경으로 진행: ${e instanceof Error ? e.message : e}`);
    }

    // 아웃트로 배경 — 'art'=공용 생성 아트, http=다운로드, 그 외=로컬 상대 경로
    let outroBg: string | undefined;
    if (outroOn && outroCfg.bg) {
      if (outroCfg.bg === 'art') outroBg = backgroundImage;
      else if (outroCfg.bg.startsWith('http')) {
        const res = await fetch(outroCfg.bg, {
          headers: { 'User-Agent': 'shortform-autopilot-worker/1.0 (background fetch; contact: ops@autopilot)' },
        }).catch(() => null);
        if (res?.ok) {
          const file = `${job.id}-outro.jpg`;
          writeFileSync(resolve(dlDir, file), Buffer.from(await res.arrayBuffer()));
          outroBg = `bg/dl/${file}`;
        } else log.warn('  아웃트로 배경 다운로드 실패 — 테마 배경으로 진행');
      } else outroBg = outroCfg.bg;
    }

    const audio = await synthesizeScript(job.id, script, {
      voice: channel.voice, style: channel.voiceStyle, speed: channel.voiceSpeed,
    });
    const props = toShortProps(script, audio, channel.theme, {
      signoff: outroOn ? channel.signoff : undefined,
      backgroundImage, bgmSrc, bgmVolume: channel.bgmVolume,
      brand: outroOn ? channel.name : undefined,
      brandTagline: channel.tagline,
      showWatermark: watermarkOn,
      outroTagline: outroCfg.tagline !== false,
      ...(outroBg ? { outroBg } : {}),
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
