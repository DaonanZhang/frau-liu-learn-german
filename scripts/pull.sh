#!/usr/bin/env bash
set -euo pipefail

echo "=============================="
echo " Frau Liu Learn German Deploy "
echo "=============================="

PROJECT_DIR="/srv/projects/frau-liu-learn-german"

cd "$PROJECT_DIR"

echo ""
echo "▶ Step 1: git pull"
git pull

echo ""
echo "▶ Step 2: check Django migrations"

# 2.1 Check if there are model changes without migrations
echo "  - checking for model changes without migrations"
if uv run python manage.py makemigrations --check --dry-run; then
  echo "  ✓ no missing migrations"
else
  echo ""
  echo "❌ ERROR: There are model changes without migrations."
  echo "👉 Please run 'makemigrations' locally and commit them."
  exit 1
fi

# 2.2 Show migration plan
echo ""
echo "  - migration plan"
uv run python manage.py migrate --plan

# 2.3 Apply migrations
echo ""
echo "  - applying migrations"
uv run python manage.py migrate

echo ""
echo "▶ Step 3: deploy backend (Django)"
if [ -f "./scripts/deploy_backend.sh" ]; then
  bash ./scripts/deploy_backend.sh
else
  echo "⚠ scripts/deploy_backend.sh not found, restarting service directly"
  sudo systemctl restart frau-liu
fi

echo ""
echo "▶ Step 4: deploy frontend (React)"
if [ -f "./scripts/deploy_frontend.sh" ]; then
  bash ./scripts/deploy_frontend.sh
else
  echo "⚠ scripts/deploy_frontend.sh not found, skipping frontend deploy"
fi

echo ""
echo "✅ Deploy finished successfully"