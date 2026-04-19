#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_NAME="${APP_NAME:-hll-top-bot}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
PM2_STARTUP_USER="${PM2_STARTUP_USER:-$(id -un)}"
NODE_ENV_VALUE="${NODE_ENV_VALUE:-production}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found. Installing globally..."
  npm install -g pm2
fi

cd "$APP_DIR"

set -a
. "$ENV_FILE"
set +a
export NODE_ENV="$NODE_ENV_VALUE"

pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start npm --name "$APP_NAME" --update-env -- run bot
pm2 save

if command -v sudo >/dev/null 2>&1; then
  pm2 startup systemd -u "$PM2_STARTUP_USER" --hp "$HOME" | sed 's/^sudo /sudo -E /' | bash
else
  pm2 startup systemd -u "$PM2_STARTUP_USER" --hp "$HOME" | bash
fi

pm2 status

echo
echo "Installed PM2 process: $APP_NAME"
echo "App directory: $APP_DIR"
echo "Environment file expected at: $ENV_FILE"
