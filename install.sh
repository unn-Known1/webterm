#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

REPO="https://github.com/unn-Known1/webtun.git"
DIR="$HOME/webtun"

echo ""
echo "  Installing WebTun..."

# Clone or pull
if [ -d "$DIR" ]; then
  echo "  Updating existing installation..."
  cd "$DIR" && git pull
else
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi

# Run setup
chmod +x "$DIR/setup.sh"
exec "$DIR/setup.sh"
