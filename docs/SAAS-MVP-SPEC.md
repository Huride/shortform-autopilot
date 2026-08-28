# Shortform Autopilot SaaS — MVP 스펙

> 기존 파이프라인(이 저장소)을 멀티유저 웹 서비스로 감싸는 MVP 설계.
> 원칙: **파이프라인 코드는 최대한 그대로, 새로 짓는 건 껍데기(웹/큐/DB)만.**

## 1. 제품 요약

- 사용자는 자기 API 키(OpenAI 필수, ElevenLabs 선택)로 숏폼 영상을 생성하고 다운로드한다.
- 채널 세팅은 **에이전트와의 대화 + 프리셋 선택 + 사이드 패널 입력**의 조합.
- 발행 자동화(YouTube/IG 연동·예약·검증)는 상위 플랜 — **Phase 2**.

### 플랜 구조

| | 기본 플랜 | 자동화 플랜 (Phase 2) |
|---|---|---|
| 채널 세팅 (에이전트+프리셋) | ✅ | ✅ |
| 영상 생성 + 다운로드 | ✅ 월 N편 제한 | ✅ 상향 |
| YouTube/IG OAuth 연동·발행 | — | ✅ |
| 예약 발행 + 발행 검증 알림 | — | ✅ |
| 자동 편성 (RSS→주제선정→생성) | — | ✅ |
| 통계 스냅샷 (동시점 A/B) | — | ✅ |
| 주간 결산 롱폼 / IG 카드뉴스 | — | ✅ |

비용 구조: 대본 LLM·TTS·이미지 = 사용자 키(사용자 부담), 세팅 에이전트 대화 = 운영자 키(소액), 렌더 컴퓨팅 = 운영자 부담(→ 렌더 횟수 제한의 근거).

## 2. 화면 구성 (4개)

### 2-1. 온보딩 위저드 (첫 채널 만들기)

대화형 단독이 아니라 **구조화 단계 + 프리셋 칩 + 직접 입력**, 에이전트는 보조.
각 단계는 화면 중앙에 칩 그리드, 하단에 자유 입력창("직접 쓸게요"), 우측에 에이전트 채팅(질문 가능).

1. **주제/니치**: 프리셋 칩 — `재테크·투자` `테크/IT` `건강·헬스케어` `시사·경제` `자동차` `부동산` `AI 트렌드` `소비자 정보` + 직접 입력
   - → `topicPreference` + 기본 RSS 피드 세트 매핑
2. **채널 컨셉 (논조)**: `전문가 해설형` `소비자 관점 비판형` `팩트체크형` `큐레이션/브리핑형` `스토리텔링형` + 직접 입력
   - → `stance`, `framing`, `scriptFrame` 초안을 에이전트가 생성
3. **비주얼 컨셉**: `플랫 일러스트` `네온 미니멀` `잡지 에디토리얼` `다크 테크` `수채/파스텔` + 직접 입력 (추후: 예시 썸네일 이미지로 교체)
   - → `artDirection`, `theme`(색·폰트) 초안 생성
   - **배경 소스 선택**: `AI 생성` / `실사 스톡` / `혼합(씬 유형에 맞게 자동 — 제품·장소는 실사, 개념·수치는 생성)` + 씬별 배경 on/off (기존 `bg` 필드 활용, 씬 수만큼 이미지 비용 증가는 사용자 키 부담이므로 안내만)
   - **실사 원칙(리스크 규칙)**: 상업 사용 가능 스톡(Unsplash/Pexels API)과 사용자 업로드만. 언론사 보도사진 등 라이선스 필요 이미지는 자동 수집 금지. 스톡은 출처를 함께 기록.
4. **보이스**: OpenAI 보이스 프리셋(샘플 재생 버튼) + 속도. ElevenLabs 키가 있으면 보이스 목록 로드
   - → `voice`, `voiceStyle`, `voiceSpeed`
