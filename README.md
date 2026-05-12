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

## 🚀 Quick Start

```bash
# One-command install
bash -c "$(curl -fsSL https://raw.githubusercontent.com/unn-known1/webtun/main/install.sh)"

# Or run manually
git clone https://github.com/unn-known1/webtun.git
cd webtun
node server.js
```

Then create a Cloudflare Tunnel:
```bash
cloudflared tunnel create webtun
cloudflared tunnel route dns webtun yourdomain.com
cloudflared tunnel run webtun
```

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

## ⭐ If this helped you, star the repo!

MIT License — built with 💻 by [Gaurang Patel](https://github.com/unn-known1)