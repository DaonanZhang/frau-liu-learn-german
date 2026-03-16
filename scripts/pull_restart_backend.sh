#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/srv/projects/frau-liu-learn-german}"
SERVICE_NAME="${2:-frau-liu}"

echo "=============================="
echo " Pull + Restart Backend Only  "
echo "=============================="
echo "Project: ${PROJECT_DIR}"
echo "Service: ${SERVICE_NAME}"

cd "${PROJECT_DIR}"

echo ""
echo "▶ Step 1: git pull"
git pull

echo ""
echo "▶ Step 2: restart backend service"
sudo systemctl restart "${SERVICE_NAME}"

echo ""
echo "▶ Step 3: service status"
sudo systemctl is-active "${SERVICE_NAME}"

echo ""
echo "✅ Done"
