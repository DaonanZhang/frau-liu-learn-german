#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/srv/projects/frau-liu-learn-german"
BACKEND_SERVICE="${BACKEND_SERVICE:-frau-liu}"
PAYMENT_RECONCILE_SERVICE="frau-liu-alipay-reconcile.service"
PAYMENT_RECONCILE_TIMER="frau-liu-alipay-reconcile.timer"
MODE="full" # full | hotfix

usage() {
  cat <<'EOF'
Usage: bash scripts/deploy_backend.sh [--mode full|hotfix]

This script deploys the already checked-out revision. It never runs git pull.

Modes:
  full     Sync dependencies, validate and migrate, install systemd units,
           then restart Gunicorn and the payment timer.
  hotfix   Validate Django and gracefully reload existing Gunicorn workers.
           This requires frau-liu.service to define ExecReload.
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

if [[ "$MODE" != "full" && "$MODE" != "hotfix" ]]; then
  echo "Invalid mode: $MODE"
  usage
  exit 1
fi

cd "$PROJECT_ROOT"

if [[ "$MODE" == "hotfix" ]] && ! sudo systemctl cat "$BACKEND_SERVICE" >/dev/null 2>&1; then
  echo "Backend service not found: $BACKEND_SERVICE"
  exit 1
fi

echo "▶ Backend deploy mode: $MODE"

if [[ "$MODE" == "full" ]]; then
  echo "▶ Sync Python dependencies"
  uv sync --frozen
fi

echo "▶ Run Django checks"
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run

echo "▶ Validate Alipay notify URL"
uv run python manage.py shell -c '
from django.conf import settings

notify_url = settings.ALIPAY_NOTIFY_URL.strip()
expected_path = "/api/accounts/payments/alipay/notify/"
if not notify_url.startswith("https://") or not notify_url.endswith(expected_path):
    raise SystemExit(
        "ALIPAY_NOTIFY_URL must be a public HTTPS URL ending with " + expected_path
    )
print("Alipay notify URL:", notify_url)
'

if [[ "$MODE" == "hotfix" ]]; then
  if [[ "$(sudo systemctl show "$BACKEND_SERVICE" -p CanReload --value)" != "yes" ]]; then
    echo "Service does not support reload. Run a full deployment once to install the versioned unit."
    exit 1
  fi

  echo "▶ Gracefully reload Gunicorn workers"
  sudo systemctl reload "$BACKEND_SERVICE"
else
  echo "▶ Show and apply database migrations"
  uv run python manage.py migrate --plan
  uv run python manage.py migrate --noinput

  echo "▶ Install versioned systemd units"
  sudo install -m 0644 \
    "$PROJECT_ROOT/deploy/systemd/frau-liu.service" \
    /etc/systemd/system/frau-liu.service
  sudo install -m 0644 \
    "$PROJECT_ROOT/deploy/systemd/frau-liu-alipay-reconcile.service" \
    /etc/systemd/system/frau-liu-alipay-reconcile.service
  sudo install -m 0644 \
    "$PROJECT_ROOT/deploy/systemd/frau-liu-alipay-reconcile.timer" \
    "/etc/systemd/system/$PAYMENT_RECONCILE_TIMER"
  sudo systemctl daemon-reload

  echo "▶ Restart Gunicorn"
  sudo systemctl restart "$BACKEND_SERVICE"

  echo "▶ Enable and restart Alipay reconciliation timer"
  sudo systemctl enable --now "$PAYMENT_RECONCILE_TIMER"
  sudo systemctl restart "$PAYMENT_RECONCILE_TIMER"

  echo "▶ Reconcile pending Alipay payments once"
  sudo systemctl start "$PAYMENT_RECONCILE_SERVICE"
fi

sudo systemctl is-active --quiet "$BACKEND_SERVICE"

echo "▶ Check backend HTTP endpoint"
health_host="$(uv run python manage.py shell -c '
from django.conf import settings

host = next((host for host in settings.ALLOWED_HOSTS if host != "*"), "localhost")
print(host.lstrip("."))
')"
health_ok=false
for _ in {1..10}; do
  if curl --fail --silent --show-error \
    --header "Host: $health_host" \
    http://127.0.0.1:8000/api/accounts/public/status/ >/dev/null; then
    health_ok=true
    break
  fi
  sleep 2
done

if [[ "$health_ok" != true ]]; then
  echo "Backend health check failed after deployment."
  exit 1
fi

echo "✅ Backend deploy finished successfully"
