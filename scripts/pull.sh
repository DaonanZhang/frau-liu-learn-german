#!/usr/bin/env bash
set -e

echo "=============================="
echo " Frau Liu Learn German Deploy "
echo "=============================="

PROJECT_DIR="/srv/projects/frau-liu-learn-german"

echo ""
echo "▶ Step 1: git pull"
cd "$PROJECT_DIR"
git pull

echo ""
echo "▶ Step 2: deploy backend (Django)"
if [ -f "./deploy_backend.sh" ]; then
  ./deploy_backend.sh
else
  echo "⚠ deploy_backend.sh not found, restarting service directly"
  sudo systemctl restart frau-liu
fi

echo ""
echo "▶ Step 3: deploy frontend (React)"
if [ -f "./deploy_frontend.sh" ]; then
  ./deploy_frontend.sh
else
  echo "⚠ deploy_frontend.sh not found, skipping frontend deploy"
fi

echo ""
echo "✅ Deploy finished successfully"
