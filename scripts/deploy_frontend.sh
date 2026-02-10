#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/srv/projects/frau-liu-learn-german"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BUILD_DIR="$FRONTEND_DIR/dist"

echo "▶️ Deploy frontend started..."

cd "$PROJECT_ROOT"

echo "📦 Pull latest code..."
git pull

cd "$FRONTEND_DIR"

echo "📦 Install frontend dependencies..."
npm ci

echo "🏗️  Build frontend..."
npm run build

if [ ! -d "$BUILD_DIR" ]; then
  echo "❌ Build failed: dist/ directory not found"
  exit 1
fi

echo "🔄 Reload nginx..."
sudo systemctl reload nginx

echo "✅ Frontend deploy finished successfully"
