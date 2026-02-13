# TEE-Based One-Click OpenClaw Deployment Service — Design Document

*Research completed: 2026-02-13*

---

## Part 1: TEE Provider API Research

### 1. Azure Confidential Computing

| Aspect | Details |
|--------|---------|
| **REST API** | Full Azure Resource Manager (ARM) REST API. Create/destroy/manage VMs programmatically via `Microsoft.Compute` provider. Same API as regular VMs with confidential parameters (`securityType: ConfidentialVM`, `vTpmEnabled`, etc.) |
| **SDK/CLI** | Azure CLI (`az vm create --security-type ConfidentialVM`), Azure SDKs for Python/Go/JS/.NET/Java, Terraform `azurerm` provider, Bicep/ARM templates |
| **Pricing API** | Azure Retail Prices API (`https://prices.azure.com/api/retail/prices`) — query by SKU/meter |
| **Attestation API** | **Azure Attestation Service** — dedicated REST API for remote attestation of SGX enclaves and SEV-SNP/TDX VMs. Validates TEE quotes and returns JWT tokens with claims |
| **Auto-scaling** | Full VMSS (VM Scale Sets) support with auto-scale rules. Also AKS with confidential node pools for container workloads |
| **Regions** | 20+ regions globally (US East/West/Central, EU West/North, Asia, etc.) |
| **Billing** | Per-second billing. Pay-as-you-go, Reserved Instances (1yr/3yr), Spot VMs. No TEE surcharge beyond VM cost |
| **VM Types** | DCasv5/DCesv5 (general), ECasv5/ECesv5 (memory), NCCadsH100v5 (GPU TEE). AMD SEV-SNP & Intel TDX |
| **Verdict** | **Most mature enterprise option.** Full API parity with regular VMs. Rich attestation service. Best for production scale. |

### 2. GCP Confidential Computing

| Aspect | Details |
|--------|---------|
| **REST API** | Standard Compute Engine API with `confidentialInstanceConfig.enableConfidentialCompute: true` flag. Same API surface as regular GCE VMs |
| **SDK/CLI** | `gcloud compute instances create --confidential-compute`, Google Cloud client libraries for all major languages, Terraform `google` provider |
| **Pricing API** | GCP Cloud Billing API, SKU-level pricing via Catalog API |
| **Attestation API** | Integrated with Confidential Space for multi-party attestation. vTPM-based attestation via `go-tpm` libraries. Less polished than Azure's dedicated attestation service |
| **Auto-scaling** | Managed Instance Groups (MIGs) with auto-scaling. GKE with Confidential GKE Nodes |
| **Regions** | 15+ regions (most major GCP regions support N2D/C3 confidential types) |
| **Billing** | Per-second billing. On-demand, Committed Use Discounts (1yr/3yr), Spot/Preemptible. Small premium (~5-10%) over standard VMs |
| **VM Types** | N2D (AMD SEV), C2D (AMD SEV-SNP), C3 (Intel TDX), A3 with H100 GPU TEE |
| **Verdict** | **Strong second choice.** Excellent for orgs already on GCP. Confidential Space is unique for multi-party computation. GPU TEE support. |

### 3. AWS Nitro Enclaves

| Aspect | Details |
|--------|---------|
| **REST API** | **No direct enclave API.** You create a standard EC2 instance (normal EC2 API), then use the Nitro CLI *inside* the instance to create enclaves. Two-step process: EC2 API → SSH in → `nitro-cli run-enclave` |
| **SDK/CLI** | `nitro-cli` (runs on the parent EC2 instance only), AWS Nitro Enclaves SDK (C library for KMS integration). No remote enclave management API |
| **Pricing API** | Standard EC2 pricing (no additional enclave charge). AWS Price List API |
| **Attestation API** | PCR-based attestation via Nitro Hypervisor. Integrated with AWS KMS key policies (condition keys for enclave measurements). No standalone attestation service |
| **Auto-scaling** | EC2 Auto Scaling for parent instances, but enclave lifecycle managed inside each instance separately |
| **Regions** | All AWS regions (Nitro-based instances are ubiquitous) |
| **Billing** | Standard EC2 billing (per-second). No enclave surcharge. Reserved/Spot/On-demand |
| **Verdict** | **Worst fit for one-click deploy.** Enclaves are a sub-VM concept — no persistent storage, no networking, no SSH. Requires custom app architecture. Not a "just deploy Docker" solution. |

### 4. Phala Network (Phala Cloud)

