import type { Job } from '../types.js';

/**
 * 고정 댓글용 출처 텍스트 — 붙여넣기 완성형.
 *
 * 전부 나열하지 않는다: 링크가 많은 댓글은 인스타·유튜브 스팸 필터에 걸리고,
 * 대본이 인용하지 않은 기사는 출처가 아니다. 사실 목록이 인용한 매체의
 * 기사만 남기고 8개로 컷한다.
 */
export function buildPinnedComment(job: Job): string | null {
  const brief = job.brief;
  if (!brief) return null;

  const citedMedia = new Set(brief.facts.flatMap((f) => f.sources));

  const seen = new Set<string>();
  const perMedia = new Map<string, number>();
  const picked = brief.sources.filter((s) => {
    if (!citedMedia.has(s.source)) return false;
    // 같은 사안을 여러 매체가 받아쓴 경우 제목 앞부분으로 중복을 접는다.
    const key = s.title.replace(/\s/g, '').slice(0, 14);
    if (seen.has(key)) return false;
    // 한 매체가 목록을 독점하지 않게 매체당 2건까지.
    const count = perMedia.get(s.source) ?? 0;
    if (count >= 2) return false;
    seen.add(key);
    perMedia.set(s.source, count + 1);
    return true;
  });

  const lines = picked.slice(0, 8).map(
    (s) => `▷ ${s.title.trim()} (${s.source})\n${s.link.split('?utm_')[0]}`,
  );
  if (lines.length === 0) return null;

  return [
    '[Sources for this video]',
    '',
    'The facts cited in this video are based on the reporting below.',
    '',
    lines.join('\n\n'),
    '',
    'The script and voice of this video were produced with AI.',
  ].join('\n');
}
