#!/bin/bash
set -e

OPENCLAW_HOME="${OPENCLAW_HOME:-/app/.openclaw}"
AGENT_DIR="$OPENCLAW_HOME/agents/main/agent"

# If configs are passed as base64 env vars, decode and write them
if [ -n "$OPENCLAW_CONFIG_B64" ]; then
  echo "⚙️ Writing openclaw.json from env..."
  echo "$OPENCLAW_CONFIG_B64" | base64 -d > "$OPENCLAW_HOME/openclaw.json"
  chmod 600 "$OPENCLAW_HOME/openclaw.json"
fi

if [ -n "$OPENCLAW_AUTH_B64" ]; then
  echo "🔑 Writing auth-profiles.json from env..."
  mkdir -p "$AGENT_DIR"
  echo "$OPENCLAW_AUTH_B64" | base64 -d > "$AGENT_DIR/auth-profiles.json"
  chmod 600 "$AGENT_DIR/auth-profiles.json"
fi

# Write default SOUL.md if none exists
if [ ! -f "$OPENCLAW_HOME/workspace/SOUL.md" ]; then
  mkdir -p "$OPENCLAW_HOME/workspace"
  cat > "$OPENCLAW_HOME/workspace/SOUL.md" << 'EOF'
# SOUL.md
You are a helpful personal AI assistant. Be concise, friendly, and proactive.
Respect privacy. Be honest about being an AI.
EOF
fi

# Verify config exists
if [ ! -f "$OPENCLAW_HOME/openclaw.json" ]; then
  echo "❌ No openclaw.json found. Pass OPENCLAW_CONFIG_B64 or mount config."
  exit 1
fi

echo "🚀 Starting OpenClaw gateway..."
exec openclaw gateway start --foreground
