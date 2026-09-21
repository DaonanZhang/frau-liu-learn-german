#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/srv/projects/frau-liu-learn-german"

# Keep this legacy entry point resource-safe by delegating to the canonical
# frontend deployment script. pull_frontend.sh excludes public/resources.
exec bash "$PROJECT_ROOT/scripts/pull_frontend.sh" --mode build "$@"
