#!/bin/zsh
# 주간 결산 파이프라인 — launchd 가 일요일 17:15 에 호출한다.
# 생성(~15분) + 렌더(~20분, 동시성 1) 후 유튜브 private 업로드가 18시 전후에 끝난다.
# 운영자는 운영 페이지의 "스튜디오에서 공개 전환" 버튼으로 공개한다.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."

LOG="logs/weekly-$(date +%Y%m%d).log"
mkdir -p logs

{
  echo "===== $(date '+%F %T') weekly 시작 ====="
  # 실패 시 launchd 재시도는 없지만, 같은 명령을 수동 재실행하면
  # 저장된 대본·음성으로 렌더부터 이어간다 (weekly.ts 의 재개 경로).
  npx tsx src/cli.ts weekly --channel "${CHANNEL:-example}" --publish
  echo "===== $(date '+%F %T') 완료 ====="
} >> "$LOG" 2>&1