| Aspect | Details |
|--------|---------|
| **REST API** | ✅ **Full REST API** at `https://cloud-api.phala.network/docs` (Swagger/OpenAPI). Endpoints for: create/delete/start/stop CVMs, get logs, get attestation, manage env vars, upgrade images |
| **SDK/CLI** | `phala` CLI (npm package). Commands: `phala deploy`, `phala cvms get/delete/stop/start/logs/attestation`. Supports CI/CD pipelines. Device-flow auth + API tokens |
| **Pricing API** | Dashboard-based pricing. Second-level billing. Plans visible on dashboard |
| **Attestation API** | ✅ Built-in. `phala cvms attestation <name>` returns TDX attestation report. dstack SDK provides `get_quote()` for in-TEE attestation. Verification tooling included |
| **Auto-scaling** | No auto-scaling (single CVM instances). Manual scaling by deploying more CVMs |
| **Regions** | Limited (appears to be a few clusters, not multi-region like hyperscalers) |
| **Billing** | Second-level billing. Pay-as-you-go. Crypto payments supported. Web2-style pricing model |
| **Tech** | Intel TDX via dstack framework. Docker Compose deployment. CVM = Confidential Virtual Machine |
| **Deploy Flow** | `npm install -g phala` → `phala login` → `phala deploy -c docker-compose.yml -n myapp -e KEY=val` — **3 commands to running TEE app** |
| **Verdict** | ⭐ **BEST FIT for OpenClaw one-click deploy.** Purpose-built for exactly this use case. Docker-native, full API, built-in attestation, CLI-first, simple billing. The only provider where "deploy a Docker app in TEE" is the primary product. |

### 5. EigenCloud

| Aspect | Details |
|--------|---------|
| **Status** | **Could not find public documentation or API.** Web searches return no official docs site. May be in private beta or may be a component of the broader EigenLayer ecosystem. Not ready for building on |
| **Verdict** | ❌ **Not viable — no public API or docs found.** Skip for now, revisit if they launch publicly |

### 6. Fleek

| Aspect | Details |
|--------|---------|
| **Status** | Fleek has pivoted to "AI model optimization" (fleek.sh). Previous Fleek.xyz was a web3 hosting platform (IPFS/static sites). No TEE compute offering found. Their docs domain redirects to the new AI product |
| **Verdict** | ❌ **Not a TEE provider.** Different product category entirely |

### 7. Marlin Oyster

| Aspect | Details |
|--------|---------|
| **Status** | Docs site (`docs.marlin.org`) loads but renders empty (JavaScript-heavy SPA). Marlin is a decentralized protocol for TEE compute. Oyster is their serverless TEE product using AWS Nitro Enclaves on a decentralized operator network |
| **Architecture** | Decentralized: operators run Nitro-enclave nodes, users submit jobs via smart contracts. Payment in POND/MPOND tokens |
| **API** | Smart-contract based job submission. CLI tools exist but poorly documented. No REST API for VM management |
| **Verdict** | ⚠️ **Interesting but immature.** Decentralized TEE compute is compelling for crypto-native users but the developer experience and documentation are not production-ready |

---

## Part 2: Adjacent Service UX Analysis

### UX Patterns Summary

| Service | Steps to Deploy | Auth Method | Secrets Handling | Key UX Innovation |
|---------|----------------|-------------|-----------------|-------------------|
| **Railway** | 3 clicks (GitHub → select repo → deploy) | GitHub OAuth | Env vars in UI, shared across services | Visual canvas showing service topology |
| **Render** | 4 clicks (connect repo → select branch → set env → deploy) | GitHub/GitLab OAuth | Env groups (shareable across services), secret files | "Blueprint" YAML for reproducible infra |
| **Fly.io** | 3 commands (`fly launch` → auto-detect → deploy) | CLI auth via browser | `fly secrets set KEY=val`, encrypted at rest | CLI-first, global edge deployment, `fly.toml` config |
| **Vercel** | 2 clicks (import repo → deploy) | GitHub/GitLab/Bitbucket OAuth | Environment variables per environment (preview/prod/dev) | Zero-config framework detection, instant preview URLs per PR |
| **Heroku** | 1 click (deploy button in README) | GitHub OAuth or Heroku account | Config vars in dashboard, `app.json` manifest | **"Deploy to Heroku" button** — the original one-click pattern |
| **DigitalOcean App Platform** | 4 clicks (create app → connect repo → configure → deploy) | GitHub/GitLab OAuth, Docker registry | Env vars + encrypted secrets, app-level and component-level | Marketplace with pre-built apps, cost estimator before deploy |
| **Coolify** | Self-hosted install, then 3 clicks | Self-managed auth | Env vars stored on your server | Self-hosted PaaS, full control, open-source |

