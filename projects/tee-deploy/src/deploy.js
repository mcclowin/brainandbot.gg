#!/usr/bin/env node

/**
 * deploy.js — Single-click OpenClaw TEE deployment
 * 
 * Usage:
 *   node deploy.js --anthropic-key sk-ant-... --telegram-token 123:ABC --telegram-user 12345
 * 
 * What it does:
 *   1. Connects to Phala Cloud API
 *   2. Finds available TEE node
 *   3. Generates pre-configured OpenClaw config (bypasses wizard)
 *   4. Creates Docker Compose with init script
 *   5. Provisions and creates CVM
 *   6. Waits for OpenClaw to come online
 *   7. Outputs connection info + attestation
 */

import { PhalaClient } from './phala.js';
import {
  generateOpenClawConfig,
  generateAuthProfiles,
  generateInitScript,
} from './openclaw-config.js';

// ── Parse args ──
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--anthropic-key': opts.anthropicKey = args[++i]; break;
      case '--openai-key': opts.openaiKey = args[++i]; break;
      case '--telegram-token': opts.telegramBotToken = args[++i]; break;
      case '--telegram-user': opts.telegramAllowFrom = args[++i]; break;
      case '--phala-token': opts.phalaToken = args[++i]; break;
      case '--name': opts.name = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      default:
        console.error(`Unknown arg: ${args[i]}`);
        process.exit(1);
    }
  }
  return opts;
}

