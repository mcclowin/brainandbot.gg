#!/usr/bin/env node

/**
 * server.js — HTTP API for OpenClaw TEE deployment
 * 
 * Endpoints:
 *   POST /deploy     — Deploy new OpenClaw instance in TEE
 *   GET  /instances   — List all instances
 *   GET  /instances/:id — Get instance status
 *   GET  /instances/:id/attestation — Get TEE attestation
 *   POST /instances/:id/restart — Restart instance
 *   DELETE /instances/:id — Destroy instance
 *   GET  /health      — Health check
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PhalaClient } from './phala.js';
import { generateOpenClawConfig, generateAuthProfiles } from './openclaw-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deploymentsDir = path.join(__dirname, '..', 'deployments');
fs.mkdirSync(deploymentsDir, { recursive: true });

const PORT = process.env.PORT || 3456;
const PHALA_TOKEN = process.env.PHALA_API_TOKEN;

if (!PHALA_TOKEN) {
  console.error('❌ Set PHALA_API_TOKEN env var');
  process.exit(1);
}

const phala = new PhalaClient(PHALA_TOKEN);

// ── Helpers ──
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function loadDeployments() {
  if (!fs.existsSync(deploymentsDir)) return [];
  return fs.readdirSync(deploymentsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(deploymentsDir, f))));
}

function saveDeployment(record) {
  fs.writeFileSync(
    path.join(deploymentsDir, `${record.name}.json`),
    JSON.stringify(record, null, 2)
  );
}

// ── Route handlers ──

async function handleDeploy(req, res) {
  const body = await readBody(req);
  
  const { anthropicKey, openaiKey, telegramBotToken, telegramAllowFrom, name } = body;

  if (!anthropicKey && !openaiKey) {
    return json(res, 400, { error: 'Need anthropicKey or openaiKey' });
  }
  if (!telegramBotToken) {
    return json(res, 400, { error: 'Need telegramBotToken' });
  }
  if (!telegramAllowFrom) {
    return json(res, 400, { error: 'Need telegramAllowFrom (Telegram user ID)' });
  }

  const instanceName = name || `openclaw-${Date.now().toString(36)}`;

  try {
    // Generate configs
    const opts = { anthropicKey, openaiKey, telegramBotToken, telegramAllowFrom };
    const { config, gatewayToken } = generateOpenClawConfig(opts);
    const authProfiles = generateAuthProfiles(opts);

    const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
    const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString('base64');

    // Docker Compose
    const compose = `version: "3.8"
services:
  openclaw:
    image: node:22-slim
    working_dir: /app
    command: >
      bash -c "
        set -e;
        npm install -g openclaw@latest pnpm 2>&1 | tail -1;
        export OPENCLAW_HOME=/app/.openclaw;
        mkdir -p \\$$OPENCLAW_HOME/agents/main/agent \\$$OPENCLAW_HOME/workspace;
        echo '${configB64}' | base64 -d > \\$$OPENCLAW_HOME/openclaw.json;
        echo '${authB64}' | base64 -d > \\$$OPENCLAW_HOME/agents/main/agent/auth-profiles.json;
        chmod 600 \\$$OPENCLAW_HOME/openclaw.json \\$$OPENCLAW_HOME/agents/main/agent/auth-profiles.json;
        cat > \\$$OPENCLAW_HOME/workspace/SOUL.md << 'EOF'
# SOUL.md
You are a helpful personal AI assistant. Be concise, friendly, and proactive.
EOF
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

    // Find teepod
    const teepods = await phala.listTeepods();
    if (!teepods?.length) {
      return json(res, 503, { error: 'No TEE nodes available' });
    }

    // Provision
    const provision = await phala.provision({
      name: instanceName,
      compose,
      teepod_id: teepods[0].id,
      vcpu: 2,
      memory: 2048,
      disk_size: 10240,
    });

    // Create CVM
    let cvm;
    try {
      cvm = await phala.createCVM({ ...provision, name: instanceName });
    } catch {
      cvm = provision;
    }

    const cvmId = cvm.id || cvm.cvm_id || cvm.app_id;

    // Save record
    const record = {
      cvmId,
      name: instanceName,
      gatewayToken,
      createdAt: new Date().toISOString(),
      telegramUser: telegramAllowFrom,
      provider: 'phala',
    };
    saveDeployment(record);

    return json(res, 201, {
      ok: true,
      cvmId,
      name: instanceName,
      gatewayToken,
      message: 'Deploying... CVM will be ready in 1-3 minutes.',
    });

  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleList(req, res) {
  const local = loadDeployments();
  
  // Enrich with live status
  for (const dep of local) {
    try {
      const state = await phala.getCVMState(dep.cvmId);
      dep.liveStatus = state?.status || state?.state || 'unknown';
    } catch {
      dep.liveStatus = 'unreachable';
    }
  }

  json(res, 200, { instances: local });
}

async function handleGetInstance(res, cvmId) {
  try {
    const [cvm, state, network] = await Promise.allSettled([
      phala.getCVM(cvmId),
      phala.getCVMState(cvmId),
      phala.getCVMNetwork(cvmId),
    ]);

    json(res, 200, {
      cvm: cvm.status === 'fulfilled' ? cvm.value : null,
      state: state.status === 'fulfilled' ? state.value : null,
      network: network.status === 'fulfilled' ? network.value : null,
    });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

async function handleAttestation(res, cvmId) {
  try {
    const att = await phala.getAttestation(cvmId);
    json(res, 200, { attestation: att });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

async function handleRestart(res, cvmId) {
  try {
    await phala.restartCVM(cvmId);
    json(res, 200, { ok: true, message: 'Restarting...' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

async function handleDestroy(res, cvmId) {
  try {
    await phala.stopCVM(cvmId).catch(() => {});
    await phala.deleteCVM(cvmId);
    
    // Remove local record
    const deployments = loadDeployments();
    const dep = deployments.find(d => d.cvmId === cvmId);
    if (dep) {
      const recordPath = path.join(deploymentsDir, `${dep.name}.json`);
      if (fs.existsSync(recordPath)) fs.unlinkSync(recordPath);
    }

    json(res, 200, { ok: true, message: 'Destroyed.' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

// ── Server ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const method = req.method;
  const pathname = url.pathname;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // Routes
    if (method === 'GET' && pathname === '/health') {
      return json(res, 200, { ok: true, service: 'openclaw-tee-deploy' });
    }

    if (method === 'POST' && pathname === '/deploy') {
      return await handleDeploy(req, res);
    }

    if (method === 'GET' && pathname === '/instances') {
      return await handleList(req, res);
    }

    const instanceMatch = pathname.match(/^\/instances\/([^/]+)$/);
    if (instanceMatch) {
      const cvmId = instanceMatch[1];
      if (method === 'GET') return await handleGetInstance(res, cvmId);
      if (method === 'DELETE') return await handleDestroy(res, cvmId);
    }

    const attestMatch = pathname.match(/^\/instances\/([^/]+)\/attestation$/);
    if (attestMatch && method === 'GET') {
      return await handleAttestation(res, attestMatch[1]);
    }

    const restartMatch = pathname.match(/^\/instances\/([^/]+)\/restart$/);
    if (restartMatch && method === 'POST') {
      return await handleRestart(res, restartMatch[1]);
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 OpenClaw TEE Deploy API running on port ${PORT}`);
  console.log(`   POST /deploy — Deploy new instance`);
  console.log(`   GET  /instances — List instances`);
  console.log(`   GET  /instances/:id — Status`);
  console.log(`   GET  /instances/:id/attestation — TEE proof`);
  console.log(`   POST /instances/:id/restart`);
  console.log(`   DELETE /instances/:id — Destroy`);
});
