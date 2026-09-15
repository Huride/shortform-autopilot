#!/usr/bin/env bash
# GCE(Ubuntu 24.04) 렌더 워커 셋업 — 한 번 실행. 멱등.
# 사용: sudo bash deploy/gce-setup.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Remotion(Chromium headless shell) 런타임 의존성 + ffmpeg + 한글 폰트 + git
apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg unzip python3 \
  ffmpeg fonts-noto-cjk fonts-noto-color-emoji \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 \
  libpango-1.0-0 libcairo2 libx11-xcb1 libxcb-dri3-0 libxshmfence1 libglu1-mesa

# Node 20 (NodeSource)
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
corepack enable || true
corepack prepare pnpm@latest --activate || npm i -g pnpm

# 워커는 로그인 사용자(SUDO_USER)로 돈다 — VM 의 ssh 배포 키가 그 계정에 있다.
WUSER="${SUDO_USER:-$(whoami)}"
WHOME=$(getent passwd "$WUSER" | cut -d: -f6)

# 저장소 (비공개 → ssh 배포 키)
sudo -u "$WUSER" bash -c '
  ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
  cd ~ && if [ ! -d shortform-autopilot ]; then git clone git@github.com:Huride/shortform-autopilot.git; fi
  cd shortform-autopilot && git pull --ff-only && pnpm install --frozen-lockfile
  # Remotion 브라우저 사전 다운로드 (첫 렌더 지연 방지)
  NODE_OPTIONS= npx remotion browser ensure || true
'
fc-cache -f >/dev/null || true

# systemd 유닛 (User/경로를 실제 계정으로 치환)
sed "s#/home/worker#$WHOME#g; s#^User=.*#User=$WUSER#" \
  "$WHOME/shortform-autopilot/deploy/autopilot-worker.service" > /etc/systemd/system/autopilot-worker.service
systemctl daemon-reload
systemctl enable autopilot-worker
echo "setup done — .env 를 $WHOME/shortform-autopilot/.env 에 넣고: sudo systemctl start autopilot-worker"
