#!/usr/bin/env node
/**
 * YouTube refresh token 발급 헬퍼.
 *
 * 연결에서 제일 까다로운 단계가 이것이다: videos.insert 는 OAuth 사용자 인증이
 * 필요하고 (API 키로는 업로드 불가), 자동화에는 만료되지 않는 refresh token 이
 * 필요하다. 이 스크립트가 브라우저 동의 → 코드 수신 → 토큰 교환까지 처리한다.
 *
 * 사용:
 *   .env 에 YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET 를 먼저 채운 뒤
 *   node scripts/youtube-auth.mjs
 *
 * 전제: Google Cloud Console 의 OAuth 클라이언트가 "데스크톱 앱" 유형이어야 한다.
 * (웹 앱 유형이면 redirect URI 등록 문제로 실패한다)
 *
 * 원격 세션 모드 (이 스크립트가 도는 기계와 브라우저를 보는 기계가 다를 때):
 *   1) node scripts/youtube-auth.mjs --url     → 인증 URL 만 출력
 *   2) 그 URL 을 "지금 보고 있는 기기" 브라우저에서 열어 동의
 *   3) 마지막에 http://127.0.0.1:8642/callback?code=... 로 이동하다 "연결할 수 없음"
 *      페이지가 뜬다 — 정상이다. 주소창의 전체 URL 을 복사
 *   4) node scripts/youtube-auth.mjs --code '<복사한 전체 URL 또는 code 값>'
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// .env 로딩 (config.ts 와 같은 규칙, 의존성 없이)
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] === undefined) {
      process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET 를 .env 에 먼저 채우세요.');
  console.error('발급: https://console.cloud.google.com/apis/credentials → OAuth 클라이언트 ID → 데스크톱 앱');
  process.exit(1);
}

const PORT = 8642;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // ← refresh token 을 받는 핵심
    prompt: 'consent', // 이미 동의한 계정도 refresh token 을 다시 발급받게
  });

const args = process.argv.slice(2);

/** --code 인자 또는 붙여넣은 콜백 URL 에서 인증 코드를 꺼낸다. */
function codeFromArgs() {
  const i = args.indexOf('--code');
  if (i < 0) return null;
  const raw = args[i + 1];
  if (!raw) {
    console.error("--code 뒤에 값을 넣으세요. 예: --code '4/0Ab...' 또는 콜백 전체 URL");
    process.exit(1);
  }
  if (raw.includes('code=')) {
    return new URL(raw).searchParams.get('code');
  }
  return raw;
}

if (args.includes('--url')) {
  // 원격 세션 1단계: URL 만 출력하고 끝낸다. 콜백 서버를 띄우지 않는다.
  console.log('\n아래 URL 을 "지금 화면을 보고 있는 기기"의 브라우저에서 여세요:\n');
  console.log(authUrl + '\n');
  console.log('동의 후 "127.0.0.1 에 연결할 수 없음" 페이지가 뜨면 정상입니다.');
  console.log("주소창의 전체 URL 을 복사해서:  node scripts/youtube-auth.mjs --code '<붙여넣기>'");
  process.exit(0);
}

const manualCode = codeFromArgs();
if (!manualCode) {
  console.log('\n브라우저에서 채널 계정으로 로그인·동의하세요.');
  console.log('자동으로 열리지 않으면 이 URL 을 직접 여세요:\n');
  console.log(authUrl + '\n');
  spawn('open', [authUrl], { stdio: 'ignore', detached: true }).unref();
}

const code = manualCode ?? await new Promise((resolvePromise) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', REDIRECT);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const received = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      error
        ? `<h2>실패: ${error}</h2><p>터미널을 확인하세요.</p>`
        : '<h2>인증 완료</h2><p>이 창은 닫아도 됩니다. 터미널로 돌아가세요.</p>',
    );
    server.close();
    if (error) {
      console.error(`동의 화면에서 오류: ${error}`);
      process.exit(1);
    }
    resolvePromise(received);
  });
  server.listen(PORT, '127.0.0.1');
});

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  }),
});
const token = await res.json();

if (!token.refresh_token) {
  console.error('\nrefresh_token 이 응답에 없습니다:', JSON.stringify(token, null, 2));
  console.error(
    '이미 이 앱에 동의한 적이 있으면 https://myaccount.google.com/permissions 에서 앱 액세스를 제거하고 다시 시도하세요.',
  );
  process.exit(1);
}

// 토큰을 화면에 찍지 않고 .env 에 직접 쓴다 — 출력 경로에서 유실·노출될 여지를 없앤다.
import('node:fs').then(({ readFileSync: rf, writeFileSync: wf }) => {
  const lines = rf(envPath, 'utf8').split('\n').filter((l) => !l.startsWith('YOUTUBE_REFRESH_TOKEN='));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push(`YOUTUBE_REFRESH_TOKEN=${token.refresh_token}`, '');
  wf(envPath, lines.join('\n'), { mode: 0o600 });
  console.log('\n발급 완료 — .env 의 YOUTUBE_REFRESH_TOKEN 에 저장했습니다.');
  console.log('(토큰은 화면에 출력하지 않습니다. pnpm doctor 로 확인하세요.)');
});
