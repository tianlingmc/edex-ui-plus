<p align="center">
  <br>
  <img alt="Logo" src="media/logo.png" width="128">
  <br>
</p>

<h1 align="center">eDEX-UI-Plus</h1>

<p align="center">
  <strong>Sci-Fi Desktop Terminal Emulator</strong><br>
  A fullscreen terminal monitoring interface with a cyberpunk aesthetic
</p>

<p align="center">
  <a href="https://github.com/tianlingmc/edex-ui-plus/releases"><img alt="Version" src="https://img.shields.io/badge/version-v1.0.0-00d8ff?style=flat-square"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPLv3-00d8ff?style=flat-square"></a>
  <a href="https://github.com/tianlingmc/edex-ui-plus/releases"><img alt="Downloads" src="https://img.shields.io/badge/download-installer-00d8ff?style=flat-square"></a>
  <a href="https://github.com/GitSquared/edex-ui"><img alt="Based on" src="https://img.shields.io/badge/based%20on-eDEX--UI-00d8ff?style=flat-square"></a>
</p>

<br>

---

<br>

> **eDEX-UI-Plus** is a fork of [eDEX-UI](https://github.com/GitSquared/edex-ui) (GPL-3.0).  
> It preserves the original sci-fi terminal look while modernizing the entire tech stack, fixing age-related bugs, and improving the everyday user experience.

---

## At a Glance

| Category | Highlights |
|----------|------------|
| Terminal | Multi-tab, drag reorder, shell selection, close confirmation, curses support |
| Monitor | Real-time CPU / memory / processes / network (GeoIP) / disk usage |
| Filesystem | Auto-follow CWD, disk list, right-click menu, space usage bar |
| Themes | 21 sci-fi themes + CSS injection + custom keyboard layouts |
| Sound | Sci-fi sound effects with adjustable volume and amplification |
| Reader | PDF / Markdown / image inline preview |
| More | WebGL interactive globe, media player, Ping connectivity check |

---

## Features

### Terminal
- Up to 6 independent terminal tabs with drag-and-drop reordering
- Shell selection dialog on new terminal creation (cmd / PowerShell / WSL / git-bash etc.)
- Close confirmation to prevent accidental exits
- 256-color support, mouse events, curses / TUI applications (neofetch, htop, vim etc.)
- Configurable font size, cursor style/blink, scrollback buffer, line height, letter spacing

### System Monitoring
- Multi-core CPU gauges with historical chart
- Memory and swap usage chart
- Process list (PID / CPU / memory / user)
- Network monitoring — GeoIP location, active TCP connections, upload/download speed
- Disk space usage for all mount points

### File Browser
- Auto-follows the terminal working directory
- "Show disks" view for all drives and mount points
- Right-click context menu (copy path, open in new terminal, properties etc.)
- Directory space usage bar
- List / icon view toggle, optional dotfile hiding

### Customization
- **21 themes** — tron, cyborg, matrix, nord, blade, interstellar ...
- **19 keyboard layouts** — including Dvorak, Colemak, Workman, BEPO ...
- CSS injection for custom component styling
- Sci-fi sound effects (key press, startup, error) with adjustable volume and amplification
- 12/24 hour clock format toggle
- Entry animation speed control

### Settings & Configuration
- GUI settings page with sidebar navigation
- One-click restore defaults
- Hot-reload — config changes take effect immediately, no restart needed
- Terminal behavior: shell selection prompt, default shell type, close confirmation

---

<p align="center">
  <img alt="Screenshot 1" src="media/READMEimges/imges (1).png" width="45%">
  <img alt="Screenshot 2" src="media/READMEimges/imges (2).png" width="45%">
</p>

<p align="center">
  <img alt="Screenshot 3" src="media/READMEimges/imges (3).png" width="45%">
  <img alt="Screenshot 4" src="media/READMEimges/imges (4).png" width="45%">
</p>

<p align="center">
  <img alt="Screenshot 5" src="media/READMEimges/imges (5).png" width="90%">
</p>

---

## Installation

Download the latest installer from the [Releases](https://github.com/tianlingmc/edex-ui-plus/releases) page.

| File | Description |
|------|-------------|
| `eDEX-UI-Plus Setup *.exe` | NSIS installer (recommended), supports custom install directory and desktop shortcut |
| `win-unpacked/` | Portable version, extract and run, no installation required |

> The installer is not code-signed. Windows SmartScreen may show a warning — click "Run anyway" to proceed.

### Build from Source

**Prerequisites:** Node.js >= 22, npm >= 10, Windows x64

```bash
git clone https://github.com/tianlingmc/edex-ui-plus.git
cd edex-ui-plus/src
npm install
npm run dev      # Development mode (hot-reload)
npm run dist     # Package into installer
npm test         # Run tests
```

---

## Tech Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| [Electron](https://www.electronjs.org/) | 43 | Desktop application framework |
| [Vite](https://vitejs.dev/) / [electron-vite](https://electron-vite.org/) | 7 / 5 | Build toolchain |
| [xterm.js](https://xtermjs.org/) | 6 | Terminal emulator core |
| [node-pty](https://github.com/microsoft/node-pty) | 1 | Pseudo-terminal (conpty / WinPTY) |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 4 | Document viewer |
| [Howler.js](https://howlerjs.com/) | 2 | Sound engine |
| [systeminformation](https://systeminformation.io/) | 5 | System hardware info |
| [maxmind](https://www.npmjs.com/package/maxmind) / [GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data) | - | IP geolocation |
| [electron-builder](https://www.electron.build/) | 26 | Packaging / NSIS installer |

---

## License

[**GNU General Public License v3.0**](./LICENSE)

This project is a fork of [eDEX-UI](https://github.com/GitSquared/edex-ui) by Gabriel 'Squared' SAILLARD (2021).

- Full license text: [LICENSE](./LICENSE)
- Attribution & third-party licenses: [NOTICE](./NOTICE.md)
- Original project: <https://github.com/GitSquared/edex-ui>

> All original copyrights are retained. All modifications and additions are also released under GPL-3.0.
