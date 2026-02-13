/**
 * OpenClaw config generator
 * 
 * Generates the pre-configured config files that bypass the openclaw wizard:
 *   1. openclaw.json — main gateway config
 *   2. auth-profiles.json — API key storage
 * 
 * These get mounted into the TEE container so OpenClaw starts immediately
 * with no interactive setup required.
 */

import crypto from 'crypto';

/**
 * Generate a complete openclaw.json config
 * 
 * @param {Object} opts
 * @param {string} opts.anthropicKey - Anthropic API key
 * @param {string} [opts.openaiKey] - OpenAI API key (optional)
 * @param {string} opts.telegramBotToken - Telegram bot token
 * @param {string} opts.telegramAllowFrom - Telegram user ID to allow DMs from
 * @param {string} [opts.webhookUrl] - Webhook URL (auto-generated if not provided)
 * @param {number} [opts.port] - Gateway port (default 18789)
 */
export function generateOpenClawConfig(opts) {
  const port = opts.port || 18789;
  const gatewayToken = crypto.randomBytes(24).toString('hex');
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const config = {
    meta: {
      lastTouchedVersion: '2026.2.12',
      lastTouchedAt: new Date().toISOString(),
    },
    wizard: {
      lastRunAt: new Date().toISOString(),
      lastRunVersion: '2026.2.12',
      lastRunCommand: 'onboard',
      lastRunMode: 'local',
    },
    auth: {
      profiles: {},
    },
    agents: {
      defaults: {
        workspace: '/app/workspace',
        compaction: { mode: 'safeguard' },
        maxConcurrent: 4,
        subagents: { maxConcurrent: 8 },
      },
    },
    messages: {
      ackReactionScope: 'group-mentions',
    },
    commands: {
      native: 'auto',
      nativeSkills: 'auto',
    },
    hooks: {
      internal: {
        enabled: true,
        entries: {
          'command-logger': { enabled: true },
        },
      },
    },
    channels: {},
    gateway: {
      port,
      mode: 'local',
      bind: '0.0.0.0',  // Listen on all interfaces inside container
      auth: {
        mode: 'token',
        token: gatewayToken,
      },
      tailscale: {
        mode: 'off',
        resetOnExit: false,
      },
    },
    skills: {
      install: { nodeManager: 'pnpm' },
    },
    plugins: {
      entries: {},
    },
  };

  // Configure auth profiles
  if (opts.anthropicKey) {
    config.auth.profiles['anthropic:default'] = {
      provider: 'anthropic',
      mode: 'token',
    };
  }
  if (opts.openaiKey) {
    config.auth.profiles['openai:default'] = {
      provider: 'openai',
      mode: 'token',
    };
  }

  // Configure Telegram channel
  if (opts.telegramBotToken) {
    config.channels.telegram = {
      enabled: true,
      commands: { native: false },
      dmPolicy: 'allowlist',
      botToken: opts.telegramBotToken,
      allowFrom: [opts.telegramAllowFrom],
      groupPolicy: 'allowlist',
      streamMode: 'partial',
    };

    // If we have a webhook URL, configure it
    if (opts.webhookUrl) {
      config.channels.telegram.webhookUrl = opts.webhookUrl;
      config.channels.telegram.webhookSecret = webhookSecret;
    }

    config.plugins.entries.telegram = { enabled: true };
  }

  return { config, gatewayToken, webhookSecret };
}

/**
 * Generate auth-profiles.json for the agent
 * This is where the actual API key is stored
 */
export function generateAuthProfiles(opts) {
  const profiles = {};

  if (opts.anthropicKey) {
    profiles['anthropic:default'] = {
      type: 'token',
      provider: 'anthropic',
      token: opts.anthropicKey,
    };
  }

  if (opts.openaiKey) {
    profiles['openai:default'] = {
      type: 'token',
      provider: 'openai',
      token: opts.openaiKey,
    };
  }

  return {
    version: 1,
    profiles,
    lastGood: {},
    usageStats: {},
  };
}

/**
 * Generate the Docker Compose file for OpenClaw in TEE
 */
export function generateDockerCompose(opts) {
  const envVars = [];

  // OpenClaw expects OPENCLAW_HOME to know where config lives
  envVars.push('OPENCLAW_HOME=/app/.openclaw');

  return `version: "3.8"

services:
  openclaw:
    image: node:22-slim
    working_dir: /app
    command: >
      bash -c "
        npm install -g openclaw@latest pnpm &&
        mkdir -p /app/.openclaw/agents/main/agent /app/.openclaw/workspace &&
        openclaw gateway start --foreground
      "
    environment:
      - OPENCLAW_HOME=/app/.openclaw
      - NODE_ENV=production
    ports:
      - "18789:18789"
    volumes:
      - openclaw-data:/app/.openclaw
    restart: unless-stopped

volumes:
  openclaw-data:
`;
}

/**
 * Generate an init script that writes config files into the container
 * This runs before openclaw gateway starts
 */
export function generateInitScript(opts) {
  const { config, gatewayToken, webhookSecret } = generateOpenClawConfig(opts);
  const authProfiles = generateAuthProfiles(opts);

  const configJson = JSON.stringify(config, null, 2);
  const authJson = JSON.stringify(authProfiles, null, 2);

  return `#!/bin/bash
set -e

OPENCLAW_HOME="/app/.openclaw"
AGENT_DIR="$OPENCLAW_HOME/agents/main/agent"
WORKSPACE="$OPENCLAW_HOME/workspace"

mkdir -p "$AGENT_DIR" "$WORKSPACE"

# Write main config
cat > "$OPENCLAW_HOME/openclaw.json" << 'CONFIGEOF'
${configJson}
CONFIGEOF

# Write auth profiles (contains the actual API key)
cat > "$AGENT_DIR/auth-profiles.json" << 'AUTHEOF'
${authJson}
AUTHEOF

# Lock down permissions
chmod 600 "$AGENT_DIR/auth-profiles.json"
chmod 600 "$OPENCLAW_HOME/openclaw.json"

# Write a basic SOUL.md
cat > "$WORKSPACE/SOUL.md" << 'SOULEOF'
# SOUL.md

You are a helpful personal AI assistant. Be concise, friendly, and proactive.
Respect privacy. Be honest about being an AI.
SOULEOF

echo "✅ OpenClaw configured. Gateway token: ${gatewayToken}"
`;
}
