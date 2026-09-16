#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/srv/projects/frau-liu-learn-german"
BACKEND_SERVICE="${BACKEND_SERVICE:-frau-liu}"
PAYMENT_RECONCILE_SERVICE="frau-liu-alipay-reconcile.service"
PAYMENT_RECONCILE_TIMER="frau-liu-alipay-reconcile.timer"

restart_required_service() {
    local service_name="$1"
    local service_label="$2"

    if ! sudo systemctl cat "$service_name" >/dev/null 2>&1; then
        echo "❌ ${service_label} service not found: ${service_name}"
        echo "   Set the correct systemd unit name with the matching environment variable."
        exit 1
    fi

    echo "🔄 Restart ${service_label}: ${service_name}"
    sudo systemctl restart "$service_name"
    sudo systemctl is-active --quiet "$service_name"
}

echo "▶️ Deploy backend started..."

cd "$PROJECT_ROOT"

echo "📦 Pull latest code..."
git pull

echo "📦 Sync Python dependencies..."
uv sync

echo "🧪 Run Django checks..."
uv run python manage.py check

echo "🔐 Validate Alipay notify URL..."
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

echo "🗄️  Apply database migrations..."
uv run python manage.py migrate --noinput

restart_required_service "$BACKEND_SERVICE" "gunicorn"

echo "⏱️  Install and restart Alipay reconciliation timer..."
sudo install -m 0644 \
    "$PROJECT_ROOT/deploy/systemd/frau-liu-alipay-reconcile.service" \
    /etc/systemd/system/frau-liu-alipay-reconcile.service
sudo install -m 0644 \
    "$PROJECT_ROOT/deploy/systemd/frau-liu-alipay-reconcile.timer" \
    "/etc/systemd/system/$PAYMENT_RECONCILE_TIMER"
sudo systemctl daemon-reload
sudo systemctl enable --now "$PAYMENT_RECONCILE_TIMER"
sudo systemctl restart "$PAYMENT_RECONCILE_TIMER"
sudo systemctl is-active --quiet "$PAYMENT_RECONCILE_TIMER"

echo "🔎 Reconcile pending Alipay payments once..."
sudo systemctl start "$PAYMENT_RECONCILE_SERVICE"

echo "✅ Backend deploy finished successfully"
