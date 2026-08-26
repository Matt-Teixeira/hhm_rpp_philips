#!/usr/bin/env bash
# Build for hhm_rpp_philips: deps only. Fleet paradigm
# (data_acquisition/docs/migration_CLAUDE.md Part 1), with one deliberate
# deviation: THIS APP BUILDS NO IMAGE. It runs ge's shared hhm_rpp image
# (see CLAUDE.md "KNOWN WARTS"), so this script:
#
#   1. Creates ./utils/logger/logs as the CALLING user. The gosu entrypoint is
#      baked into ge's image and does NO log-dir repair, so if Docker creates
#      the missing bind source it is root-owned and the first run dies EACCES
#      inside createWriteStream — before any logging exists to say why.
#   2. npm install at the project root, inside a throwaway node:lts container
#      as the calling host user, so node_modules lands IN-TREE with ownership
#      matching the host (no shared cache dir — each copy owns its deps).
#   3. Verifies the shared image hhm_rpp:${IMAGE_TAG} exists. If missing it
#      must be built in hhm_rpp_ge (the image owner) — never from here.
set -euo pipefail
cd "$(dirname "$0")"

# Read one key from .env WITHOUT sourcing it (values may contain characters
# bash would expand; compose reads .env itself — the guard only needs one key).
env_val() {
    grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- \
        | sed -e 's/[[:space:]]\+#.*$//' -e 's/[[:space:]]*$//' | tr -d "'\""
}

IMAGE_TAG="$(env_val IMAGE_TAG)"
: "${IMAGE_TAG:?IMAGE_TAG is not set — add it to .env (selects the ge-owned shared image hhm_rpp:\$IMAGE_TAG)}"

echo "==> ensure ./utils/logger/logs exists (owned by $(id -un), not created root by Docker)"
mkdir -p ./utils/logger/logs

echo "==> npm install (in-tree, as $(id -un))"
docker run --rm \
  -v "$(pwd)":/workspace -w /workspace \
  --user "$(id -u):$(id -g)" \
  -e NPM_CONFIG_CACHE=/tmp/.npm \
  node:lts npm install

if docker image inspect "hhm_rpp:${IMAGE_TAG}" >/dev/null 2>&1; then
    echo "==> shared image hhm_rpp:${IMAGE_TAG} present (owned by hhm_rpp_ge)"
else
    echo "ERROR: image hhm_rpp:${IMAGE_TAG} not found."
    echo "       It is built by the GE repo (owns the shared image):"
    echo "         cd /opt/apps/hhm_rpp_ge && docker compose build"
    exit 1
fi

echo "==> done: deps installed; runs use hhm_rpp:${IMAGE_TAG}"