5. **브랜딩**: 채널명, 시그니처 멘트(`signoff`), 워터마크(`tagline`) — 에이전트가 3안 제안, 선택/수정
6. **API 키 연결 (사이드 패널)**: OpenAI 키 입력 → 즉시 검증(모델 접근·TTS·이미지 권한 체크 = `doctor` 로직 포팅) → 실패 사유를 한국어로 표시. ElevenLabs는 "나중에" 허용
7. **확인 카드**: 완성된 채널 설정 요약 → "테스트 영상 만들기" (aha-moment. 렌더 3~5분, 진행 단계 표시)

산출물 = `channels/*.json` 스키마와 동일한 config 1건 (DB 저장).

### 2-2. 채널 워크스페이스 (메인 = 채팅 + 사이드 패널)

- **중앙: 에이전트 채팅.** "오늘 이 주제로 영상 만들어줘", "방금 영상 2번 장면 카드를 차트로 바꿔줘", "시그니처 멘트 더 짧게" 등.
- **우측: 컨텍스트 사이드 패널** (에이전트가 열거나 사용자가 탭으로 전환):
  - *채널 설정 패널*: 이름·signoff·tagline·보이스·속도·색상 등 단순 값은 폼으로 직접 수정 (대화 강제 금지)
  - *API 키 패널*: 키 등록/재검증/삭제
  - *잡 상세 패널*: 생성 중인 영상의 단계 진행(대본→음성→이미지→렌더), 대본 씬별 미리보기, 실패 시 에러+재시도 버튼
- 역할 분담 원칙: **판단이 필요한 것(논조·대본·컨셉)은 대화, 값 입력(키·이름·숫자)은 패널.**

### 2-2b. 새 영상 만들기 (단일 영상 생성 — 자동 편성과 별개의 진입점)

수동으로 원하는 주제의 영상을 만드는 2단계 플로우. 자동 편성이 꺼져 있어도 이 경로만으로 서비스가 성립한다 (기본 플랜의 주 사용 경로).

- **1단계 · 주제**: 주제 한 줄 직접 입력(기사 링크 붙여넣기 지원 — 그 기사를 소재로) + 템플릿/길이 선택 + **오늘 뉴스 추천 카드**(채널 성향 기준, 자동 편성 파이프라인의 주제 선정 로직 재사용). 대본 생성은 무료 — 크레딧은 렌더 시점에만 소비.
- **2단계 · 대본 에디터 (핵심 화면)**: 씬별 카드 편집 —
  - 카드마다: 나레이션(textarea) / 자막(⏎ 줄바꿈 지정) / 강조어 / 비주얼 카드 종류(8종 select) / 배경 소스(생성·실사·내 에셋) / 씬별 미리듣기 / 드래그 순서변경 / 삭제 / 씬 추가
  - 우측 레일: 요약(씬 수·예상 길이·크레딧) + 렌더 버튼, **에이전트 수정 요청 입력**("전체 톤 부드럽게", "씬 3을 맨 앞으로") — 직접 편집과 에이전트 편집이 같은 대본을 다룬다
  - **팩트락 유지**: 직접 수정이든 에이전트 수정이든 출처 없는 수치는 검증 단계에서 걸러짐을 UI에 명시
- 진입점: 좌측 내비 "새 영상 만들기" + 워크스페이스/보관함의 "＋ 새 영상"

### 2-3. 보관함 (라이브러리)

- **영상 탭**: 완성 영상 그리드 — 썸네일(첫 프레임), 제목, 생성일, 채널 배지 / 클릭 → 인라인 플레이어 + 다운로드 + 대본·해시태그·(고정댓글용) 출처 복사 버튼 (Phase 2: 발행 버튼)
- **진행 중 탭**: 큐 상태 — 단계 프로그레스, 실패 잡은 붉은 배지 + "여기서부터 재시도"(기존 `retry` 시맨틱)
- **채널 탭**: 저장된 채널 설정 카드 — 편집(→워크스페이스), 복제, 보관
- **에셋 탭**: 업로드 이미지(브랜드 로고 등) + 생성된 배경(자동 저장·재사용 → 이미지 비용 절감) + 사용한 스톡(출처·라이선스 표기와 함께). 워크스페이스에서 "내 에셋 우선" 배경 모드로 참조.
- 영상 파일은 R2 보관 30일 + presigned URL 다운로드. 만료 전 알림 배지.

