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
- `frontend/public/` only: synchronize changed public files
- other `frontend/` files: build the frontend
- ordinary `apps/`, `config/`, or `manage.py` changes: validate Django and
  gracefully reload Gunicorn workers
- migrations, `pyproject.toml`, `uv.lock`, `.python-version`, `deploy/`, or core deployment
  scripts: complete backend deployment and restart

The classifier is intentionally conservative. A hotfix flag never overrides a
full-deployment requirement.

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
