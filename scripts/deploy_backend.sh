#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/srv/projects/frau-liu-learn-german"

echo "▶️ Deploy backend started..."

cd "$PROJECT_ROOT"

echo "📦 Pull latest code..."
git pull

echo "📦 Sync Python dependencies..."
uv sync

echo "🧪 Run Django checks..."
uv run python manage.py check

echo "🗄️  Apply database migrations..."
uv run python manage.py migrate --noinput

echo "🔄 Restart gunicorn service..."
sudo systemctl restart frau-liu

echo "✅ Backend deploy finished successfully"
