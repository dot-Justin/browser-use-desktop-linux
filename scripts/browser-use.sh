#!/bin/bash
# Launcher script for Browser Use Desktop on Linux.
# Place a symlink or copy at ~/.local/bin/browser-use
# Usage: browser-use

APP_DIR="$(dirname "$(readlink -f "$0")")/../my-app"

# Resolve the real app dir if this script is symlinked from ~/.local/bin
if [ ! -d "$APP_DIR" ]; then
  # Fallback: check common install location
  APP_DIR="$HOME/Projects/browser-use-desktop-linux/my-app"
fi

if [ ! -d "$APP_DIR" ]; then
  echo "Error: Cannot find Browser Use app directory" >&2
  echo "Expected: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR" || exit 1

# Ensure deps are installed
if [ ! -d node_modules ]; then
  echo "First run — installing dependencies..."
  npx yarn install || { echo "Failed to install dependencies" >&2; exit 1; }
fi

exec npx electron-forge start 2>&1