### 2-4. 설정

계정, 플랜/사용량(이번 달 렌더 n/30), 결제, 키 관리(2-2 패널과 동일 컴포넌트).

## 3. 에이전트 설계

- 모델: Claude (운영자 키). 시스템 프롬프트 = 채널 config 스키마 + `.claude/skills/new-channel/SKILL.md`의 채널 개발 노하우를 이식.
- **툴 (function calling)** — 전부 서버 API 경유, zod 스키마 검증(`src/channel.ts`·`remotion/schema.ts` 재사용):
  - `get_channel_config` / `update_channel_config(patch)` — 검증 실패 시 에이전트에 에러 반환(자기 수정 루프)
  - `create_job(topic, channelId)` — 기존 `add` 시맨틱
  - `get_script(jobId)` / `revise_script(jobId, instruction)` — 씬 단위 수정
  - `start_render(jobId)` — **쿼터 확인 + 사용자 확인 버튼**을 거쳐 실행 (에이전트 단독 렌더 금지 — 렌더는 원가)
  - `get_job_status(jobId)` / `list_jobs()`
  - `open_panel(name)` — 키 입력 등 값 입력이 필요하면 사이드 패널을 여는 UI 액션
- 가드레일: config 변경은 반드시 툴 경유(자유 텍스트로 JSON 생성 금지), 렌더·삭제는 확인 필수, 채팅 세션당 토큰 상한.

### 에이전트 원가 통제 (운영자 부담 항목이므로 설계 단계에서 못 박는다)

- **프롬프트 캐싱 전제 설계**: 시스템 프롬프트는 고정(타임스탬프·사용자명 등 동적 값 삽입 금지), 채널 config는 시스템 프롬프트에 박지 말고 `get_channel_config` 툴로 조회 — 캐시 히트 시 입력 토큰 비용 ~90% 절감. 이 설계 여부가 에이전트 원가를 5~10배 가른다.
- **무거운 생성은 사용자 키로 위임**: 대본 생성/재생성 같은 대량 출력 작업은 에이전트가 직접 쓰지 않고 `revise_script` 툴이 사용자 OpenAI 키로 실행 — 에이전트는 오케스트레이션만(출력 토큰 최소).
- **플랜별 월 채팅 한도**: 기본 300턴/월, 자동화 600턴/월 수준. 렌더 한도와 같은 원리 — 원가가 나가는 자원은 전부 한도를 갖는다.
- **원가 추정** (Claude Sonnet 5 기준 $3/$15 per MTok, 캐싱 적용 시): 턴당 입력 ~8k tok(대부분 캐시 리드) + 출력 ~800 tok ≈ **턴당 $0.015** → 월 200턴 활성 사용자당 **월 $2~3**. Opus 5($5/$25)로 올리면 ~$5. 구독가 $19~29 대비 원가율 10~15% — 감당 가능하지만 한도 없이는 위험.

## 4. 아키텍처

> 원칙: R2와 Supabase는 대체재가 아니다 — **R2 = 파일(영상·오디오·이미지), Supabase = 회원 DB + 로그인.** 둘 다 쓴다.

```
[사용자 브라우저]
      │ HTTPS (Cloudflare DNS/CDN)
      ▼
[Next.js @ Vercel] ──────────── 로그인 검증 ──▶ [Supabase Auth]
  · 위저드/채팅/보관함 UI
  · API routes: 채널 CRUD, 잡 생성,
    에이전트 루프(Claude+툴, SSE 스트리밍),
    키 등록(암호화 후 저장)
      │ SQL (RLS)
      ▼
[Supabase Postgres]  users · user_keys(암호화) · channels · jobs · usage
      ▲ 폴링 (FOR UPDATE SKIP LOCKED)
      │
[렌더 워커 = 기존 상시 구동 머신]  ← 마스터키로 사용자 키 복호화
  기존 파이프라인: script → tts → image → render
      │ S3 API (src/publish/storage.ts 그대로)
      ▼
[Cloudflare R2]  mp4 · 오디오 · 이미지 (30일 수명, presigned 다운로드)
```

