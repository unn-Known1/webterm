#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# ─────────────────────────────────────────────────────────────
#  WebTerm Setup Script
# ─────────────────────────────────────────────────────────────
BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
BLUE=$'\033[34m'; CYAN=$'\033[36m'; RESET=$'\033[0m'

print_banner() {
cat << 'BANNER'
  ██╗    ██╗███████╗██████╗ ████████╗███████╗██████╗ ███╗   ███╗
  ██║    ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
  ██║ █╗ ██║█████╗  ██████╔╝   ██║   █████╗  ██████╔╝██╔████╔██║
  ██║███╗██║██╔══╝  ██╔══██╗   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
  ╚███╔███╔╝███████╗██████╔╝   ██║   ███████╗██║  ██║██║ ╚═╝ ██║
   ╚══╝╚══╝ ╚══════╝╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝
BANNER
echo ""
echo "  ${BOLD}${CYAN}Web Terminal + File Explorer${RESET}"
echo "  ─────────────────────────────────"
echo ""
}

info()    { echo "  ${BLUE}▶${RESET} $*"; }
success() { echo "  ${GREEN}✓${RESET} $*"; }
warn()    { echo "  ${YELLOW}⚠${RESET} $*"; }
error()   { echo "  ${RED}✗${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

print_banner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Detect OS ────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
info "Detected: $OS / $ARCH"

# ── Node.js ──────────────────────────────────────────────────
install_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    MAJOR=${NODE_VER//v/}; MAJOR=${MAJOR%%.*}
    if [ "$MAJOR" -ge 18 ]; then
      success "Node.js $NODE_VER already installed"
      return
    fi
    warn "Node.js $NODE_VER is too old (need ≥18), upgrading..."
  else
    info "Installing Node.js LTS..."
  fi

  case "$OS" in
    Linux)
      if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - &>/dev/null
        sudo apt-get install -y nodejs &>/dev/null
      elif command -v dnf &>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - &>/dev/null
        sudo dnf install -y nodejs &>/dev/null
      elif command -v yum &>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - &>/dev/null
        sudo yum install -y nodejs &>/dev/null
      elif command -v pacman &>/dev/null; then
        sudo pacman -Sy --noconfirm nodejs npm &>/dev/null
      else
        die "Cannot auto-install Node.js. Please install Node.js ≥18 manually: https://nodejs.org"
      fi
      ;;
    Darwin)
      if command -v brew &>/dev/null; then
        brew install node &>/dev/null
      else
        die "Please install Node.js ≥18 from https://nodejs.org or install Homebrew first"
      fi
      ;;
    *)
      die "Unsupported OS: $OS. Install Node.js ≥18 manually."
      ;;
  esac
  success "Node.js $(node --version) installed"
}

install_node

# ── python3-build-tools for node-pty ─────────────────────────
if [[ "$OS" == "Linux" ]] && command -v apt-get &>/dev/null; then
  dpkg -l python3-dev make g++ &>/dev/null 2>&1 || {
    info "Installing build tools for node-pty..."
    sudo apt-get install -y python3-dev make g++ &>/dev/null || true
  }
fi

# ── npm dependencies ─────────────────────────────────────────
info "Installing npm dependencies..."
npm install --loglevel=error 2>&1 | grep -v "^npm warn" || true
success "Dependencies installed"

# ── Configuration ─────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
PORT=3000

if [ -f "$ENV_FILE" ]; then
  warn ".env already exists. Edit it to change settings."
  # shellcheck source=/dev/null
  source "$ENV_FILE" 2>/dev/null || true
  PORT=${PORT:-3000}
else
  echo ""
  echo "  ${BOLD}Configuration${RESET}"
  echo "  ─────────────"
  
  read -rp "  Port [3000]: " INPUT_PORT
  PORT="${INPUT_PORT:-3000}"

  echo ""
  echo "  ${BOLD}PIN Protection${RESET}"
  echo "  Add a PIN to prevent unauthorized access."
  echo "  Leave blank for no PIN (NOT recommended if exposed to the internet)."
  echo ""
  read -rsp "  PIN (hidden, press Enter for none): " INPUT_PIN
  echo ""

  cat > "$ENV_FILE" << EOF
PORT=$PORT
HOST=0.0.0.0
PIN=$INPUT_PIN
# SHELL=/bin/bash  # override shell if needed
EOF
  success "Config saved to .env"
fi

