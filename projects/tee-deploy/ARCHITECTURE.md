# Brain&Bot TEE Deploy — Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (Browser/Telegram)                    │
│                                                              │
│  1. Fills form: API key, Bot token, Telegram ID, [SOUL.md]  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 BRAIN&BOT BACKEND (our server)               │
│                                                              │
│  2. Generates Docker Compose with user's env vars            │
│  3. Encrypts secrets via Phala KMS                           │
│  4. Calls Phala API: POST /provision → POST /cvms            │
│  5. Returns CVM ID + status to user                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    PHALA CLOUD (TEE Provider)                 │
│                                                              │
│  6. Provisions Intel TDX enclave                             │
│  7. Pulls Docker image from ghcr.io/mcclowin/openclaw-tee   │
│  8. Injects encrypted env vars (decrypted only inside TEE)   │
│  9. Runs Docker Compose inside CVM                           │
│  10. Assigns public URL via tproxy                           │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              CVM (Confidential Virtual Machine)              │
│              Hardware-encrypted memory (TDX)                 │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │            Docker Container: openclaw-tee             │   │
│  │                                                       │   │
│  │  entrypoint.sh                                        │   │
│  │    │                                                  │   │
│  │    ├─ Validate env vars                               │   │
│  │    ├─ Generate openclaw.json from env vars            │   │
│  │    ├─ Generate auth-profiles.json from env vars       │   │
│  │    ├─ Seed SOUL.md (if provided)                      │   │
│  │    ├─ Fix permissions (chown node:node)               │   │
│  │    └─ exec node dist/index.js (start OpenClaw)        │   │
│  │                                                       │   │
│  │  OpenClaw Gateway                                     │   │
│  │    ├─ Telegram plugin ←→ Telegram API                 │   │
│  │    ├─ Agent (Claude/GPT) ←→ Anthropic/OpenAI API     │   │
│  │    └─ Workspace (SOUL.md, memory, sessions)           │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  Volume: /home/node/.openclaw (persistent across restarts)   │
│  Port: 3000 (gateway API, exposed via tproxy)                │
│                                                              │
│  Attestation: GET /api/v1/cvms/{id}/attestation              │
│  → Cryptographic proof nobody can read memory                │
└─────────────────────────────────────────────────────────────┘
```

## What We Build vs What Exists

```
┌─────────────────────────────────────┐
│         WE BUILD (Brain&Bot)        │
│                                     │
│  1. entrypoint.sh                   │  ← env vars → config (ONE file)
│  2. Dockerfile                      │  ← official OpenClaw + our entrypoint
│  3. Backend API                     │  ← takes user input, calls Phala
│  4. Landing page / deploy form      │  ← collects 3-4 fields from user
│  5. Billing (Stripe)                │  ← subscription management
│                                     │
├─────────────────────────────────────┤
│        EXISTS (we just use it)      │
│                                     │
│  • OpenClaw (the bot software)      │
│  • Phala Cloud (TEE infrastructure) │
│  • Telegram Bot API                 │
│  • Anthropic/OpenAI API             │
│  • GitHub Container Registry        │
└─────────────────────────────────────┘
```

## Docker Image: ghcr.io/mcclowin/openclaw-tee

```dockerfile
# === Our Dockerfile ===
# Build stage: compile OpenClaw from official source
FROM node:22-bookworm AS builder
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
RUN corepack enable
WORKDIR /app
COPY openclaw/ .
RUN pnpm install --frozen-lockfile
RUN pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

# Runtime stage: slim image with our entrypoint
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y su-exec && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/ui/dist ./ui/dist
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/opt/entrypoint.sh"]
```

## Docker Compose Sent to Phala

```yaml
# This is what our backend generates and sends to Phala's API
services:
  openclaw:
    image: ghcr.io/mcclowin/openclaw-tee:latest
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${encrypted_by_kms}
      - TELEGRAM_BOT_TOKEN=${encrypted_by_kms}
      - TELEGRAM_OWNER_ID=user_telegram_id
      - GATEWAY_TOKEN=${auto_generated}
      - PRIMARY_MODEL=anthropic:claude-sonnet-4-20250514
      - SOUL_MD=${optional_personality}
    volumes:
      - openclaw-data:/home/node/.openclaw
    restart: unless-stopped

volumes:
  openclaw-data:
```

## Phala API Flow (2 calls)

```
Step 1: POST /api/v1/cvms/provision
  Body: { name, compose_file: { docker_compose_file, ... }, vcpu, memory, disk_size }
  Returns: { compose_hash, ... }

Step 2: POST /api/v1/cvms
  Body: { compose_hash, name }
  Returns: { id, status, ... }

After: GET /api/v1/cvms/{id} → check status
       GET /api/v1/cvms/{id}/attestation → TEE proof
```

## Secret Flow

```
User's API key                Our Backend              Phala KMS           TEE Enclave
     │                            │                        │                    │
     │── "sk-ant-xxx" ──────────→ │                        │                    │
     │                            │── encrypt(key) ───────→│                    │
     │                            │←─ encrypted_blob ──────│                    │
     │                            │                        │                    │
     │                            │── compose(encrypted) ──────────────────────→│
     │                            │                        │                    │
     │                            │                        │── decrypt ────────→│
     │                            │                        │   (inside TEE)     │
     │                            │                        │                    │
     │                            │                        │   sk-ant-xxx       │
     │                            │                        │   (plaintext only  │
     │                            │                        │    in enclave RAM) │
```

## User Journey

```
1. User visits brainandbot.gg/deploy
2. Fills form:
   - Anthropic API key (required)
   - Telegram bot token (required, link to @BotFather)
   - Telegram user ID (required, link to @userinfobot)
   - Personality (optional, textarea or presets)
3. Clicks "Deploy" → Stripe checkout ($5/mo)
4. Payment confirmed → backend calls Phala
5. ~2 min later: bot is live on Telegram
6. User messages their bot → it responds
7. Dashboard: status, logs, restart, attestation proof
```

## Cost Structure

```
Revenue:  $5/mo per bot (Starter)
Cost:     ~$2-3/mo Phala CVM (2 vCPU, 4GB RAM, 20GB disk)
Margin:   ~$2-3/mo per user

Scale:    100 users = $500/mo revenue, ~$250 cost, ~$250 profit
          1000 users = $5000/mo revenue, ~$2500 cost, ~$2500 profit
```

## File Tree (what we ship)

```
brainandbots/projects/tee-deploy/
├── ARCHITECTURE.md          ← this file
├── PRD.md                   ← product requirements
├── image/
│   ├── Dockerfile           ← builds openclaw-tee image
│   └── entrypoint.sh        ← THE one file (env→config→start)
├── backend/
│   ├── deploy.sh            ← CLI deploy script (MVP)
│   └── server.js            ← API server (Phase 2)
└── research/
    └── openclaw-deploy-patterns.md
```
