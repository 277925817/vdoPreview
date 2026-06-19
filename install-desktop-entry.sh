#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="${HOME}/Desktop"

if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")"
fi

APPLICATIONS_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${APP_DIR}/VDO Ninja 圆形预览.desktop"
APPLICATION_FILE="${APPLICATIONS_DIR}/vdo-ninja-circle-preview.desktop"
DESKTOP_COPY="${DESKTOP_DIR}/VDO Ninja 圆形预览.desktop"

mkdir -p "$APPLICATIONS_DIR" "$DESKTOP_DIR"

write_desktop_file() {
  local target="$1"

  cat > "$target" <<EOF
[Desktop Entry]
Type=Application
Name=VDO Ninja 圆形预览
Comment=Open a circular frameless VDO.Ninja preview window
Exec=${APP_DIR}/start-vdo-preview.sh
Icon=${APP_DIR}/assets/vdo-preview.svg
Terminal=false
Categories=AudioVideo;Video;
StartupNotify=true
EOF
}

write_desktop_file "$DESKTOP_FILE"
write_desktop_file "$APPLICATION_FILE"
write_desktop_file "$DESKTOP_COPY"
chmod +x "$APPLICATION_FILE" "$DESKTOP_COPY"

if command -v gio >/dev/null 2>&1; then
  gio set "$DESKTOP_COPY" metadata::trusted true >/dev/null 2>&1 || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf 'Installed desktop launcher: %s\n' "$DESKTOP_COPY"