### 선택 이유

- **Vercel (Next.js)**: 배포 = git push. 솔로+본업 조건에서 인프라에 시간 쓰지 않기. 에이전트 루프의 SSE 스트리밍 지원. 무료 시작.
- **Supabase**: Auth(이메일/구글 로그인) + Postgres + 행 단위 보안(RLS)을 한 번에, 무료로. 대안(Clerk+Neon = 벤더 증가, NextAuth 자작 = 시간, 렌더 서버에 Postgres 자가 운영 = 백업·보안 부담) 대비 솔로 개발 속도 최적. 그냥 Postgres라 락인 약함 — 규모 커지면 이전 가능.
- **R2 (Supabase Storage 아님)**: 영상 다운로드 서비스는 **전송량이 원가**다. Supabase Storage는 egress 과금, R2는 egress 0원. 게다가 기존 `storage.ts`가 이미 S3 API로 R2에 붙는다 — 코드 변경 없음.
- **렌더 워커**: 기존 `src/pipeline/*`를 감싼 단일 Node 상주 프로세스. jobs 테이블 폴링(SKIP LOCKED)이 곧 큐 — 별도 큐 서비스(SQS/CF Queues) MVP 불필요. 동시 렌더 1~2개(메모리 한도). **MVP는 지금 프로덕션 채널 돌리는 상시 구동 머신에서 그대로(클라우드 비용 0)** → 밀리기 시작하면 Cloud Run Jobs(렌더당 과금, 유휴 0원, 숏폼 1편 몇십 원) 또는 GCE VM으로 이전. 폴링 구조라 이전해도 코드 동일.
- **키 보관**: 사용자 API 키는 앱 레벨 AES-256-GCM 암호화로 Postgres 저장, 마스터 키는 API 서버·워커 환경변수에만 존재, 복호화는 사용 시점에만. 로그에 키 절대 미출력.
- **진행 상태 전달**: MVP는 3초 폴링으로 충분 (SSE는 채팅에만).
- Remotion 라이선스: 3인 이하 회사 무료 범위 — 성장 시 재확인.

### 결제

> 원칙: **MVP는 호스티드 체크아웃 링크(Payment Link) 방식** — 결제 페이지·카드 등록·변경·해지 UI를 전부 PG가 호스팅하고, 우리는 "구독하기" 버튼에 링크를 걸고 웹훅으로 플랜 상태만 동기화한다. 결제 UI를 직접 만들지 않는다.

- **PG 우선순위**:
  1. **Lemon Squeezy 또는 Paddle** — 호스티드 체크아웃 링크 + 구독 관리 고객 포털 + Merchant of Record(부가세·해외 세금 대행). 한국 판매자 가입 가능. 솔로 SaaS 기본값. (Stripe Payment Links가 원조지만 Stripe는 한국 사업자 직접 온보딩 불가 — 해외 법인 있을 때만.)
  2. **국내 고객 비중이 높으면 스텝페이(Steppay) 등 국내 구독결제 서비스 병행** — 같은 링크+호스티드 방식을 원화·국내 카드로. 한국 카드의 해외(달러) 결제 거부/기피 대응.
  3. 토스페이먼츠 직접 연동(빌링키 발급 + 매월 우리 쪽 cron이 결제 트리거)은 구현량이 가장 크므로 **규모가 커진 뒤의 최적화**로 미룬다.
