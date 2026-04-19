#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-hll-top-bot}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_USER="${APP_USER:-$(id -un)}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
NODE_ENV_VALUE="${NODE_ENV_VALUE:-production}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE"
  exit 1
fi

NPM_BIN="$(command -v npm)"
UNIT_PATH="$SYSTEMD_DIR/$SERVICE_NAME.service"
TMP_UNIT="$(mktemp)"

cat >"$TMP_UNIT" <<EOF
[Unit]
Description=HLL RCON Top Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NPM_BIN run bot
Restart=always
RestartSec=5
User=$APP_USER
Environment=NODE_ENV=$NODE_ENV_VALUE
EnvironmentFile=$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to install the systemd service"
    rm -f "$TMP_UNIT"
    exit 1
  fi

  sudo mkdir -p "$SYSTEMD_DIR"
  sudo cp "$TMP_UNIT" "$UNIT_PATH"
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$SERVICE_NAME"
  sudo systemctl status "$SERVICE_NAME" --no-pager
else
  mkdir -p "$SYSTEMD_DIR"
  cp "$TMP_UNIT" "$UNIT_PATH"
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
  systemctl status "$SERVICE_NAME" --no-pager
fi

rm -f "$TMP_UNIT"

echo
echo "Installed systemd service: $SERVICE_NAME"
echo "Unit file: $UNIT_PATH"
