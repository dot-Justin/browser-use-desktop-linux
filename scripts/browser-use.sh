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

log "Starting Browser Use from $APP_DIR"

# Terminal: run interactively with HMR.
# Desktop launcher: use systemd-run to give the process its own scope.
# Without this, Rofi/Wofi kill the entire process group on exit,
# taking electron-forge and its Vite servers + Electron child with it.
if [ -t 0 ]; then
  exec npx electron-forge start 2>&1
else
  # setsid detaches from Rofi's process group so it survives Rofi exit.
  # Environment (Wayland, D-Bus, etc.) is inherited automatically.
  # electron-forge reads stdin and exits on EOF, so we pipe from
  # `sleep infinity` to keep stdin open (instead of /dev/null).
  setsid bash -c "cd '$APP_DIR' && sleep infinity | exec npx electron-forge start >>'$LOG_FILE' 2>&1" &
  log "Launched via setsid (pid=$!)"
  exit 0
fi
