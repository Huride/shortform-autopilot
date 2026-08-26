import { createBrowserClient } from '@supabase/ssr';

/** 환경변수가 아직 없으면 null — UI 는 '연결 필요' 상태를 보여준다. */
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
