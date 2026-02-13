#!/usr/bin/env node

/**
 * status.js — Check status of a deployed OpenClaw TEE instance
 * 
 * Usage:
 *   node status.js --cvm-id <id>
 *   node status.js --cvm-id <id> --attestation
 *   node status.js --list
 */

import { PhalaClient } from './phala.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deploymentsDir = path.join(__dirname, '..', 'deployments');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cvm-id': opts.cvmId = args[++i]; break;
      case '--phala-token': opts.phalaToken = args[++i]; break;
      case '--attestation': opts.attestation = true; break;
      case '--stats': opts.stats = true; break;
      case '--list': opts.list = true; break;
      default: console.error(`Unknown: ${args[i]}`); process.exit(1);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const phalaToken = opts.phalaToken || process.env.PHALA_API_TOKEN;
  
  if (!phalaToken) {
    console.error('❌ Missing --phala-token or PHALA_API_TOKEN');
    process.exit(1);
  }

  const phala = new PhalaClient(phalaToken);

  // List all deployments
  if (opts.list) {
    console.log('📋 Deployments:\n');
    
    // Local records
    if (fs.existsSync(deploymentsDir)) {
      const files = fs.readdirSync(deploymentsDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const record = JSON.parse(fs.readFileSync(path.join(deploymentsDir, f)));
        console.log(`  ${record.name}`);
        console.log(`    CVM ID: ${record.cvmId}`);
        console.log(`    Created: ${record.createdAt}`);
        console.log(`    Telegram user: ${record.telegramUser}`);
        console.log('');
      }
    }

    // Live CVMs
    console.log('🌐 Live CVMs on Phala:');
    const cvms = await phala.listCVMs();
    if (Array.isArray(cvms)) {
      for (const cvm of cvms) {
        console.log(`  ${cvm.name || cvm.id}: ${cvm.status || cvm.state || '?'}`);
      }
    } else {
      console.log('  ', JSON.stringify(cvms));
    }
    return;
  }

  if (!opts.cvmId) {
    console.error('❌ Missing --cvm-id (or use --list)');
    process.exit(1);
  }

  // Get CVM details
  console.log(`📊 Status for CVM: ${opts.cvmId}\n`);

  try {
    const cvm = await phala.getCVM(opts.cvmId);
    console.log(`  Name:    ${cvm.name || '?'}`);
    console.log(`  Status:  ${cvm.status || cvm.state || '?'}`);
    console.log(`  Created: ${cvm.created_at || '?'}`);
    console.log(`  Image:   ${cvm.image || '?'}`);
  } catch (e) {
    console.error(`  ❌ ${e.message}`);
  }

  // State
  try {
    const state = await phala.getCVMState(opts.cvmId);
    console.log(`  State:   ${JSON.stringify(state)}`);
  } catch (e) {
    // ignore
  }

  // Network
  try {
    const network = await phala.getCVMNetwork(opts.cvmId);
    console.log(`  Network: ${JSON.stringify(network)}`);
  } catch (e) {
    // ignore
  }

  // Stats
  if (opts.stats) {
    console.log('\n📈 Resource usage:');
    try {
      const stats = await phala.getCVMStats(opts.cvmId);
      console.log(`  CPU:    ${stats.cpu_usage || '?'}`);
      console.log(`  Memory: ${stats.memory_usage || '?'}`);
      console.log(`  Disk:   ${stats.disk_usage || '?'}`);
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }

  // Attestation
  if (opts.attestation) {
    console.log('\n🔒 TEE Attestation:');
    try {
      const att = await phala.getAttestation(opts.cvmId);
      console.log(`  Checksum:  ${att.checksum || att.quote_checksum || '?'}`);
      console.log(`  TEE type:  ${att.tee_type || 'Intel TDX'}`);
      console.log(`  Verified:  ${att.verified || '?'}`);
      console.log(`  Timestamp: ${att.timestamp || att.created_at || '?'}`);
      
      if (att.checksum || att.quote_checksum) {
        const cs = att.checksum || att.quote_checksum;
        console.log(`\n  Verify independently:`);
        console.log(`  curl -s https://cloud-api.phala.network/api/v1/attestations/view/${cs}`);
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

main().catch(e => {
  console.error('💥', e.message);
  process.exit(1);
});
