#!/bin/bash
# Launcher script for Browser Use Desktop on Linux.
# Place a symlink or copy at ~/.local/bin/browser-use
# Usage: browser-use
#
# Install: bash scripts/install-launcher.sh

LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/browser-use"
LOG_FILE="$LOG_DIR/launcher.log"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

APP_DIR="$(dirname "$(readlink -f "$0")")/../my-app"

# Resolve the real app dir if this script is symlinked from ~/.local/bin
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="$HOME/Projects/browser-use-desktop-linux/my-app"
fi

if [ ! -d "$APP_DIR" ]; then
  log "ERROR: Cannot find app directory: $APP_DIR"
  notify-send -a "Browser Use" "Error" "Cannot find Browser Use app directory" 2>/dev/null
  exit 1
fi

cd "$APP_DIR" || exit 1

# If already running, focus the existing window instead of launching again
if pgrep -f "electron/dist/electron" >/dev/null 2>&1; then
  log "Already running — focusing existing window"
  hyprctl dispatch focuswindow "class:electron" 2>/dev/null || true
  exit 0
fi

# Clean up stale singleton lock from previous crash
rm -f "$HOME/.config/Browser Use/SingletonLock" 2>/dev/null

# Ensure deps are installed
if [ ! -d node_modules ]; then
  log "First run — installing dependencies"
  notify-send -a "Browser Use" "Installing..." "First run — installing dependencies" 2>/dev/null
  npx yarn install >> "$LOG_FILE" 2>&1 || {
    log "ERROR: Failed to install dependencies"
    notify-send -a "Browser Use" "Error" "Failed to install dependencies" 2>/dev/null
    exit 1
  }
fi

# When launched from a terminal, use electron-forge for dev servers + HMR.
# When launched from a desktop entry (no TTY), run electron directly to
# avoid EPIPE crashes — electron-forge exits after spawning electron,
# breaking the inherited stdio pipe, which triggers an uncaught exception
# cascade in the app's logger.
if [ -t 0 ]; then
  log "Terminal detected — using electron-forge start"
  exec npx electron-forge start 2>&1
else
  log "No terminal (desktop launcher) — running Electron directly"
  nohup ./node_modules/.bin/electron . </dev/null >> "$LOG_FILE" 2>&1 &
  disown
  log "Electron launched (PID $!)"
fi
