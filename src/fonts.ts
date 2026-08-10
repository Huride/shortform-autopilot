import { execFileSync } from 'node:child_process';
import { listChannels, loadChannel } from './channel.js';

/**
 * 채널 테마가 지정한 폰트가 실제로 설치되어 있는지 점검한다.
 *
 * 이게 필요한 이유: 폰트가 없어도 렌더는 성공한다. 조용히 기본 산세리프로
 * 떨어질 뿐이다. 그러면 여러 채널이 같은 얼굴을 갖게 되는데, 그게 정확히
 * 피하려던 상황이다 (docs/CHANNEL.md §3-1). 실패가 눈에 보여야 한다.
 */

export interface FontCheck {
  channelId: string;
  family: string;
  installed: boolean;
}

/** fontStack 의 첫 패밀리 = 실제로 쓰이길 의도한 폰트. 나머지는 폴백이다. */
function primaryFamily(fontStack: string): string {
  const first = fontStack.split(',')[0] ?? '';
  return first.trim().replace(/^['"]|['"]$/g, '');
}

function installedFamilies(): Set<string> | null {
  try {
    const out = execFileSync('fc-list', [':family'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const families = new Set<string>();
    for (const line of out.split('\n')) {
      // 한 줄에 "경로: 한글명,영문명,PostScript명" 형태로 별칭이 쉼표로 붙는다.
      const afterPath = line.includes(': ') ? line.slice(line.indexOf(': ') + 2) : line;
      for (const alias of afterPath.split(',')) {
        const name = alias.split(':')[0]?.trim();
        if (name) families.add(name.toLowerCase());
      }
    }
    return families;
  } catch {
    return null; // fc-list 없음 — 점검 불가
  }
}

/** null 이면 점검 자체가 불가능한 환경 (fontconfig 없음). */
export function checkChannelFonts(): FontCheck[] | null {
  const families = installedFamilies();
  if (!families) return null;

  return listChannels().map((id) => {
    const family = primaryFamily(loadChannel(id).theme.fontStack);
    return { channelId: id, family, installed: families.has(family.toLowerCase()) };
  });
}
