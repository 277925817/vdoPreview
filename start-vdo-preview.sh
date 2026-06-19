#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

if [ ! -d node_modules ]; then
  npm install
fi

if ! node -e "require('electron')" >/dev/null 2>&1; then
  ./node_modules/.bin/install-electron
fi

unset ELECTRON_RUN_AS_NODE
unset ELECTRON_NO_ATTACH_CONSOLE

exec ./node_modules/.bin/electron . "$@"