# ── Cloudflared ───────────────────────────────────────────────
install_cloudflared() {
  if command -v cloudflared &>/dev/null; then
    success "cloudflared already installed ($(cloudflared --version 2>&1 | head -1))"
    return
  fi

  info "Installing cloudflared..."
  CF_BASE="https://github.com/cloudflare/cloudflared/releases/latest/download"

  case "$OS" in
    Linux)
      case "$ARCH" in
        x86_64)  CF_FILE="cloudflared-linux-amd64" ;;
        aarch64|arm64) CF_FILE="cloudflared-linux-arm64" ;;
        armv7l)  CF_FILE="cloudflared-linux-arm" ;;
        *)        warn "Unknown arch $ARCH, trying amd64"; CF_FILE="cloudflared-linux-amd64" ;;
      esac
      curl -fsSL "$CF_BASE/$CF_FILE" -o /tmp/cloudflared
      chmod +x /tmp/cloudflared
      sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
      ;;
    Darwin)
      if command -v brew &>/dev/null; then
        brew install cloudflare/cloudflare/cloudflared &>/dev/null
      else
        case "$ARCH" in
          arm64) CF_FILE="cloudflared-darwin-arm64.tgz" ;;
          *)     CF_FILE="cloudflared-darwin-amd64.tgz" ;;
        esac
        curl -fsSL "$CF_BASE/$CF_FILE" -o /tmp/cf.tgz
        tar xzf /tmp/cf.tgz -C /tmp
        sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
      fi
      ;;
    *)
      warn "Cannot auto-install cloudflared on $OS. Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
      return
      ;;
  esac
  success "cloudflared installed"
}

install_cloudflared

# ── Systemd service (optional, Linux only) ────────────────────
setup_systemd() {
  if [[ "$OS" != "Linux" ]] || ! command -v systemctl &>/dev/null; then return; fi
  
  echo ""
  read -rp "  Install as systemd service (auto-start on boot)? [y/N]: " INSTALL_SERVICE
  if [[ "${INSTALL_SERVICE,,}" != "y" ]]; then return; fi

  SERVICE_FILE="/etc/systemd/system/webterm.service"
  NODE_PATH="$(command -v node)"
  
  sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=WebTerm - Web Terminal Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$NODE_PATH $SCRIPT_DIR/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable webterm
  sudo systemctl start webterm
  success "Systemd service installed and started"
  echo "  ${CYAN}Manage with:${RESET} sudo systemctl {start|stop|restart|status} webterm"
}

# ── Start & Launch ─────────────────────────────────────────────
echo ""
echo "  ${BOLD}${GREEN}Setup complete!${RESET}"
echo ""
echo "  Starting WebTerm server..."

# Kill old instance if running
pkill -f "node.*server.js" 2>/dev/null || true
sleep 0.5

# Start server in background, log to file
LOG_FILE="$SCRIPT_DIR/webterm.log"
NODE_CMD="$(command -v node)"
nohup "$NODE_CMD" "$SCRIPT_DIR/server.js" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$SCRIPT_DIR/webterm.pid"

# Wait for server
for i in {1..10}; do
  sleep 0.5
  if curl -sf "http://localhost:$PORT/api/auth/required" &>/dev/null; then
    break
  fi
done

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  ${GREEN}${BOLD}WebTerm is running!${RESET}                       │"
echo "  │                                         │"
echo "  │  Local:  ${CYAN}http://localhost:$PORT${RESET}           │"
echo "  │  Network: ${CYAN}http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_IP"):$PORT${RESET}          │"
echo "  │                                         │"
echo "  │  Log:    $LOG_FILE"
echo "  │  PID:    $SERVER_PID                               │"
echo "  └─────────────────────────────────────────┘"
echo ""

# Systemd offer
if [[ "$OS" == "Linux" ]] && command -v systemctl &>/dev/null && [ ! -f "/etc/systemd/system/webterm.service" ]; then
  setup_systemd
fi

# ── Cloudflare Tunnel ──────────────────────────────────────────
if command -v cloudflared &>/dev/null; then
  echo ""
  read -rp "  Start Cloudflare Tunnel for remote access? [Y/n]: " START_TUNNEL
  if [[ "${START_TUNNEL,,}" != "n" ]]; then
    echo ""
    echo "  ${BOLD}Starting Cloudflare Tunnel...${RESET}"
    echo "  ${YELLOW}Your public URL will appear below (takes a few seconds):${RESET}"
    echo "  ${YELLOW}Press Ctrl+C to stop the tunnel (server keeps running).${RESET}"
    echo ""
    # Run cloudflared and use --line-buffered to prevent grep from hiding the output
    cloudflared tunnel --url "http://localhost:$PORT" 2>&1 | grep --line-buffered -E "https://[a-z0-9-]+\.trycloudflare\.com" | while read -r line; do
      URL=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com')
      if [ -n "$URL" ]; then
        echo ""
        echo "  ┌─────────────────────────────────────────────────────┐"
        echo "  │  ${GREEN}${BOLD}Public URL (share this!):${RESET}   │"
        echo "  │  ${CYAN}${BOLD}$URL${RESET}                         │"
        echo "  │                                                     │"
        echo "  │  Bookmark it on your phone to use WebTerm anywhere! │"
        echo "  └─────────────────────────────────────────────────────┘"
        echo ""
      fi
    done
    # Fallback: just run cloudflared and let it print naturally
    cloudflared tunnel --url "http://localhost:$PORT"
  else
    echo ""
    echo "  ${YELLOW}To start the tunnel later, run:${RESET}"
    echo "  cloudflared tunnel --url http://localhost:$PORT"
  fi
else
  echo "  ${YELLOW}Cloudflared not found. To get a public URL:${RESET}"
  echo "  Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/"
  echo "  Then run: cloudflared tunnel --url http://localhost:$PORT"
fi

echo ""
echo "  ${GREEN}Done.${RESET} To stop the server: kill \$(cat webterm.pid)"
echo ""