- **카드 정보는 우리가 절대 만지지 않는다**: 전부 PG 호스팅 페이지에서 처리, 우리는 customer/subscription 참조 ID만 저장 (PCI 범위 밖 유지).
- **상태의 진실은 웹훅**: 결제 성공/실패/해지는 PG 웹훅 → Next API 웹훅 엔드포인트 → `subscriptions` 갱신 → `users.plan` 반영. 웹훅은 **서명 검증 + 멱등 처리**(`payment_events`에 event_id 기록, 중복 무시) 필수. 체크아웃 링크에 user_id를 custom 파라미터로 실어 보내 웹훅에서 매칭한다.
- **실패 처리(dunning)**: Lemon Squeezy/Paddle은 재시도·독촉 메일까지 PG가 처리 — 우리는 최종 `subscription_expired` 류 웹훅에서 무료 플랜 다운그레이드(데이터 보존, 렌더만 잠금)만 하면 된다.
- **쿼터 리셋**: 결제 주기 웹훅(`subscription_payment_success`) 기준으로 `renders_used_month` 리셋.
- **결제 수수료도 원가**: MoR ~5%+$0.50, 국내 PG ~3% — 가격 책정에 반영.
- MVP 순서상 결제는 M5 — 클로즈드 베타 동안은 무결제 수동 온보딩으로 충분하며, 그동안 `subscriptions` 테이블만 미리 두고 수동으로 상태를 넣는다(코드 경로는 동일하게).

### 비용 전망

| 단계 | 월 비용 |
|---|---|
| 베타 (Vercel Hobby + Supabase Free + R2 + 자체 머신 렌더, 무결제) | ~0원 |
| 유료 ~100명 인프라 (Vercel Pro $20 + Supabase Pro $25 + R2 수 $ + Cloud Run 렌더 $10~30) | ~$60~80 |
| 유료 ~100명 에이전트 API (활성 60% × 월 $2~3, 캐싱·한도 적용 전제) | ~$100~180 |
| 결제 수수료 | 매출의 3~5% |

→ 유료 100명 × $24 평균 = 월 매출 ~$2,400 기준 총원가 ~$350±, **매출총이익률 ~85%**. 에이전트 한도·캐싱 설계가 무너지면 이 마진이 가장 먼저 깎인다.

## 5. 데이터 모델 (핵심 테이블)

```
users        id, email, plan, renders_used_month, month_reset_at
user_keys    id, user_id, provider(openai|elevenlabs), key_encrypted, validated_at, last_error
channels     id, user_id, config JSONB(=channels/*.json 스키마), created_at, archived
jobs         id, user_id, channel_id, kind(short), topic, status(JobStatus 그대로),
             script JSONB, audio JSONB, video_url, error, created_at, updated_at
chat_threads id, user_id, channel_id, messages JSONB (or 별도 messages 테이블)
usage_events id, user_id, type(render|chat), job_id, tokens, at   -- 정산·어뷰즈 추적
subscriptions id, user_id, plan, status(active|past_due|canceled), pg(lemonsqueezy|paddle|steppay),
             pg_customer_ref, pg_subscription_ref, current_period_end, created_at
payment_events id, pg_event_id UNIQUE, user_id, type, payload JSONB, at  -- 웹훅 멱등 로그
```

`jobs.status`는 기존 `JobStatus`(`pending→scripted→voiced→rendered / failed`)를 그대로 사용 — 파이프라인 코드 수정 최소화. Phase 2에서 `uploaded/published` 상태와 `connections` 테이블(OAuth 토큰) 추가.

## 6. 기존 코드 재사용 맵

| 기존 | MVP에서 | 변경 |
|---|---|---|
| `src/pipeline/script.ts, tts.ts, image.ts, render.ts` | 워커 코어 | 키·경로를 인자 주입으로 (env 전역 → per-job context) |
| `src/store.ts` (파일 잡 스토어) | DB 스토어로 교체 | 동일 인터페이스 유지 (`load/save/list`) |
| `src/channel.ts` + `remotion/schema.ts` | config 검증 (에이전트 툴·패널 공용) | 그대로 |
| `remotion/*` (컴포지션) | 그대로 | 없음 |
| `src/cli.ts doctor` | 키 검증 API | 웹 응답 포맷으로 |
| `scripts/make-bgm.mjs` | BGM 프리셋 5~6종 사전 생성 → 선택지 | 사전 실행만 |
| `.claude/skills/new-channel` | 에이전트 시스템 프롬프트 | 이식 |
| `src/collect/*` (RSS·주제선정) | "주제 추천" 버튼 (수동 트리거) | Phase 1.5 |
| `src/publish/*`, `verify-publish`, `stats-snapshot`, `weekly` | — | Phase 2 |