### Detailed UX Observations

#### Railway — The Visual Canvas
- **Onboarding**: Sign up with GitHub → land on empty project canvas → click "New Service" → pick template or repo
- **Best idea**: The **visual canvas** where you see all services (DB, app, worker) as connected nodes. Drag to add, click to configure
- **Secrets**: Click service → Variables tab → add key/value. Can reference other services' vars with `${{service.VAR}}`
- **Monitoring**: Built-in logs, metrics, deploy history per service. Real-time log streaming

#### Vercel — The Gold Standard
- **Onboarding**: Import Git repo → Vercel auto-detects framework → sets build command → deploys. Total: ~60 seconds
- **Best idea**: **Instant preview deployments** on every git push. Each PR gets a unique URL. Production deploys on merge to main
- **Secrets**: Environment variables scoped to Production/Preview/Development. Can mark as "Sensitive" (hidden after save)
- **Monitoring**: Speed Insights, Web Analytics, function logs. Clean dashboard with deployment timeline

#### Heroku — The Deploy Button Pattern
- **The pattern**: Repository contains `app.json` with metadata + env var definitions → README has "Deploy to Heroku" button badge → user clicks → lands on form pre-filled from `app.json` → fills in required env vars → clicks "Deploy" → app running
- **`app.json` example**:
```json
{
  "name": "My App",
  "description": "A cool app",
  "env": {
    "API_KEY": {
      "description": "Your API key for the service",
      "required": true
    },
    "DEBUG": {
      "description": "Enable debug mode",
      "value": "false"
    }
  },
  "addons": ["heroku-postgresql:mini"]
}
```
- **Best idea**: The **declarative app manifest** that defines what env vars are needed with descriptions and defaults. Users just fill in the blanks

#### Fly.io — CLI-First
- **Onboarding**: `brew install flyctl` → `fly auth signup` (opens browser) → `cd myapp && fly launch` (auto-detects Dockerfile/framework, provisions resources) → `fly deploy`
- **Best idea**: `fly launch` **auto-detection** — scans your project, generates `fly.toml`, provisions infra, all from one command
- **Secrets**: `fly secrets set DATABASE_URL=postgres://...` — encrypted, injected as env vars at runtime
- **Monitoring**: `fly logs`, `fly status`, `fly dashboard` (opens web UI)

### Key UX Patterns to Steal

1. **Heroku's Deploy Button** — One URL that launches a pre-configured deploy form. Perfect for OpenClaw
2. **Vercel's zero-config detection** — Auto-detect what the user needs and configure it
3. **Railway's visual canvas** — Show the user their infrastructure visually
4. **Fly.io's CLI-first with web fallback** — Power users get CLI, beginners get dashboard
5. **Heroku's `app.json` manifest** — Declarative "what this app needs" specification

---

## Part 3: Architecture Recommendation

### Recommended TEE Provider: Phala Cloud (Primary) + Azure (Enterprise Tier)

**Why Phala Cloud as primary:**
1. **Purpose-built for this exact use case** — Deploy Docker apps in TEE
2. **Full REST API** — Create/manage CVMs programmatically (Swagger docs available)
3. **CLI with API tokens** — Perfect for automation and CI/CD
4. **Docker Compose native** — OpenClaw already runs in Docker; zero adaptation needed
5. **Built-in attestation** — Both CLI and SDK for TEE proof verification
6. **Simple billing** — Second-level, pay-as-you-go, no cloud account setup
7. **Crypto-native** — Aligns with the OpenClaw/AI agent ecosystem's web3 leanings
8. **Low barrier** — No AWS/Azure/GCP account needed. Sign up → deploy

**Why Azure as enterprise tier (Phase 2):**
- For users who need specific regions, compliance, or GPU TEE
- Full API parity with their existing Azure infrastructure
- Azure Attestation Service is the most mature

### The Ideal User Flow