// ── Main deploy flow ──
async function deploy() {
  const opts = parseArgs();
  
  // Validate required params
  const phalaToken = opts.phalaToken || process.env.PHALA_API_TOKEN;
  if (!phalaToken) {
    console.error('❌ Missing --phala-token or PHALA_API_TOKEN env var');
    process.exit(1);
  }

  if (!opts.anthropicKey && !opts.openaiKey) {
    console.error('❌ Need at least one LLM key: --anthropic-key or --openai-key');
    process.exit(1);
  }

  if (!opts.telegramBotToken) {
    console.error('❌ Missing --telegram-token (get one from @BotFather)');
    process.exit(1);
  }

  if (!opts.telegramAllowFrom) {
    console.error('❌ Missing --telegram-user (your Telegram user ID)');
    process.exit(1);
  }

  const instanceName = opts.name || `openclaw-${Date.now().toString(36)}`;

  console.log('🚀 Deploying OpenClaw to TEE...');
  console.log(`   Name: ${instanceName}`);
  console.log(`   LLM: ${opts.anthropicKey ? 'Anthropic' : 'OpenAI'}`);
  console.log(`   Channel: Telegram (user ${opts.telegramAllowFrom})`);
  console.log('');

  const phala = new PhalaClient(phalaToken);

  // Step 1: Verify auth
  console.log('1️⃣  Verifying Phala Cloud auth...');
  try {
    const me = await phala.me();
    console.log(`   ✅ Logged in as: ${me.username || me.email || 'ok'}`);
  } catch (e) {
    console.error(`   ❌ Auth failed: ${e.message}`);
    process.exit(1);
  }

  // Step 2: Find available teepod
  console.log('2️⃣  Finding available TEE node...');
  const teepods = await phala.listTeepods();
  if (!teepods || teepods.length === 0) {
    console.error('   ❌ No TEE nodes available');
    process.exit(1);
  }
  const teepod = teepods[0];
  console.log(`   ✅ Using teepod: ${teepod.name || teepod.id} (${teepod.region || 'default'})`);

  // Step 3: Generate OpenClaw config
  console.log('3️⃣  Generating OpenClaw config...');
  const { config, gatewayToken } = generateOpenClawConfig(opts);
  const authProfiles = generateAuthProfiles(opts);
  const initScript = generateInitScript(opts);

  // Step 4: Build Docker Compose with embedded config
  console.log('4️⃣  Building Docker Compose...');
  
  // The compose file runs an init container that writes config,
  // then starts OpenClaw gateway
  const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString('base64');

  const compose = `version: "3.8"

services:
  openclaw:
    image: node:22-slim
    working_dir: /app
    command: >
      bash -c "
        set -e;
        echo '📦 Installing OpenClaw...';
        npm install -g openclaw@latest pnpm 2>&1 | tail -1;
        
        echo '⚙️ Writing config...';
        export OPENCLAW_HOME=/app/.openclaw;
        mkdir -p \\$$OPENCLAW_HOME/agents/main/agent \\$$OPENCLAW_HOME/workspace;
        
        echo '${configB64}' | base64 -d > \\$$OPENCLAW_HOME/openclaw.json;
        echo '${authB64}' | base64 -d > \\$$OPENCLAW_HOME/agents/main/agent/auth-profiles.json;
        chmod 600 \\$$OPENCLAW_HOME/openclaw.json;
        chmod 600 \\$$OPENCLAW_HOME/agents/main/agent/auth-profiles.json;
        
        cat > \\$$OPENCLAW_HOME/workspace/SOUL.md << 'EOF'
# SOUL.md
You are a helpful personal AI assistant. Be concise, friendly, and proactive.
Respect privacy. Be honest about being an AI.
EOF
        
        echo '🚀 Starting OpenClaw gateway...';
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

  // Dry run — just output the compose
  if (opts.dryRun) {
    console.log('\n--- DRY RUN: Docker Compose ---');
    console.log(compose);
    console.log('--- Config (redacted) ---');
    const safeConfig = JSON.parse(JSON.stringify(config));
    if (safeConfig.channels?.telegram?.botToken) safeConfig.channels.telegram.botToken = '***';
    console.log(JSON.stringify(safeConfig, null, 2));
    console.log(`\nGateway token: ${gatewayToken}`);
    return;
  }

  // Step 5: Provision on Phala
  console.log('5️⃣  Provisioning CVM on Phala Cloud...');
  
  let provisionResult;
  try {
    provisionResult = await phala.provision({
      name: instanceName,
      compose,
      teepod_id: teepod.id,
      // Resource allocation
      vcpu: 2,
      memory: 2048,  // 2GB
      disk_size: 10240,  // 10GB
    });
    console.log(`   ✅ Provisioned: ${provisionResult.id || provisionResult.app_id || 'ok'}`);
  } catch (e) {
    console.error(`   ❌ Provision failed: ${e.message}`);
    process.exit(1);
  }

  // Step 6: Create the CVM
  console.log('6️⃣  Creating CVM...');
  let cvm;
  try {
    cvm = await phala.createCVM({
      ...provisionResult,
      name: instanceName,
    });
    console.log(`   ✅ CVM created: ${cvm.id || cvm.cvm_id}`);
  } catch (e) {
    // Some API versions combine provision+create
    console.log(`   ℹ️  CVM may have been created during provision`);
    cvm = provisionResult;
  }

  const cvmId = cvm.id || cvm.cvm_id || cvm.app_id;

  // Step 7: Wait for CVM to come online
  console.log('7️⃣  Waiting for CVM to start...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000)); // 10s intervals
    try {
      const state = await phala.getCVMState(cvmId);
      const status = state?.status || state?.state || 'unknown';
      process.stdout.write(`   ⏳ Status: ${status} (${(i + 1) * 10}s)...\r`);
      if (status === 'running' || status === 'Running' || status === 'RUNNING') {
        ready = true;
        break;
      }
    } catch (e) {
      process.stdout.write(`   ⏳ Waiting... (${(i + 1) * 10}s)\r`);
    }
  }
  console.log('');

  if (!ready) {
    console.log('   ⚠️  CVM not ready after 5 minutes. It may still be starting.');
    console.log('   Check status with: node status.js --cvm-id ' + cvmId);
  } else {
    console.log('   ✅ CVM is running!');
  }

  // Step 8: Get network info
  console.log('8️⃣  Getting connection info...');
  try {
    const network = await phala.getCVMNetwork(cvmId);
    console.log(`   Public URL: ${network.public_url || network.url || 'pending...'}`);
  } catch (e) {
    console.log('   ℹ️  Network info not yet available');
  }

  // Step 9: Get attestation
  console.log('9️⃣  Fetching TEE attestation...');
  try {
    const attestation = await phala.getAttestation(cvmId);
    console.log(`   ✅ TEE attestation available`);
    console.log(`   Quote checksum: ${attestation.checksum || attestation.quote_checksum || 'ok'}`);
  } catch (e) {
    console.log('   ℹ️  Attestation not yet available (CVM may still be booting)');
  }

  // Done!
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('✅ DEPLOYMENT COMPLETE');
  console.log('═══════════════════════════════════════════');
  console.log(`CVM ID:         ${cvmId}`);
  console.log(`Name:           ${instanceName}`);
  console.log(`Gateway Token:  ${gatewayToken}`);
  console.log(`TEE Provider:   Phala Cloud (Intel TDX)`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Message your Telegram bot — it should respond!');
  console.log('  2. Check status: node status.js --cvm-id ' + cvmId);
  console.log('  3. View attestation: node status.js --cvm-id ' + cvmId + ' --attestation');
  console.log('═══════════════════════════════════════════');

  // Save deployment record
  const record = {
    cvmId,
    name: instanceName,
    gatewayToken,
    createdAt: new Date().toISOString(),
    telegramUser: opts.telegramAllowFrom,
    provider: 'phala',
  };
  
  const fs = await import('fs');
  const deployDir = new URL('../deployments', import.meta.url).pathname;
  fs.mkdirSync(deployDir, { recursive: true });
  fs.writeFileSync(
    `${deployDir}/${instanceName}.json`,
    JSON.stringify(record, null, 2)
  );
  console.log(`\nDeployment saved to deployments/${instanceName}.json`);
}

deploy().catch(e => {
  console.error('💥 Fatal:', e.message);
  process.exit(1);
});
