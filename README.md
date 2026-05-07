# WebTerm

A self-hosted web terminal with file explorer. Access your machine from any browser, including your phone.

## Quick Start

```bash
git clone https://github.com/unn-knonw1/webterm.git
cd webterm
chmod +x setup.sh stop.sh
./setup.sh
```

## One-liner — auto-launch with Cloudflare Tunnel

```bash
curl -fsSL https://raw.githubusercontent.com/unn-knonw1/webterm/main/setup.sh
```

Or clone + tunnel in one shot:

```bash
git clone https://github.com/unn-knonw1/webterm.git \
  && cd webterm \
  && npm install \
  && node server.js & \
  && cloudflared tunnel --url http://localhost:3000
```

That's it. The script will:
1. Install Node.js if missing
2. Install npm dependencies (including `node-pty` for real shell access)
3. Ask for a port and optional PIN
4. Start the server
5. Optionally install as a systemd service
6. Optionally start a Cloudflare Tunnel for remote access (no port forwarding needed)

## Features

| Feature | Details |
|---|---|
| **Real shell** | Full PTY via node-pty — bash, zsh, fish, etc. |
| **Multiple tabs** | Open unlimited terminal sessions |
| **File explorer** | Browse, upload, download, rename, delete |
| **Code editor** | Edit files in-browser with syntax highlighting |
| **Mobile keyboard** | ESC, TAB, arrows, Ctrl+C/D/Z/L, Del, Home/End |
| **Search** | In-terminal search with Ctrl+F |
| **Themes** | Tokyo Night, Dracula, Gruvbox, Solarized, Monokai, Light |
| **PIN protection** | Optional PIN to block unauthorized access |
| **PWA** | Installable on iOS/Android/Desktop |
| **Drag & drop upload** | Drop files anywhere to upload |
| **Cloudflare Tunnel** | Public HTTPS URL, no port forwarding |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New terminal tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+B` | Toggle file explorer |
| `Ctrl+F` | Search in terminal |
| `Ctrl+Shift+→` / `←` | Cycle tabs |
| `Ctrl+S` (in editor) | Save file |

## Config (.env)

```env
PORT=3000
HOST=0.0.0.0
PIN=yourpin
# SHELL=/usr/bin/zsh
```

## Manual Start

```bash
git clone https://github.com/unn-knonw1/webterm.git
cd webterm
npm install

# Start server
node server.js

# Start with Cloudflare tunnel
cloudflared tunnel --url http://localhost:3000

# Or both in one command
node server.js & cloudflared tunnel --url http://localhost:3000

# Stop server
./stop.sh
```

## PWA / Desktop App

- **iOS**: Open in Safari → Share → Add to Home Screen
- **Android**: Open in Chrome → Menu → Install App  
- **Desktop**: Chrome/Edge address bar → install icon

## Security Notes

- Always set a PIN if the server will be accessible outside your local network
- The Cloudflare Tunnel URL is temporary and changes each restart; for a permanent URL, set up a named Cloudflare tunnel
- Traffic over the tunnel is encrypted (HTTPS)
- For extra security, bind to localhost and only expose via the tunnel: `HOST=127.0.0.1`

## Requirements

- Node.js ≥ 18
- Linux/macOS (node-pty has limited Windows support; use WSL on Windows)
- Python 3 + make + g++ (for building node-pty — usually pre-installed)
