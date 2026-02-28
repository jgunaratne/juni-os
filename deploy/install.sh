#!/usr/bin/env bash
set -euo pipefail

# ─── JuniOS Install Script ──────────────────────────────────
# Usage: sudo ./install.sh [username]
#
# Installs JuniOS as a systemd service.
# Requires: Node.js >= 18, npm

INSTALL_DIR="/opt/junios"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_USER="${1:-$(logname 2>/dev/null || echo $SUDO_USER)}"

if [ -z "$SERVICE_USER" ]; then
  echo "Usage: sudo $0 <username>"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  JuniOS Installer"
echo "  Install dir:  $INSTALL_DIR"
echo "  Run as user:  $SERVICE_USER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install Node.js >= 18 first."
  echo "   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "   sudo apt install -y nodejs"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js >= 18 required (found: $(node -v))"
  exit 1
fi

echo "✓ Node.js $(node -v)"

# Copy files
echo "→ Installing to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
rsync -a --exclude=node_modules --exclude=.git "$SCRIPT_DIR/" "$INSTALL_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# Build frontend
echo "→ Installing frontend dependencies ..."
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm install

echo "→ Building frontend ..."
sudo -u "$SERVICE_USER" npx vite build

# Install deploy server deps
echo "→ Installing server dependencies ..."
cd "$INSTALL_DIR/deploy"
sudo -u "$SERVICE_USER" npm install

# Install systemd service
echo "→ Installing systemd service ..."
SERVICE_FILE="/etc/systemd/system/junios@.service"
cp "$INSTALL_DIR/deploy/junios.service" "$SERVICE_FILE"
# Fix WorkingDirectory and ExecStart to use actual install dir
sed -i "s|/opt/junios|$INSTALL_DIR|g" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable "junios@${SERVICE_USER}"
systemctl restart "junios@${SERVICE_USER}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ JuniOS installed and running!"
echo ""
echo "  URL:     http://$(hostname -I | awk '{print $1}'):3000"
echo "  Service: systemctl status junios@${SERVICE_USER}"
echo "  Logs:    journalctl -u junios@${SERVICE_USER} -f"
echo ""
echo "  Optional: install nginx for port 80"
echo "    sudo apt install nginx"
echo "    sudo cp $INSTALL_DIR/deploy/nginx.conf /etc/nginx/sites-available/junios"
echo "    sudo ln -sf /etc/nginx/sites-available/junios /etc/nginx/sites-enabled/default"
echo "    sudo systemctl reload nginx"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
