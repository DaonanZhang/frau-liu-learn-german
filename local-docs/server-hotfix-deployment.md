# Server Hotfix Deployment

The production deployment entry point is:

```bash
bash scripts/pull.sh --mode auto
```

The script fetches once, compares the target commit with the last successfully
deployed commit, prints the plan, fast-forwards the checkout, and records the
new successful commit only after every selected deployment step passes.

## Modes

Preview without changing the checkout:

```bash
bash scripts/pull.sh --mode auto --dry-run
```

Automatically choose the smallest safe deployment:

```bash
bash scripts/pull.sh --mode auto
```

Require hotfix eligibility and stop if the change contains migrations,
dependencies, or deployment infrastructure:

```bash
bash scripts/pull.sh --mode hotfix
```

Force a complete backend restart and frontend build:

```bash
bash scripts/pull.sh --mode full
```

## Classification

- documentation and tests: no runtime action
- `frontend/public/` only: synchronize changed public files, except resources
- other `frontend/` files: build the frontend
- ordinary `apps/`, `config/`, or `manage.py` changes: validate Django and
  gracefully reload Gunicorn workers
- migrations, `pyproject.toml`, `uv.lock`, `.python-version`, `deploy/`, or core deployment
  scripts: complete backend deployment and restart

The classifier is intentionally conservative. A hotfix flag never overrides a
full-deployment requirement.

## Runtime Resource Isolation

`frontend/public/resources/` is runtime media and is never deployed by the
frontend build. The frontend deployment:

- disables Vite's automatic copying of the complete `public` directory
- copies ordinary public files while excluding `public/resources/`
- updates `frontend/dist/` while preserving the existing `dist/resources/`
- refuses a deployment whose Git diff contains `frontend/public/resources/`

Use the dedicated media and COS workflows for runtime resources. Do not use
`pull.sh`, `pull_frontend.sh`, or `deploy_frontend.sh` to update them.

Local server changes below `frontend/public/images/` or
`frontend/public/manual/` stop the first deployment attempt. After reviewing
the reported paths, explicitly prefer the Git versions with:

```bash
bash scripts/pull.sh --mode auto --overwrite-public-conflicts
```

Before overwriting, the script saves the local versions to Git stash. Runtime
resources remain protected even when this flag is present.

`frontend/public/images/wechat-qr.png` is server-managed and Git-ignored. All
frontend deployment modes skip it and preserve the existing
`frontend/dist/images/wechat-qr.png`. When intentionally changing the QR code,
update the server source file and explicitly publish it:

```bash
install -m 0644 \
  frontend/public/images/wechat-qr.png \
  frontend/dist/images/wechat-qr.png
```

This QR update is deliberately separate from code deployment.

## First Rollout

The old server unit starts Gunicorn through `uv run` and has no `ExecReload`.
After the commit containing the new deployment files is available, perform one
complete deployment:

```bash
cd /srv/projects/frau-liu-learn-german
git pull --ff-only
bash scripts/pull.sh --mode full
```

This installs `deploy/systemd/frau-liu.service`, whose main process is the
project virtual environment's Gunicorn executable and whose `ExecReload` sends
`HUP` to the Gunicorn master. This first rollout intentionally restarts the
backend once.

Verify it:

```bash
sudo systemctl show frau-liu -p MainPID -p ExecStart -p ExecReload -p CanReload
sudo systemctl status frau-liu --no-pager
```

Expected properties include `.venv/bin/gunicorn`, a non-empty `ExecReload`,
and `CanReload=yes`. Subsequent eligible backend hotfixes use
`systemctl reload frau-liu` so new workers start before old workers exit.

## Deployment State

The last successful commit is stored in the ignored file:

```text
/srv/projects/frau-liu-learn-german/.deploy/last_successful_commit
```

This allows the next run to retry all undeployed changes when code was fetched
successfully but a build, migration, reload, or health check failed.

The backend health check connects directly to Gunicorn on `127.0.0.1:8000`
and uses `127.0.0.1` as the default HTTP Host. Production must therefore keep
`127.0.0.1` in `DJANGO_ALLOWED_HOSTS`. A different valid host can be supplied
with `BACKEND_HEALTHCHECK_HOST`.
