<img width="1456" height="484" alt="desktop-app-banner" src="https://github.com/user-attachments/assets/550ca16a-5a61-4ded-92f0-a30421870223" />

# Browser Use Desktop App — Linux Fork

> Run a team of browser agents on your desktop. Forked from [browser-use/desktop-app](https://github.com/browser-use/desktop-app) with Linux support.

Every AI browser tries to be both a browser *and* an agent. Keep your normal browser — this is just the agent half.

Ports your cookies into a fresh Chromium so agents are logged in everywhere you are, and spawns tasks from anywhere on your desktop with a keyboard shortcut.

Built on [Browser Harness](https://github.com/browser-use/browser-harness).

<img width="3542" height="2298" alt="CleanShot 2026-05-01 at 12 18 27@2x" src="https://github.com/user-attachments/assets/edd4f6e0-0efe-4b16-b772-b73d5a1a6d23" />

## Linux Quick Start

### Prerequisites

- **Node.js** >= 20 and **npm**
- **libsecret** — for credential storage via keytar (`libsecret` on Arch, `libsecret-1-0` on Debian/Ubuntu)
- A credential storage backend: **gnome-keyring** or **kwallet**
- A Chromium-based browser (Chrome, Chromium, Helium, etc.)

<details>
<summary>Arch Linux</summary>

```bash
sudo pacman -S nodejs npm libsecret
# kwallet or gnome-keyring should already be installed with your DE
```
</details>

<details>
<summary>Debian / Ubuntu</summary>

```bash
sudo apt install nodejs npm libsecret-1-0 libsecret-1-dev gnome-keyring
```
</details>

### Install & Run

```bash
git clone https://github.com/dot-Justin/browser-use-desktop-linux.git
cd browser-use-desktop-linux/my-app
npx yarn install
npm start
```

### Desktop Launcher (Rofi / app menu)

To launch from your app menu instead of a terminal:

```bash
bash scripts/install-launcher.sh
```

This installs:
- `~/.local/bin/browser-use` — launcher command
- `~/.local/share/applications/browser-use.desktop` — desktop entry
- App icon in `~/.local/share/icons/`

After installing, "Browser Use" will appear in Rofi, Wofi, or any freedesktop-compatible launcher. You can also run `browser-use` from any terminal.

> **Note:** When launched from a terminal, the app runs via `electron-forge` with hot-reload. When launched from a desktop entry, it runs Electron directly for stability (no HMR).

### Task Runner (optional)

If you want to use the Taskfile commands:

```bash
sudo pacman -S go-task   # Arch
# or: brew install go-task / go install github.com/go-task/task/v3/cmd/task@latest
task up
```

## Providers

- **Anthropic** — Claude Code Subscription or API Key
- **Codex** — ChatGPT Subscription or API Key

## Channels

Inbound message channels can trigger agent sessions automatically.

- **WhatsApp** — text yourself with `@BU` to send and receive agent messages

## Supported Browsers (cookie import)

Linux cookie import supports profiles from:
- Google Chrome / Chrome Beta / Chrome Unstable
- Chromium
- Helium Browser

## What Changed from Upstream

See [CHANGELOG-linux.md](CHANGELOG-linux.md) for the full list of Linux-specific changes.

## Development

```bash
cd my-app
npx yarn install
npm start          # electron-forge with Vite HMR
```

## Logs

- App logs: `~/.config/Browser Use/logs/`
- Launcher logs: `~/.local/state/browser-use/launcher.log`

## License

MIT
