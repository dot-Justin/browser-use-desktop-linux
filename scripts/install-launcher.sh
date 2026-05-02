#!/bin/bash
# Install Browser Use launcher and desktop entry for Linux.
# Run from the repo root: bash scripts/install-launcher.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

mkdir -p ~/.local/bin ~/.local/share/applications ~/.local/share/icons/hicolor/256x256/apps

# Symlink launcher script
ln -sf "$SCRIPT_DIR/browser-use.sh" ~/.local/bin/browser-use
echo "Installed launcher: ~/.local/bin/browser-use"

# Install icon
cp "$REPO_DIR/my-app/assets/icon.png" ~/.local/share/icons/hicolor/256x256/apps/browser-use.png
echo "Installed icon"

# Install .desktop entry with absolute path
sed "s|^Exec=browser-use|Exec=$HOME/.local/bin/browser-use|" "$SCRIPT_DIR/browser-use.desktop" \
  > ~/.local/share/applications/browser-use.desktop
update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
echo "Installed desktop entry: ~/.local/share/applications/browser-use.desktop"

echo "Done — 'Browser Use' should now appear in your app launcher."
