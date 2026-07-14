<p align="center">
  <br>
  <img alt="Logo" src="media/logo.png">
  <br></p>

# eDEX-UI-Plus

**Sci-Fi desktop terminal emulator** — A fullscreen terminal monitoring interface combining sci-fi aesthetics with practical functionality.

A fork of eDEX-UI (GPL-3.0) with modernized tech stack and improved user experience.

![screenshot](https://github.com/tianlingmc/edex-ui-plus/raw/main/screenshot.png)

## Features

### Terminal
- Multi-tab terminal emulator (up to 6 independent terminals)
- Draggable tab reordering, individual tab closing
- Shell type selection on new terminal creation (cmd / PowerShell / WSL etc.)
- Close confirmation prompt to prevent accidental exit
- Color support, mouse events, curses applications

### System Monitoring
- Real-time CPU / memory / process monitor
- Network connection monitor (GeoIP location, active connections, bandwidth stats)
- Disk space usage overview

### File Browser
- Auto-follows terminal working directory (CWD)
- Disk list view (Show disks)
- Right-click context menu (copy path, open file, etc.)
- Directory space usage bar

### Customization
- 21 sci-fi themes
- 19 on-screen keyboard layouts (including Dvorak, Colemak, etc.)
- CSS injection for custom styling
- Sci-fi sound effects (key press, startup, etc.)
- Clock format (12/24 hour)
- Entry animation speed control

### Settings & Configuration
- GUI settings page with sidebar navigation
- One-click "Restore Defaults"
- Hot-reload — no app restart required after config changes
- Terminal parameters: font size, cursor style/blink, scrollback, line height, letter spacing

### More
- PDF / Markdown / image document viewer
- Built-in media player
- WebGL interactive 3D globe (GeoIP visualization)
- Network connectivity check (Ping)

## Installation

### Download Installer

Download the latest release from the [Releases](https://github.com/tianlingmc/edex-ui-plus/releases) page.

The Windows installer (`eDEX-UI-Plus Setup *.exe`) supports custom installation directory and desktop shortcut creation.

### Build from Source

**Prerequisites:** Node.js >= 22, Windows x64

```
git clone https://github.com/tianlingmc/edex-ui-plus.git
cd edex-ui-plus
cd src
npm install
npm run dev       # Development mode (hot reload)
npm run dist      # Package into installer
npm test          # Run tests
```

## Tech Stack

| Component | Version |
|-----------|---------|
| Electron | 43 |
| Vite / electron-vite | 7 / 5 |
| xterm.js | 6 (with addons) |
| node-pty | 1 (conpty / WinPTY) |
| PDF.js | 4 |
| Howler.js | 2 |
| systeminformation | 5 |
| ws (WebSocket) | 8 |
| electron-builder | 26 (NSIS) |

## License

**GNU General Public License v3.0**

This project is a fork of [eDEX-UI](https://github.com/GitSquared/edex-ui) by Gabriel 'Squared' SAILLARD, released under the GPL-3.0 license.

See [LICENSE](./LICENSE) for the full license text, and [NOTICE](./NOTICE.md) for attribution and third-party resource licenses.

> All original copyrights are retained. All modifications and additions are also released under GPL-3.0.
