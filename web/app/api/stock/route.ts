import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'autopilot-app/1.0 (stock background search)' };

/** 위키미디어 커먼즈 검색 — 상업 사용 가능(CC/PD) 비트맵만 반환. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ ok: false, error: 'missing_query' }, { status: 400 });

  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${q}`,
    gsrnamespace: '6', gsrlimit: '16',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '1600',
    format: 'json', origin: '*',
  });
  const r = await fetch(`${API}?${params}`, { headers: UA, next: { revalidate: 3600 } });
  if (!r.ok) return NextResponse.json({ ok: false, error: 'commons_error' }, { status: 502 });
  const data = await r.json();

  const results = Object.values<any>(data?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return [];
      const lic: string = ii.extmetadata?.LicenseShortName?.value ?? '';
      const safe = /CC|PD|public/i.test(lic);
      if (!safe || !/jpeg|png/.test(ii.mime ?? '') || (ii.width ?? 0) < 900) return [];
      return [{
        url: ii.thumburl ?? ii.url,                              // 1600px — 렌더용
        thumb: (ii.thumburl ?? ii.url).replace('/1600px-', '/480px-'),
        title: String(p.title ?? '').replace('File:', ''),
        license: lic,
      }];
    })
    .slice(0, 12);

  return NextResponse.json({ ok: true, results });
}
