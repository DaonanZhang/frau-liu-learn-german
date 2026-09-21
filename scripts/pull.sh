#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/srv/projects/frau-liu-learn-german"
STATE_DIR="$PROJECT_DIR/.deploy"
STATE_FILE="$STATE_DIR/last_successful_commit"
MODE="auto" # auto | hotfix | full
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: bash scripts/pull.sh [--mode auto|hotfix|full] [--dry-run]

Modes:
  auto     Classify changed files and choose the smallest safe deployment.
  hotfix   Allow only changes that do not require migrations, dependency sync,
           or infrastructure installation. Refuse unsafe changes.
  full     Force the complete backend and frontend deployment.

Options:
  --dry-run  Fetch and print the deployment plan without changing the checkout.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
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

if [[ "$MODE" != "auto" && "$MODE" != "hotfix" && "$MODE" != "full" ]]; then
  echo "Invalid mode: $MODE"
  usage
  exit 1
fi

cd "$PROJECT_DIR"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Tracked files have local changes. Refusing to deploy over them."
  git status --short --untracked-files=no
  exit 1
fi

CURRENT_HEAD="$(git rev-parse HEAD)"
BASE_REF="$CURRENT_HEAD"
if [[ -f "$STATE_FILE" ]]; then
  saved_ref="$(tr -d '[:space:]' < "$STATE_FILE")"
  if git cat-file -e "${saved_ref}^{commit}" 2>/dev/null; then
    BASE_REF="$saved_ref"
  fi
fi

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}')"
echo "▶ Fetch $UPSTREAM"
git fetch --prune
TARGET_REF="$(git rev-parse '@{upstream}')"

if ! git merge-base --is-ancestor "$CURRENT_HEAD" "$TARGET_REF"; then
  echo "The remote branch is not a fast-forward of the current checkout."
  exit 1
fi

if ! git merge-base --is-ancestor "$BASE_REF" "$TARGET_REF"; then
  echo "The last successful deployment is not an ancestor of the target commit."
  echo "Resolve the deployment state manually before continuing."
  exit 1
fi

CHANGED_FILES="$(git diff --name-only "$BASE_REF" "$TARGET_REF")"

if [[ -z "$CHANGED_FILES" && "$MODE" != "full" ]]; then
  echo "ℹ No undeployed changes."
  exit 0
fi

matches_changed() {
  local pattern="$1"
  grep -Eq "$pattern" <<<"$CHANGED_FILES"
}

frontend_changed=false
frontend_public_only=false
backend_changed=false
dependency_changed=false
migration_changed=false
infrastructure_changed=false

if matches_changed '^frontend/'; then
  frontend_changed=true
  if ! grep -Ev '^frontend/public/' <<<"$CHANGED_FILES" | grep -q '^frontend/'; then
    frontend_public_only=true
  fi
fi

if matches_changed '^(apps/|config/|manage\.py$)'; then
  backend_changed=true
fi
if matches_changed '^(pyproject\.toml|uv\.lock|\.python-version)$'; then
  dependency_changed=true
fi
if matches_changed '^apps/[^/]+/migrations/.*\.py$'; then
  migration_changed=true
fi
if matches_changed '^(deploy/|scripts/(pull|deploy_backend|deploy_frontend|pull_frontend)\.sh$)'; then
  infrastructure_changed=true
fi

requires_full=false
if [[ "$dependency_changed" == true || "$migration_changed" == true || "$infrastructure_changed" == true ]]; then
  requires_full=true
fi

backend_action="none"
frontend_action="none"

if [[ "$MODE" == "full" ]]; then
  backend_action="full"
  frontend_action="build"
else
  if [[ "$MODE" == "hotfix" && "$requires_full" == true ]]; then
    echo "Hotfix refused: this change includes dependencies, migrations, or deployment infrastructure."
    echo "$CHANGED_FILES"
    exit 1
  fi

  if [[ "$requires_full" == true ]]; then
    backend_action="full"
  elif [[ "$backend_changed" == true ]]; then
    backend_action="hotfix"
  fi

  if [[ "$frontend_changed" == true ]]; then
    if [[ "$frontend_public_only" == true ]]; then
      frontend_action="sync-public"
    else
      frontend_action="build"
    fi
  fi
fi

echo "=============================="
echo " Deployment plan"
echo "=============================="
echo "From:     $BASE_REF"
echo "To:       $TARGET_REF"
echo "Mode:     $MODE"
echo "Backend:  $backend_action"
echo "Frontend: $frontend_action"
echo "Changed files:"
if [[ -n "$CHANGED_FILES" ]]; then
  sed 's/^/  - /' <<<"$CHANGED_FILES"
else
  echo "  - none; full deployment was explicitly requested"
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "✅ Dry run finished; checkout was not changed."
  exit 0
fi

echo "▶ Fast-forward checkout to $TARGET_REF"
git merge --ff-only "$TARGET_REF"

case "$backend_action" in
  full)
    bash "$PROJECT_DIR/scripts/deploy_backend.sh" --mode full
    ;;
  hotfix)
    bash "$PROJECT_DIR/scripts/deploy_backend.sh" --mode hotfix
    ;;
esac

case "$frontend_action" in
  build)
    bash "$PROJECT_DIR/scripts/pull_frontend.sh" \
      --mode build --from-ref "$BASE_REF" --to-ref "$TARGET_REF"
    ;;
  sync-public)
    bash "$PROJECT_DIR/scripts/pull_frontend.sh" \
      --mode sync-public --from-ref "$BASE_REF" --to-ref "$TARGET_REF"
    ;;
esac

mkdir -p "$STATE_DIR"
printf '%s\n' "$TARGET_REF" > "$STATE_FILE"

echo "✅ Deploy finished successfully"