## 7. 플랜·쿼터 (초안)

- **무료 체험**: 렌더 3편 (워터마크 or 720p) — 키 등록 완료가 활성화 조건
- **기본 $19~29/월**: 렌더 30편/월, 채널 2개
- **자동화 $49~59/월** (Phase 2): 렌더 60편/월, 연동·예약·검증·통계·주간 롱폼
- 결제: Stripe 또는 토스페이먼츠. **클로즈드 베타 동안은 수동 온보딩(무결제)로 시작해도 됨.**

## 8. 빌드 순서 (본업 병행 기준)

1. **M1 — 코어 이식** (최우선·최대 리스크): Supabase 스키마 + 키 암호화 + 워커(파이프라인 per-user 키 주입) → API로 잡 넣으면 mp4가 R2에 떨어지는 것까지. UI 없이 curl로 검증.
2. **M2 — 보관함**: 잡 목록/진행/다운로드 페이지. (이 시점에 "지인 베타" 가능 — 세팅은 님이 JSON 직접 작성)
3. **M3 — 온보딩 위저드**: 프리셋 칩 + 키 패널 + 검증. **에이전트 없이 폼만으로 먼저** — 구조화 플로우가 서 있어야 에이전트가 얹힌다.
4. **M4 — 에이전트**: 채팅 + 툴 6종 + 사이드 패널 연동.
5. **M5 — 쿼터·결제** → 클로즈드 베타 공개.
6. **Phase 2 — 자동화 플랜**: OAuth 연결 마법사(BYO GCP/Meta 앱, 테스트 모드 7일 토큰 만료 안내 포함), 예약 발행, verify-publish 알림, 자동 편성.

## 9. MVP에서 의도적으로 뺀 것

- 자동 편성/RSS (수동 주제 입력 + 추천 버튼으로 대체)
- 발행 연동 일체 (Phase 2)
- 주간 롱폼·카드뉴스 (Phase 2 프리미엄 재료)
- 템플릿/테마 마켓, 팀 기능, 다국어 UI
- 실시간 협업 편집 — 채팅 수정 + 재렌더로 충분

---

## 수익화·온보딩 정책 v2 (2026-08-28 결정)

경쟁 서비스(Mirr/미리내 AI) 분석에서 차용. 근거: 워터마크 무료 플랜 = 결과물 자체가 광고(바이럴 루프), 크레딧 충전 = 소진 시 이탈 대신 추가 매출.

### 워터마크
- **무료 플랜**: 모든 렌더에 "⚡ made with Autopilot" 워터마크 (우하단, `serviceWatermark` prop)
- **제거 과금**: 렌더당 +5크레딧 (기본 10 + 5 = 15). 에디터 렌더 버튼 위 체크박스
- **구독 중**: 항상 자동 제거 (`profiles.plan !== 'free'` — 워커가 판단, 소스 오브 트루스는 DB 플랜)

### 크레딧 충전 (결제 연동 시 활성화)
- 100cr ₩4,900 / 300cr ₩12,900 / 1,000cr ₩39,000
- 구독과 별개의 일회성 충전. 설정 페이지에 UI 스텁 반영됨 ("충전 준비 중")

### 스타일 학습 온보딩
- 사용자가 기존 채널 썸네일·게시물 1~3장 업로드 → `/api/style-learn` (gpt-4o-mini 비전, 사용자 키)
- 추출: `{bg, accent, mood, artDirection}` → `channels.config.styleProfile` 저장
- 에디터: 색상 톤 피커에 "🎨 내 브랜드" 스와치, 아트 스타일에 "내 브랜드" 옵션(artStyle='brand')
- 워커: artStyle='brand' → styleProfile.artDirection 을 생성 프롬프트로 사용
- artDirection 은 스타일 특성만 추출(구체 사물·구도 금지) — 배경 다양성 유지 원칙 준수
