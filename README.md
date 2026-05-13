# 🌐 WebTun — Self-Hosted Web Terminal

Access your Linux server from **any browser, phone, or tablet** — no VPN, no SSH client needed.

![Terminal](https://img.shields.io/badge/Terminal-Web--native-blue?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Installable-cyan?style=for-the-badge)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Tunnel-orange?style=for-the-badge)

## ✨ Features

- **🖥️ Full terminal** — node-pty backed, real shell session in your browser
- **📁 File explorer** — browse and manage files without leaving the tab
- **🔢 Multi-tab** — open multiple shell sessions side by side
- **📱 Mobile-friendly PWA** — install as an app on iOS/Android
- **🔒 Self-hosted** — your server, your rules, zero third-party involvement
- **⚡ Cloudflare Tunnel** — expose without opening ports or configuring firewalls
- **🔗 Built-in tunnel manager** — create and stop Cloudflare Tunnels from the Settings panel (no CLI needed)

## 🚀 Quick Start

### One-command install
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/unn-Known1/webtun/main/install.sh)"
```

### Manual setup
```bash
git clone https://github.com/unn-Known1/webtun.git
cd webtun
chmod +x setup.sh && ./setup.sh
```

### Quick launch (if already set up)
```bash
cd webtun
npm start
```

The `setup.sh` script handles everything: Node.js install, npm dependencies, `.env` config, systemd service, and optional Cloudflare Tunnel setup.

To expose via your own domain with Cloudflare Tunnel:
```bash
cloudflared tunnel create webtun
cloudflared tunnel route dns webtun yourdomain.com
cloudflared tunnel run webtun
```

### 🧪 One-click Colab cell

Run this in a **Google Colab notebook cell** to get a full terminal with a tunnel URL:

```bash
!rm -rf webtun && git clone https://github.com/unn-Known1/webtun.git && cd webtun && npm install --loglevel=error && (command -v cloudflared &>/dev/null || (curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared)) && node server.js > /tmp/webtun.log 2>&1 & sleep 4 && for i in 1 2 3; do curl -sf http://localhost:3000/api/auth/required >/dev/null && break; sleep 2; done && curl -s -X POST http://localhost:3000/api/tunnel -H 'Content-Type: application/json' -d '{"url":"http://localhost:3000"}' --max-time 20 | python3 -c "import sys,json; d=json.load(sys.stdin); print('🌐 WebTun ready at:', d.get('url','Error: '+d.get('error','')))"
```

Opens a persistent, multi-window terminal alongside your Python notebooks. Re-run to get a fresh tunnel URL. Stop with `!kill $(lsof -ti :3000)`.

## 🏗️ Stack

- **Frontend:** HTML + Vanilla JS (no framework overhead)
- **Backend:** Node.js + node-pty
- **Tunnel:** Cloudflare Tunnel (cloudflared)
- **Protocol:** WebSocket + xterm.js

## 📦 Use Cases

- Access your home server from anywhere
- Run CLI tools on the go from your phone
- Give someone terminal access without SSH keys
- Emergency server access without a laptop
- **Colab power-up** — run WebTun in a Google Colab notebook cell (`npm start`) and open the tunnel URL in a separate tab for a persistent, multi-window terminal alongside your Python notebooks

## 🔗 Tunnel Manager

WebTun has a built-in tunnel manager accessible from the **Settings** (gear icon) → **Tunnel** section:

1. Enter your local URL (default `http://localhost:3000`)
2. Click **Create** — a Cloudflare Tunnel spawns automatically
3. Copy the public URL with the copy icon, or click the **red stop square** to kill that tunnel only

Tunnels are **detached** from the server — they survive restarts and keep running until you stop them or the machine reboots.

## ⭐ If this helped you, star the repo!

MIT License — built with 💻 by [Gaurang Patel](https://github.com/unn-known1)