```
┌─────────────────────────────────────────────────────────┐
│                   LANDING PAGE                          │
│                                                         │
│   "Run OpenClaw in a Trusted Execution Environment"     │
│   "Your AI agent's keys never leave encrypted memory"   │
│                                                         │
│   [ Deploy Now → ]        [ Learn More ]                │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│              STEP 1: AUTHENTICATE (10 sec)              │
│                                                         │
│   [ Sign in with GitHub ]  [ Sign in with Email ]       │
│   [ Connect Wallet ]  (optional, for crypto billing)    │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│              STEP 2: CONFIGURE (30 sec)                 │
│                                                         │
│   Instance Name: [my-openclaw-agent]                    │
│                                                         │
│   ── Required Secrets ──                                │
│   Anthropic API Key: [sk-ant-...]  (or OpenAI, etc.)    │
│   Telegram Bot Token: [123456:ABC...]                   │
│                                                         │
│   ── Optional ──                                        │
│   Plan: [ Starter $5/mo ▾ ]                             │
│   Region: [ Auto (nearest) ▾ ]                          │
│                                                         │
│   🔒 Secrets are encrypted and injected directly into   │
│      the TEE. We never see them in plaintext.           │
│                                                         │
│   [ Deploy to TEE → ]                                   │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│              STEP 3: DEPLOYING (60-90 sec)              │
│                                                         │
│   ⟳ Provisioning TEE...              ✓                  │
│   ⟳ Injecting encrypted secrets...   ✓                  │
│   ⟳ Starting OpenClaw...             ✓                  │
│   ⟳ Verifying attestation...         ✓                  │
│                                                         │
│   ✅ Your OpenClaw agent is running!                    │
│                                                         │
│   Attestation proof: [View TEE Certificate]             │
│   Dashboard: [Open Dashboard →]                         │
│   Telegram: @your_bot is now active                     │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│              DASHBOARD                                  │
│                                                         │
│   Status: 🟢 Running    Uptime: 4h 23m                 │
│   TEE: Intel TDX (verified)                             │
│   CPU: 12%   Memory: 340MB/2GB                          │
│                                                         │
│   [Logs] [Restart] [Update Secrets] [Destroy]           │
│                                                         │
│   Attestation: Valid ✓  Last verified: 2 min ago        │
│   Next billing: $4.23 remaining of $5.00/mo             │
└─────────────────────────────────────────────────────────┘
```

**Total: 3 steps, ~2 minutes from zero to running OpenClaw in TEE.**

### What We Need to Build

#### 1. OpenClaw TEE Manifest (`openclaw-tee.json`)
Like Heroku's `app.json` — declares what the deployment needs:
```json
{
  "name": "OpenClaw Agent",
  "description": "Your personal AI agent running in a Trusted Execution Environment",
  "image": "ghcr.io/openclaw/openclaw:latest",
  "env": {
    "ANTHROPIC_API_KEY": {
      "description": "Your Anthropic API key (sk-ant-...)",
      "required": false,
      "sensitive": true
    },
    "OPENAI_API_KEY": {
      "description": "Your OpenAI API key",
      "required": false,
      "sensitive": true
    },
    "TELEGRAM_BOT_TOKEN": {
      "description": "Telegram bot token from @BotFather",
      "required": true,
      "sensitive": true
    },
    "OPENCLAW_MODEL": {
      "description": "Default model to use",
      "value": "anthropic/claude-sonnet-4-20250514"
    }
  },
  "resources": {
    "cpu": 2,
    "memory": "2GB",
    "storage": "10GB"
  },
  "ports": [8080],
  "healthcheck": "/health"
}
```

#### 2. Provisioning API Layer (Backend)
A lightweight API service that wraps the Phala Cloud API:

```
POST /api/deploy          — Create new OpenClaw CVM
GET  /api/instances/:id   — Get instance status
POST /api/instances/:id/restart
POST /api/instances/:id/secrets  — Update env vars
DELETE /api/instances/:id  — Destroy
GET  /api/instances/:id/attestation — Get & verify TEE proof
GET  /api/instances/:id/logs
GET  /api/instances/:id/metrics
```

**Tech stack**: Node.js/Bun service, calls Phala Cloud API with our platform API token. Stores user→instance mappings in SQLite/Postgres.

#### 3. Web Dashboard (Frontend)
- Landing page with "Deploy Now" CTA
- Auth (GitHub OAuth / email / wallet connect)
- Deploy wizard (the 3-step flow above)
- Instance dashboard (status, logs, metrics, attestation)
- Billing management

**Tech stack**: Next.js or Astro, deployed on Vercel/Cloudflare.

