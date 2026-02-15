#!/usr/bin/env bash
# OpenClaw TEE Deploy — Phala Cloud
# Usage: ./deploy.sh --name NAME --anthropic-key KEY --telegram-token TOKEN --telegram-owner ID
set -euo pipefail

PHALA_API="https://cloud-api.phala.network/api/v1"
PHALA_KEY=$(cat ~/.config/phala/api_key 2>/dev/null || echo "")

# --- Parse args ---
NAME="" ANTHROPIC_KEY="" TG_TOKEN="" TG_OWNER=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --name) NAME="$2"; shift 2 ;;
    --anthropic-key) ANTHROPIC_KEY="$2"; shift 2 ;;
    --telegram-token) TG_TOKEN="$2"; shift 2 ;;
    --telegram-owner) TG_OWNER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$NAME" || -z "$ANTHROPIC_KEY" || -z "$TG_TOKEN" || -z "$TG_OWNER" ]]; then
  echo "Usage: ./deploy.sh --name NAME --anthropic-key KEY --telegram-token TOKEN --telegram-owner ID"
  exit 1
fi
if [[ -z "$PHALA_KEY" ]]; then
  echo "Error: Phala API key not found at ~/.config/phala/api_key"
  exit 1
fi

echo "🚀 Deploying OpenClaw instance: $NAME"

# --- Generate OpenClaw configs ---
OPENCLAW_JSON=$(cat <<EOF
{
  "gateway": {
    "bind": "0.0.0.0",
    "port": 3000,
    "mode": "server"
  },
  "agents": {
    "defaults": {
      "model": "anthropic:claude-sonnet-4-20250514",
      "maxTokens": 8096
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "${TG_TOKEN}",
      "owner": "${TG_OWNER}"
    }
  }
}
EOF
)

AUTH_PROFILES_JSON=$(cat <<EOF
{
  "anthropic:default": {
    "provider": "anthropic",
    "mode": "token",
    "token": "${ANTHROPIC_KEY}"
  }
}
EOF
)

# --- Generate Docker Compose ---
# We base64-encode configs and inject via environment + init script
OPENCLAW_B64=$(echo "$OPENCLAW_JSON" | base64 -w0)
AUTH_PROFILES_B64=$(echo "$AUTH_PROFILES_JSON" | base64 -w0)

DOCKER_COMPOSE=$(cat <<'COMPOSE'
version: "3.8"
services:
  openclaw:
    image: openclawai/openclaw:latest
    ports:
      - "3000:3000"
    volumes:
      - openclaw-data:/home/node/.openclaw
    environment:
      - OPENCLAW_ACCEPT_TOS=yes
      - OPENCLAW_CONFIG_B64=${OPENCLAW_B64}
      - AUTH_PROFILES_B64=${AUTH_PROFILES_B64}
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        mkdir -p /home/node/.openclaw/agents/main/agent
        echo "$OPENCLAW_CONFIG_B64" | base64 -d > /home/node/.openclaw/openclaw.json
        echo "$AUTH_PROFILES_B64" | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json
        exec node dist/index.js --allow-unconfigured
    restart: unless-stopped

volumes:
  openclaw-data:
COMPOSE
)

# Substitute the actual base64 values into compose
DOCKER_COMPOSE=$(echo "$DOCKER_COMPOSE" | sed "s|\${OPENCLAW_B64}|${OPENCLAW_B64}|g" | sed "s|\${AUTH_PROFILES_B64}|${AUTH_PROFILES_B64}|g")

echo "📦 Provisioning CVM on Phala Cloud..."

# --- Step 1: Provision ---
PROVISION_PAYLOAD=$(cat <<EOF
{
  "name": "${NAME}",
  "compose_file": {
    "name": "${NAME}",
    "docker_compose_file": $(echo "$DOCKER_COMPOSE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"),
    "manifest_version": 2,
    "runner": "docker-compose",
    "features": ["kms", "tproxy-net"],
    "kms_enabled": true,
    "public_logs": false,
    "public_sysinfo": false
  },
  "vcpu": 2,
  "memory": 4096,
  "disk_size": 20
}
EOF
)

PROVISION_RESPONSE=$(curl -s -X POST "${PHALA_API}/cvms/provision" \
  -H "X-API-Key: ${PHALA_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PROVISION_PAYLOAD")

echo "Provision response: $PROVISION_RESPONSE"

# Extract needed fields
COMPOSE_HASH=$(echo "$PROVISION_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('compose_hash',''))" 2>/dev/null || echo "")

if [[ -z "$COMPOSE_HASH" ]]; then
  echo "❌ Provision failed. Response: $PROVISION_RESPONSE"
  exit 1
fi

echo "✅ Provisioned. compose_hash: $COMPOSE_HASH"

# --- Step 2: Create CVM ---
echo "🔧 Creating CVM..."

CREATE_RESPONSE=$(curl -s -X POST "${PHALA_API}/cvms" \
  -H "X-API-Key: ${PHALA_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"compose_hash\": \"${COMPOSE_HASH}\", \"name\": \"${NAME}\"}")

echo "Create response: $CREATE_RESPONSE"

CVM_ID=$(echo "$CREATE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

if [[ -z "$CVM_ID" ]]; then
  echo "❌ CVM creation failed."
  exit 1
fi

echo ""
echo "✅ OpenClaw deployed!"
echo "   CVM ID: $CVM_ID"
echo "   Name: $NAME"
echo "   Status: Starting up..."
echo ""
echo "Check status: curl -s -H 'X-API-Key: \$PHALA_KEY' ${PHALA_API}/cvms/${CVM_ID}"
