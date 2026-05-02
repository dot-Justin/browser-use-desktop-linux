# Linux Port Changelog

All changes relative to [browser-use/desktop-app](https://github.com/browser-use/desktop-app) upstream.

## Window & UI

- **window.ts** — `trafficLightPosition` (macOS traffic lights) gated behind `process.platform === 'darwin'`
- **pill.ts** — `vibrancy`, `visualEffectState`, `type: 'panel'` gated behind darwin check; these are macOS-only Electron options
- **logsPill.ts** — `type: 'panel'` gated behind darwin check

## Tray

- **tray.ts** — `setTemplateImage(true)` only called on macOS (adapts icon to light/dark menu bar)
- **tray.ts** — `Command+,` and `Command+Q` accelerators changed to `CommandOrControl+` for cross-platform

## Auto-Update

- **updater.ts** — `supportsUpdates()` now returns true for Linux; electron-updater handles AppImage auto-update

## System Integration

- **consentIpc.ts** — Added Linux notification settings handler via `xdg-open settings://notifications`
- **onboardingHandlers.ts** — Linux terminal emulator detection for `claude auth login` (kitty, gnome-terminal, konsole, xfce4-terminal, alacritty, foot, xterm); falls back to opening docs URL if none found

## Chrome/Browser Import

- **profiles.ts** — Added `~/.config/net.imput.helium` (Helium browser) to Linux profile candidates
- **cookies.ts** — Added `/usr/bin/helium-browser` to Linux binary candidates

## Build & Packaging

- **forge.config.ts** — Linux icon set to `assets/icon.png`; deb/rpm makers configured with icons, categories, and `libsecret` dependency
- **vite.main.config.ts** — Added `keytar` to Vite externals (native module, must resolve at runtime)
- **patch-electron-plist.sh** — Early-exits on non-macOS (plist patching is mac-only)

## Taskfile

- **Taskfile.yml** — Electron binary detection uses `dist/electron` on Linux instead of `.app` bundles
- **Taskfile.yml** — Log directory paths use `XDG_CONFIG_HOME` on Linux instead of `~/Library/Application Support/`

## Launcher

- **scripts/browser-use.sh** — Launcher script; auto-detects terminal vs desktop launch. Terminal mode uses `electron-forge start` (HMR). Desktop mode runs Electron directly to avoid EPIPE crash from broken stdio pipe when forge parent exits.
- **scripts/browser-use.desktop** — Freedesktop `.desktop` entry for Rofi/Wofi/app launchers
- **scripts/install-launcher.sh** — One-command installer for launcher + desktop entry + icon

## Misc

- **yarn.lock** — Fixed `git+ssh://` URLs to `git+https://` for public cloning without SSH keys