#### 4. "Deploy to TEE" Button
Embeddable button (like Heroku's) for GitHub READMEs:

```markdown
[![Deploy to TEE](https://openclaw-deploy.example.com/button.svg)](https://openclaw-deploy.example.com/deploy?repo=openclaw/openclaw&ref=main)
```

### How to Handle Key Concerns

#### API Key Injection
1. User enters keys in our web UI over HTTPS
2. Our backend **never stores keys in plaintext** — they're encrypted with the TEE's public key before transmission
3. Keys are passed as environment variables to the Phala CVM via their API
4. Inside the TEE, keys exist only in encrypted memory
5. **Attestation proves** the TEE is genuine before keys are injected
6. Flow: `User → HTTPS → Our API → Phala API (TLS) → TEE env vars → encrypted memory`

**Advanced (Phase 2)**: Use Phala's dstack SDK `get_key()` for deterministic key derivation inside TEE, eliminating the need to transmit user keys at all for some use cases.

#### Attestation Verification
1. On every deploy, automatically fetch the TDX attestation quote via `phala cvms attestation`
2. Verify the quote against Intel's attestation service (PCCS)
3. Display verification status prominently in dashboard
4. Provide a public attestation URL that anyone can verify independently
5. **Continuous attestation**: Re-verify periodically (every hour) and alert on failure

```
Attestation Chain:
Intel TDX Hardware → TDX Quote → Phala Attestation Service → Our Verification → User Dashboard
```

#### Monitoring
- **Logs**: Stream from Phala API (`phala cvms logs`)
- **Metrics**: CPU/memory from CVM status endpoint
- **Uptime**: Periodic health checks against the OpenClaw health endpoint
- **Alerts**: Email/Telegram notification if instance goes down
- Use our own OpenClaw instance to monitor other instances (dogfooding!)

#### Billing
**Phase 1 (MVP)**: 
- Simple tiered plans: Starter ($5/mo), Pro ($15/mo), Enterprise (custom)
- Stripe for payment processing
- We pay Phala, user pays us (margin model)
- Monthly billing with usage tracking

**Phase 2**:
- Pay-per-second billing passthrough
- Crypto payments (USDC/ETH) for web3 users
- Auto-suspend on payment failure (with 24h grace period)
- Cost estimation before deploy

### Implementation Phases

#### Phase 1 — MVP (4-6 weeks)
- [ ] Provisioning API wrapping Phala Cloud
- [ ] Basic web UI (deploy wizard + dashboard)
- [ ] GitHub OAuth
- [ ] Environment variable injection
- [ ] Attestation display
- [ ] Log viewing
- [ ] Stripe billing (2-3 fixed plans)

#### Phase 2 — Polish (4-6 weeks)
- [ ] "Deploy to TEE" button for GitHub READMEs
- [ ] CLI tool (`openclaw-cloud deploy`)
- [ ] Custom domain support
- [ ] Automatic updates (new OpenClaw versions)
- [ ] Usage-based billing
- [ ] Multi-instance support

#### Phase 3 — Scale (ongoing)
- [ ] Azure backend option for enterprise
- [ ] GPU TEE instances for local model inference
- [ ] Multi-region deployment
- [ ] Team/org accounts
- [ ] Marketplace for OpenClaw plugins/skills
- [ ] Self-hosted option (bring your own TEE infrastructure)

---

## Appendix: Provider Comparison Matrix

| Feature | Phala Cloud | Azure CC | GCP CC | AWS Nitro | Marlin |
|---------|:-----------:|:--------:|:------:|:---------:|:------:|
| REST API for VM management | ✅ | ✅ | ✅ | ❌¹ | ❌² |
| Docker-native deploy | ✅ | ⚠️³ | ⚠️³ | ❌ | ⚠️ |
| Built-in attestation API | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| No cloud account required | ✅ | ❌ | ❌ | ❌ | ✅ |
| CLI tooling | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Simple billing | ✅ | ❌⁴ | ❌⁴ | ❌⁴ | ⚠️ |
| GPU TEE | ❌ | ✅ | ✅ | ❌ | ❌ |
| Multi-region | ❌ | ✅ | ✅ | ✅ | ❌ |
| Enterprise compliance | ⚠️ | ✅ | ✅ | ✅ | ❌ |

¹ Enclaves managed inside EC2, not via API  
² Smart-contract based, not REST  
³ Requires full VM setup + Docker install, not native  
⁴ Complex cloud billing, requires account setup  

---

## TL;DR Recommendation

**Build on Phala Cloud** as the primary backend. It's the only provider that offers "deploy Docker in TEE" as a first-class product with a full REST API. Model the UX after **Heroku's deploy button + Vercel's zero-config wizard**. Start with a simple web dashboard and 3-step deploy flow. Add Azure as an enterprise option in Phase 2.

The winning formula: **Phala's TEE infrastructure + Heroku's deploy-button UX + Vercel's speed = one-click OpenClaw in TEE.**
