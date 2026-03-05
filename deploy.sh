#!/usr/bin/env bash
set -euo pipefail

# Deploy warmteverlies to Hetzner server
# Usage: ./deploy.sh [user@host]
#
# First deploy: also copy .env.production to the server:
#   scp .env.production root@46.224.215.142:/opt/warmteverlies/.env.production

SERVER="${1:-root@46.224.215.142}"
REMOTE_DIR="/opt/warmteverlies"
REPO="https://github.com/OpenAEC-Foundation/warmteverliesberekening.git"
BRANCH="master"

echo "==> Deploying warmteverlies from ${BRANCH}"

ssh "${SERVER}" bash -s <<SCRIPT
set -euo pipefail

# Clone or pull
if [ -d "${REMOTE_DIR}/.git" ]; then
    cd "${REMOTE_DIR}"
    git fetch origin
    git reset --hard "origin/${BRANCH}"
else
    git clone --branch "${BRANCH}" "${REPO}" "${REMOTE_DIR}"
    cd "${REMOTE_DIR}"
fi

# Build and restart
docker compose build
docker compose up -d

# Health check
echo "Waiting for container..."
sleep 5
docker exec warmteverlies curl -sf http://localhost:3001/api/v1/health && echo " OK" || echo " FAILED"
SCRIPT

echo "==> Done"
