#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/srv/projects/frau-liu-learn-german"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

MODE="auto" # auto | build | sync-public | no-build

usage() {
  cat <<'EOF'
Usage: bash scripts/pull_frontend.sh [--mode auto|build|sync-public|no-build]

Modes:
  auto         Default. Decide automatically:
               - only frontend/public changed -> sync changed public files to dist (no build)
               - frontend/src or config changed -> full build
               - no frontend changes -> skip frontend deploy
  build        Force full frontend build.
  sync-public  Force "only sync frontend/public changed files" (requires existing dist).
  no-build     Never run build. If only public changed, sync them; otherwise skip.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "auto" && "$MODE" != "build" && "$MODE" != "sync-public" && "$MODE" != "no-build" ]]; then
  echo "Invalid mode: $MODE"
  usage
  exit 1
fi

cd "$PROJECT_ROOT"

echo "▶ Frontend pull mode: $MODE"

OLD_HEAD="$(git rev-parse HEAD)"
echo "▶ git pull"
git pull
NEW_HEAD="$(git rev-parse HEAD)"

if [[ "$OLD_HEAD" == "$NEW_HEAD" ]]; then
  echo "ℹ No new commits."
fi

CHANGED_FRONTEND="$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD" -- frontend || true)"
CHANGED_PUBLIC="$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD" -- frontend/public || true)"

has_frontend_changes=false
if [[ -n "$CHANGED_FRONTEND" ]]; then
  has_frontend_changes=true
fi

only_public_changes=false
if [[ -n "$CHANGED_FRONTEND" ]] && ! echo "$CHANGED_FRONTEND" | rg -qv "^frontend/public/" ; then
  only_public_changes=true
fi

needs_full_build=false
if [[ -n "$CHANGED_FRONTEND" ]]; then
  if echo "$CHANGED_FRONTEND" | rg -q "^frontend/src/|^frontend/index\\.html$|^frontend/package(-lock)?\\.json$|^frontend/vite\\.config\\.|^frontend/tsconfig|^frontend/jsconfig\\.json$|^frontend/\\.env"; then
    needs_full_build=true
  fi
fi

sync_public_changes() {
  if [[ ! -d "$DIST_DIR" ]]; then
    echo "⚠ dist not found, cannot sync public-only changes. Fallback to full build."
    return 1
  fi

  echo "▶ Sync changed frontend/public files to dist (no build)"
  # Use name-status to handle add/modify/delete/rename.
  while IFS=$'\t' read -r status p1 p2; do
    [[ -z "${status:-}" ]] && continue
    case "$status" in
      D)
        target="$DIST_DIR/${p1#frontend/public/}"
        rm -f "$target"
        echo "  [DELETE] $target"
        ;;
      R*)
        old_target="$DIST_DIR/${p1#frontend/public/}"
        new_src="$PROJECT_ROOT/$p2"
        new_target="$DIST_DIR/${p2#frontend/public/}"
        rm -f "$old_target"
        mkdir -p "$(dirname "$new_target")"
        cp -f "$new_src" "$new_target"
        echo "  [RENAME] $old_target -> $new_target"
        ;;
      *)
        src="$PROJECT_ROOT/$p1"
        target="$DIST_DIR/${p1#frontend/public/}"
        mkdir -p "$(dirname "$target")"
        cp -f "$src" "$target"
        echo "  [SYNC] $target"
        ;;
    esac
  done < <(git diff --name-status "$OLD_HEAD" "$NEW_HEAD" -- frontend/public || true)

  echo "▶ Reload nginx"
  sudo systemctl reload nginx
  return 0
}

full_build() {
  echo "▶ Full frontend build"
  cd "$FRONTEND_DIR"

  if [[ ! -d node_modules ]] || echo "$CHANGED_FRONTEND" | rg -q "^frontend/package(-lock)?\\.json$"; then
    echo "  - npm ci"
    npm ci
  else
    echo "  - skip npm ci (node_modules exists, package files unchanged)"
  fi

  echo "  - npm run build"
  npm run build

  if [[ ! -d "$DIST_DIR" ]]; then
    echo "❌ Build failed: dist/ not found"
    exit 1
  fi

  echo "▶ Reload nginx"
  sudo systemctl reload nginx
}

case "$MODE" in
  build)
    full_build
    ;;
  sync-public)
    if [[ -z "$CHANGED_PUBLIC" ]]; then
      echo "ℹ No frontend/public changes to sync."
      exit 0
    fi
    sync_public_changes || full_build
    ;;
  no-build)
    if [[ "$only_public_changes" == true && -n "$CHANGED_PUBLIC" ]]; then
      sync_public_changes || true
    else
      if [[ "$has_frontend_changes" == true ]]; then
        echo "ℹ Frontend code changed, but mode=no-build, skipped build."
      else
        echo "ℹ No frontend changes."
      fi
    fi
    ;;
  auto)
    if [[ "$has_frontend_changes" == false ]]; then
      echo "ℹ No frontend changes detected."
      exit 0
    fi
    if [[ "$only_public_changes" == true ]]; then
      sync_public_changes || full_build
      exit 0
    fi
    if [[ "$needs_full_build" == true ]]; then
      full_build
    else
      # Safe fallback: any non-public frontend change triggers full build.
      full_build
    fi
    ;;
esac

echo "✅ pull_frontend finished"
