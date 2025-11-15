#!/bin/bash
set -e

# Kiosk Agent Deployment Script for Linux
# This script deploys the kiosk agent to a production environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/kiosk-agent}"
SERVICE_USER="${SERVICE_USER:-kiosk}"
SERVICE_GROUP="${SERVICE_GROUP:-kiosk}"

echo "=== Kiosk Agent Deployment ==="
echo "Project root: ${PROJECT_ROOT}"
echo "Deploy directory: ${DEPLOY_DIR}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root"
    exit 1
fi

# Step 1: Create service user and group
echo "[1/8] Creating service user and group..."
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    groupadd -r "${SERVICE_GROUP}" || true
    useradd -r -g "${SERVICE_GROUP}" -d "${DEPLOY_DIR}" -s /bin/bash "${SERVICE_USER}"
    echo "User ${SERVICE_USER} created"
else
    echo "User ${SERVICE_USER} already exists"
fi

# Step 2: Install Node.js if not present
echo "[2/8] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    NODE_VERSION=$(node --version)
    echo "Node.js ${NODE_VERSION} is already installed"
fi

# Step 3: Create deployment directory
echo "[3/8] Creating deployment directory..."
mkdir -p "${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}/data"
mkdir -p "${DEPLOY_DIR}/logs"
mkdir -p "${DEPLOY_DIR}/config"

# Step 4: Build the application
echo "[4/8] Building application..."
cd "${PROJECT_ROOT}"
npm install --workspace=apps/kiosk-agent
cd "${PROJECT_ROOT}/apps/kiosk-agent"
npm run build

# Step 5: Copy files to deployment directory
echo "[5/8] Copying files to ${DEPLOY_DIR}..."
rsync -av --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.test.ts' \
    --exclude='tests' \
    "${PROJECT_ROOT}/apps/kiosk-agent/dist/" "${DEPLOY_DIR}/dist/"

rsync -av \
    "${PROJECT_ROOT}/apps/kiosk-agent/package*.json" "${DEPLOY_DIR}/"

if [ -d "${PROJECT_ROOT}/apps/kiosk-agent/config" ]; then
    rsync -av "${PROJECT_ROOT}/apps/kiosk-agent/config/" "${DEPLOY_DIR}/config/"
fi

# Step 6: Install production dependencies
echo "[6/8] Installing production dependencies..."
cd "${DEPLOY_DIR}"
npm ci --production --ignore-scripts

# Step 7: Set permissions
echo "[7/8] Setting permissions..."
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${DEPLOY_DIR}"
chmod -R 755 "${DEPLOY_DIR}"
chmod -R 700 "${DEPLOY_DIR}/data"
chmod -R 700 "${DEPLOY_DIR}/logs"

# Step 8: Install and start systemd service
echo "[8/8] Installing systemd service..."
cp "${PROJECT_ROOT}/infra/systemd/kiosk-agent.service" /etc/systemd/system/
systemctl daemon-reload

# Enable and start service
systemctl enable kiosk-agent.service

# Ask before restarting
echo ""
read -p "Do you want to start/restart the service now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl restart kiosk-agent.service
    echo ""
    echo "Service started. Checking status..."
    sleep 2
    systemctl status kiosk-agent.service --no-pager
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Service management commands:"
echo "  systemctl start kiosk-agent    - Start the service"
echo "  systemctl stop kiosk-agent     - Stop the service"
echo "  systemctl restart kiosk-agent  - Restart the service"
echo "  systemctl status kiosk-agent   - Check service status"
echo "  journalctl -u kiosk-agent -f   - View logs"
echo ""
