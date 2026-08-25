#!/bin/zsh
# 일일 파이프라인 — cron/launchd 에서 호출된다.
# cron 은 PATH 가 비어 있으므로 여기서 환경을 스스로 갖춘다.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."

LOG="logs/daily-$(date +%Y%m%d).log"
mkdir -p logs

{
  echo "===== $(date '+%F %T') daily 시작 ====="
  # IG 장기 토큰 갱신 (60일 만료 방지 — 매일 호출해도 무해)
  node scripts/ig-refresh.mjs
  npx tsx src/cli.ts daily --channel "${CHANNEL:-example}"
  J=$(ls -t data/jobs | head -1 | sed "s/.json//")
  echo "target job: $J"
  npx tsx src/cli.ts build "$J"
  # 대상 미지정 = 자격증명 있는 플랫폼 전부 (현재 유튜브 private + 인스타 공개).
  # publishHour(08시) 전이면 publish 가 스스로 건너뛴다 — 여기선 시도만 한다.
  npx tsx src/cli.ts publish "$J"
  echo "===== $(date '+%F %T') 완료 ====="
} >> "$LOG" 2>&1
