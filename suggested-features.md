# WebTun — Feature Analysis & Suggestions

## Current Feature Set

- Web terminal (xterm.js + node-pty, multi-tab)
- File explorer (browse, upload, download, rename, delete)
- Code editor (in-browser textarea)
- PWA (service worker, manifest, offline cache)
- Cloudflare Tunnel (one-command setup)
- PIN auth, 6 themes, settings, terminal search (Ctrl+F)
- MCP Exec API (run commands via HTTP)
- tmux session persistence, auto-reconnect
- Mobile keyboard bar

## Suggested Features (light code, big impact)

| # | Feature | Why it's impactful | Rough effort |
|---|---|---|---|
| 1 | **Ctrl+P File Fuzzy Finder** | Most expected power-user feature. Type a filename → instantly find & open/navigate. Huge UX win for server admins. | ~2 files, ~50 lines |
| 2 | **Tab Rename** (double-click) | Multiple terminals named "Term 1", "Term 2" are useless. Let users label them. | ~5 lines JS |
| 3 | **Quick System Dashboard** | CPU, RAM, disk, uptime, top processes. Every SSH user checks `htop` immediately. Ship it as a modal. | ~20 lines server + 30 lines JS |
| 4 | **One-click Systemd Manager** | Start/stop/restart/enable services from UI. Your target audience runs servers. | ~30 lines server + ~40 lines JS |
| 5 | **File Bookmarks** | Pin frequently-accessed directories in the sidebar. Saves so much navigation time. | ~15 lines JS + localStorage |

**Recommendation**: #1 (fuzzy finder) + #2 (rename tabs) + #3 (system dashboard) are the trinity. All three can be built in under an hour and will make WebTun feel like a professional server management tool, not just a terminal-in-a-browser.
