#!/usr/bin/env node

/**
 * destroy.js — Tear down an OpenClaw TEE instance
 * 
 * Usage:
 *   node destroy.js --cvm-id <id>
 *   node destroy.js --name <deployment-name>
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
      case '--name': opts.name = args[++i]; break;
      case '--phala-token': opts.phalaToken = args[++i]; break;
      case '--force': opts.force = true; break;
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

  // Resolve CVM ID from name if needed
  let cvmId = opts.cvmId;
  if (!cvmId && opts.name) {
    const recordPath = path.join(deploymentsDir, `${opts.name}.json`);
    if (fs.existsSync(recordPath)) {
      const record = JSON.parse(fs.readFileSync(recordPath));
      cvmId = record.cvmId;
      console.log(`Resolved ${opts.name} → CVM ${cvmId}`);
    } else {
      console.error(`❌ No deployment record for "${opts.name}"`);
      process.exit(1);
    }
  }

  if (!cvmId) {
    console.error('❌ Need --cvm-id or --name');
    process.exit(1);
  }

  if (!opts.force) {
    console.log(`⚠️  About to DESTROY CVM: ${cvmId}`);
    console.log('   This will permanently delete the instance and all data.');
    console.log('   Run with --force to confirm.');
    process.exit(0);
  }

  const phala = new PhalaClient(phalaToken);

  console.log(`🗑️  Destroying CVM ${cvmId}...`);

  // Stop first
  try {
    await phala.stopCVM(cvmId);
    console.log('   Stopped.');
  } catch (e) {
    // May already be stopped
  }

  // Delete
  try {
    await phala.deleteCVM(cvmId);
    console.log('   ✅ Deleted.');
  } catch (e) {
    console.error(`   ❌ ${e.message}`);
    process.exit(1);
  }

  // Remove local record
  if (opts.name) {
    const recordPath = path.join(deploymentsDir, `${opts.name}.json`);
    if (fs.existsSync(recordPath)) {
      fs.unlinkSync(recordPath);
      console.log(`   Removed local record.`);
    }
  }

  console.log('\n✅ CVM destroyed. All data wiped from TEE.');
}

main().catch(e => {
  console.error('💥', e.message);
  process.exit(1);
});
