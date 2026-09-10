#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Chess Analyzer - One-Click Deployment Script
# Automatically pulls the latest image, cleans up old containers & dangling
# images, starts the new version, and verifies health.
# ==============================================================================

IMAGE="ghcr.io/subhajitcode/chess_coach:latest"
CONTAINER="chess-analyzer"
ENV_FILE="${HOME}/.chess_analyzer.env"
DATA_DIR="/var/data/chess_analyzer"
PORT_MAPPING="80:8000"

# Detect container engine (podman preferred on Oracle Linux, fallback to docker)
if command -v podman &>/dev/null; then
    ENGINE="podman"
elif command -v docker &>/dev/null; then
    ENGINE="docker"
else
    echo "❌ Error: Neither podman nor docker was found on this system." >&2
    exit 1
fi

echo "========================================================"
echo "🚀 Deploying Chess Analyzer with ${ENGINE}..."
echo "📦 Image: ${IMAGE}"
echo "========================================================"

# 1. Verify Environment File
if [[ ! -f "${ENV_FILE}" ]]; then
    echo "⚠️  Warning: ${ENV_FILE} not found!"
    echo "Creating a template at ${ENV_FILE}. Please edit it with your actual keys."
    cat << 'ENV_TEMPLATE' > "${ENV_FILE}"
LLM_PROVIDER=google_ai_studio
GOOGLE_AI_STUDIO_API_KEY=your_key_here
PORT=8000
DB_PATH=/app/data/chess_analyzer.db
ENV_TEMPLATE
    chmod 600 "${ENV_FILE}"
fi

# 2. Verify Data Directory
if [[ ! -d "${DATA_DIR}" ]]; then
    echo "📁 Creating data directory at ${DATA_DIR}..."
    sudo mkdir -p "${DATA_DIR}"
    sudo chown -R "$(id -u):$(id -g)" "${DATA_DIR}"
fi

# 3. Pull latest image from GitHub Container Registry
echo "⬇️  [1/4] Pulling latest container image..."
${ENGINE} pull "${IMAGE}"

# 4. Stop and remove existing container
echo "🛑 [2/4] Stopping and removing previous container..."
${ENGINE} stop "${CONTAINER}" 2>/dev/null || true
${ENGINE} rm -f "${CONTAINER}" 2>/dev/null || true

# 5. Run the new container
echo "▶️  [3/4] Launching updated container..."
${ENGINE} run -d \
    --name "${CONTAINER}" \
    --restart unless-stopped \
    -p "${PORT_MAPPING}" \
    --env-file "${ENV_FILE}" \
    -v "${DATA_DIR}:/app/data:Z" \
    "${IMAGE}"

# 6. Clean up old unused images to save disk space
echo "🧹 [4/4] Pruning old unused images..."
${ENGINE} image prune -f >/dev/null 2>&1 || true

# 7. Health Check Verification
echo "⏳ Waiting for server to initialize..."
sleep 3

HEALTH_URL="http://127.0.0.1:80/api/health"
if command -v curl &>/dev/null; then
    RESPONSE=$(curl -4 -s --max-time 5 "${HEALTH_URL}" || true)
    if [[ "${RESPONSE}" == *"\"status\":\"ok\""* ]]; then
        echo "✅ Deployment successful! Health status: OK"
        echo "🌐 App is live at: http://$(curl -4 -s ifconfig.me 2>/dev/null || echo '<server-ip>')"
    else
        echo "⚠️  Container started, but health check returned: ${RESPONSE}"
        echo "Check logs with: ${ENGINE} logs -n 30 ${CONTAINER}"
    fi
else
    echo "✅ Container started successfully."
fi
