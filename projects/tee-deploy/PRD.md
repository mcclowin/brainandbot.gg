# One-Click OpenClaw TEE Deployment Service

**Cycle #1 — Brain&Bots Technologies**
**Start:** 2026-02-13 (Day 1)
**Deadline:** 2026-02-15 (end of Day 3)
**Status:** 🟢 Core working, Phala deploy next

---

## Problem

Regular people can't run a private AI assistant. Self-hosting requires Linux CLI skills. Existing hosted options (ClawHost) are just VPS — your data is visible to the host. Nobody offers OpenClaw in a TEE with verifiable privacy.

## User

1. **Primary:** Non-technical people who want a personal AI bot (starting with Boss's family)
2. **Secondary:** Privacy-conscious users, crypto-native users wanting verifiable agents

## Solution

One-click deployment of OpenClaw inside a Trusted Execution Environment. User gets a running bot connected to their Telegram in minutes, with cryptographic proof that nobody — not even us — can see their data.

## Success Criteria

- [x] Bot runs from pre-configured env vars (no wizard needed)
- [ ] Bot runs in TEE on Phala Cloud
- [ ] Family member can go from zero to working Telegram bot in <10 minutes
- [ ] No CLI required by the end user
- [ ] Attestation/verification available

---

## Sprint Plan

### Day 1 — Research & Plan (Feb 13) ✅
- [x] TEE provider research → Phala Cloud selected
- [x] One-click deploy landscape scan
- [x] Adjacent service UX analysis (Heroku/Vercel/Railway)
- [x] Phala API key obtained and verified
- [x] age encryption set up between Boss ↔ McClowin
- [x] Docker installed on rock-5a
- [x] PRD finalized

### Day 2 — Execute (Feb 14) 🟢 MOSTLY DONE
- [x] **entrypoint.sh written** — single file, env vars → config → start
- [x] **OpenClaw Docker image built** from source on rock-5a (openclaw:local, 2.92GB)
- [x] **@abuclaw_bot running** in Docker container on rock-5a via our entrypoint
- [x] **Config schema learned** — correct field names, formats, plugin config
- [x] **Architecture documented** — full flow from user input to running CVM
- [x] **coollabsio/openclaw studied** — learned patterns, building our own
- [ ] Phala CVM deployment (next — all local testing done)
- [ ] Landing page / deploy wizard UI (Phase 2)

### Day 3 — Ship (Feb 15)
- [ ] Deploy abuclaw to Phala Cloud (first real TEE deploy)
- [ ] Publish Docker image to ghcr.io/mcclowin/openclaw-tee
- [ ] Family pilot: deploy for 1-2 family members
- [ ] Ship or kill decision

---

## Architecture

See `ARCHITECTURE.md` for full diagrams. Summary:

### What We Build

```
1. entrypoint.sh        — env vars → openclaw.json + auth-profiles.json → start
2. Dockerfile           — official OpenClaw source + our entrypoint
3. Backend API          — takes user input, calls Phala API
4. Landing page         — collects 3 fields from user
5. Stripe billing       — subscription management
```

### What Already Exists

```
• OpenClaw              — the bot software (official Docker image)
• Phala Cloud           — TEE infrastructure (REST API)
• Telegram Bot API      — messaging
• Anthropic API         — LLM
• GitHub Container Reg  — image hosting
```

### Docker Container (what runs in each CVM)

```
┌───────────────────────────────────────────────┐
│ Docker: ghcr.io/mcclowin/openclaw-tee:latest  │
│                                               │
│  entrypoint.sh (OUR code — the only addition) │
│    ├─ Validate env vars                       │
│    ├─ Create dirs + fix permissions           │
│    ├─ Generate openclaw.json from env vars    │
│    ├─ Generate auth-profiles.json             │
│    ├─ Seed SOUL.md (optional)                 │
│    └─ exec node dist/index.js gateway         │
│                                               │
│  OpenClaw Gateway (THEIR code — unmodified)   │
│    ├─ Telegram plugin ←→ Telegram API         │
│    ├─ Agent (Claude) ←→ Anthropic API         │
│    └─ Workspace (memory, sessions)            │
└───────────────────────────────────────────────┘

Env vars in:
  ANTHROPIC_API_KEY     (required)
  TELEGRAM_BOT_TOKEN    (required)
  TELEGRAM_OWNER_ID     (required)
  GATEWAY_TOKEN         (auto-generated if omitted)
  PRIMARY_MODEL         (default: claude-sonnet-4-20250514)
  SOUL_MD               (optional personality text)
```

### Phala Deploy Flow

```
POST /api/v1/cvms/provision
  → sends Docker Compose with env vars (encrypted via KMS)
  → returns compose_hash

POST /api/v1/cvms
  → sends compose_hash
  → returns CVM ID, status

GET /api/v1/cvms/{id}/attestation
  → returns TEE proof (Intel TDX quote)
```

### Secret Flow

```
User's API key → Our backend → Phala KMS encrypts → Compose file
                                                      ↓
                                              Phala CVM (TEE)
                                                      ↓
                                              KMS decrypts inside enclave
                                              (plaintext only in TEE RAM)
```

---

## What We Learned Building It (Fiddling Log)

Honest list of everything we had to fix to get abuclaw running:

| Issue | Fix | Impact on Phala Deploy |
|-------|-----|----------------------|
| No official Docker image on Docker Hub | Build from source | We publish our own image — one-time cost |
| Config field `gateway.token` deprecated | Use `gateway.auth.token` | Fixed in entrypoint.sh |
| Config field `gateway.mode: "server"` invalid | Use `mode: "local"` | Fixed in entrypoint.sh |
| Config field `gateway.bind: "0.0.0.0"` invalid | Use `bind: "lan"` | Fixed in entrypoint.sh |
| `channels.telegram.token` wrong field | Use `botToken` | Fixed in entrypoint.sh |
| `channels.telegram.owner` wrong field | Use `allowFrom: [id]` | Fixed in entrypoint.sh |
| `agents.defaults.model` string format | Use `model.primary` | Fixed in entrypoint.sh |
| Model `anthropic:X` double-namespaces | Use just model name, let OpenClaw resolve | Fixed in entrypoint.sh |
| Need `plugins.entries.telegram.enabled` | Added to generated config | Fixed in entrypoint.sh |
| Docker volume owned by root, process runs as node | Run entrypoint as root, chown, then `runuser -u node` | Fixed in entrypoint.sh |
| `su-exec` not in base image | Use `runuser` instead | Fixed in entrypoint.sh |
| `--allow-unconfigured` flag removed in latest | Use `gateway` subcommand | Fixed in entrypoint.sh |
| Port 3000 conflict with host OpenClaw | Use different port (3001) | N/A on Phala (isolated) |
| Two bot instances = Telegram 409 conflict | Only one instance per bot token | N/A on Phala (isolated) |
| auth-profiles.json needs `version: 1` + `profiles` wrapper | Match real config structure | Fixed in entrypoint.sh |

**ALL of these are now baked into entrypoint.sh.** A fresh deploy with correct env vars works first try.

---

## Phala Readiness Assessment

**Ready to deploy to Phala?** YES, with one prerequisite:

### Must do before Phala deploy:
1. **Publish Docker image** — build on x86_64 (Phala runs Intel TDX, not ARM) and push to ghcr.io
   - Option: Use GitHub Actions to build x86_64 image
   - Option: Build on Boss's laptop (x86_64) and push

### Nice to have but not blocking:
2. KMS encryption for env vars (can start without, add later)
3. Landing page (CLI deploy first)
4. Stripe billing (free pilot first)

### The one gotcha:
Our rock-5a build is ARM (aarch64). Phala runs Intel x86_64. We need an x86_64 build of the image. GitHub Actions can do this automatically.

---

## Cost Structure

```
Revenue:  $5/mo per bot (Starter)
Cost:     ~$2-3/mo Phala CVM (2 vCPU, 4GB RAM, 20GB disk)
Margin:   ~$2-3/mo per user
Budget:   $20 Phala credit (enough for ~1 month of 1 instance testing)
```

---

## File Tree

```
brainandbots/projects/tee-deploy/
├── PRD.md                  ← this file
├── ARCHITECTURE.md         ← full diagrams
├── src/
│   └── deploy.sh           ← CLI deploy script for Phala
├── test-local/
│   └── entrypoint.sh       ← THE one file (proven working)
└── research/
    └── (in parent research/)
```

---

## Full Supply Chain (How Code Gets Into the TEE)

```
┌─────────────────────────────────────────────────────────┐
│ 1. SOURCE CODE                                          │
│                                                         │
│ OpenClaw v2026.2.13 (github.com/openclaw/openclaw)      │
│   + our entrypoint.sh (github.com/mcclowin/openclaw-tee)│
└──────────────────────┬──────────────────────────────────┘
                       │ git push triggers
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2. GITHUB ACTIONS (x86_64 build)                        │
│                                                         │
│ Dockerfile does:                                        │
│   Stage 1 (builder):                                    │
│     - Start with node:22-bookworm                       │
│     - Install bun + pnpm                                │
│     - git clone openclaw v2026.2.13                     │
│     - pnpm install → pnpm build → pnpm ui:build        │
│                                                         │
│   Stage 2 (production):                                 │
│     - Start with node:22-bookworm-slim (smaller)        │
│     - Install gosu, openssl                             │
│     - Copy built OpenClaw from Stage 1                  │
│     - Copy our entrypoint.sh                            │
│                                                         │
│ Output → pushes to ghcr.io/mcclowin/openclaw-tee:latest │
└──────────────────────┬──────────────────────────────────┘
                       │ Phala pulls image from registry
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3. PHALA TEE (what actually runs inside the enclave)    │
│                                                         │
│ We send this docker-compose.yml via Phala API:          │
│                                                         │
│   services:                                             │
│     openclaw:                                           │
│       image: ghcr.io/mcclowin/openclaw-tee:latest       │
│       environment:                                      │
│         - ANTHROPIC_API_KEY=sk-ant-...                  │
│         - TELEGRAM_BOT_TOKEN=827...                     │
│         - TELEGRAM_OWNER_ID=1310278446                  │
│         - GATEWAY_TOKEN=<random>                        │
│       ports:                                            │
│         - "3000:3000"                                   │
│                                                         │
│ On boot, entrypoint.sh runs:                            │
│   1. Creates dirs OpenClaw expects                      │
│   2. Generates openclaw.json from env vars              │
│   3. Generates auth-profiles.json (Anthropic API key)   │
│   4. Drops privileges (root → node user via gosu)       │
│   5. Starts: node dist/index.js gateway                 │
│                                                         │
│ Gateway starts → connects to Telegram → polls for msgs  │
│ User sends message to bot → Claude responds             │
└─────────────────────────────────────────────────────────┘
```

### What's Ours vs What's Theirs

| Component | Owner | Role |
|-----------|-------|------|
| OpenClaw source code | openclaw/openclaw (open source) | The bot engine — unmodified |
| entrypoint.sh | Us (mcclowin/openclaw-tee) | Env vars → config → start. ~120 lines of shell |
| Dockerfile | Us (mcclowin/openclaw-tee) | Builds OpenClaw + adds our entrypoint |
| GitHub Actions | Us | Builds x86_64 image, pushes to GHCR |
| Phala Cloud | Phala Network | TEE infrastructure, pulls image, runs CVM |
| Telegram Bot API | Telegram | Messaging surface |
| Anthropic API | Anthropic | LLM backend |

### Why We Can't Use the Local Image

On rock-5a we built `openclaw:local` and ran it directly — the image was on the same machine. Phala is a remote server. It needs to **pull** the image from a public registry (GHCR, Docker Hub, etc.). If the registry package is private, Phala gets 401 unauthorized and the container never starts.

### Current Blocker

GHCR packages are **private by default**. Options:
1. Make GHCR package public (2 clicks in GitHub UI)
2. Push to Docker Hub instead (free, public by default)
3. Provide Phala with Docker registry credentials (DSTACK_DOCKER_USERNAME/PASSWORD env vars)

---

*Last updated: 2026-02-14 23:38 UTC by McClowin*
