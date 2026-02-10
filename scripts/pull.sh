#!/usr/bin/env bash
set -e

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

# 2.1 检查是否有未生成的 migration
echo "  - checking for model changes without migrations"
if uv run python manage.py makemigrations --check --dry-run; then
  echo "  ✓ no missing migrations"
else
  echo ""
  echo "❌ ERROR: There are model changes without migrations."
  echo "👉 Please run 'makemigrations' locally and commit them."
  exit 1
fi

# 2.2 显示 migrate 计划（仅提示）
echo ""
echo "  - migration plan"
uv run python manage.py migrate --plan

# 2.3 执行 migrate
echo ""
echo "  - applying migrations"
uv run python manage.py migrate

echo ""
echo "▶ Step 3: deploy backend (Django)"
if [ -f "./deploy_backend.sh" ]; then
  ./deploy_backend.sh
else
  echo "⚠ deploy_backend.sh not found, restarting service directly"
  sudo systemctl restart frau-liu
fi

echo ""
echo "▶ Step 4: deploy frontend (React)"
if [ -f "./deploy_frontend.sh" ]; then
  ./deploy_frontend.sh
else
  echo "⚠ deploy_frontend.sh not found, skipping frontend deploy"
fi

echo ""
echo "✅ Deploy finished successfully"
