# One-Click OpenClaw TEE Deployment Service

**Cycle #1 — Brain&Bots Technologies**
**Start:** 2026-02-13 (Day 1)
**Deadline:** 2026-02-15 (end of Day 3)
**Status:** 🟡 In Progress

---

## Problem

Regular people can't run a private AI assistant. Self-hosting requires Linux CLI skills. Existing hosted options (ClawHost) are just VPS — your data is visible to the host. Nobody offers OpenClaw in a TEE with verifiable privacy.

## User

1. **Primary:** Non-technical people who want a personal AI bot (starting with Boss's family)
2. **Secondary:** Privacy-conscious users, crypto-native users wanting verifiable agents

## Solution

One-click deployment of OpenClaw inside a Trusted Execution Environment. User gets a running bot connected to their Telegram in minutes, with cryptographic proof that nobody — not even us — can see their data.

## Success Criteria

- [ ] Family member can go from zero to working Telegram bot in <10 minutes
- [ ] Bot runs in TEE (or hardened VM as stepping stone)
- [ ] No CLI required by the end user
- [ ] Attestation/verification available

---

## Sprint Plan

### Day 1 — Research & Plan (Feb 13)
- [x] TEE provider research
- [x] One-click deploy landscape scan
- [x] Adjacent service UX analysis
- [x] **Pick TEE provider** → Phala Cloud (primary), Azure (enterprise Phase 2)
- [x] **Architecture doc** → Full design at `research/tee-service-design.md`
- [x] **Adjacent UX scanned** → Heroku button + Vercel speed + Railway dashboard
- [ ] **Family deployment plan** — i5 with 8GB RAM, need OS + user count from Boss
- [x] PRD finalized

### Day 2 — Execute (Feb 14)
- [ ] Provisioning scripts (spin up TEE/VM, install OpenClaw, configure)
- [ ] API key injection flow (secure, no plaintext transit)
- [ ] Telegram bot setup automation
- [ ] Landing page / deploy wizard UI
- [ ] Test: deploy a fresh instance from scratch

### Day 3 — Execute & Ship (Feb 15)
- [ ] Family pilot: deploy for 1-2 family members
- [ ] Monitoring / health check dashboard
- [ ] Attestation endpoint (if TEE)
- [ ] Documentation: how it works, security model
- [ ] Ship or kill decision

---

## Architecture

**TEE Provider: Phala Cloud** (Docker-native, full REST API, built-in attestation, per-second billing)
**Enterprise fallback: Azure Confidential VMs** (Phase 2)

```
User → Landing Page → Deploy Wizard (3 steps)
                          ↓
                    Our Provisioning API (Node.js)
                          ↓
                    Phala Cloud REST API → spin up CVM
                          ↓
                    OpenClaw Docker in Intel TDX TEE
                          ↓
                    Connected to user's Telegram
                          ↓
                    Attestation proof served to user
```

### User Flow: 3 steps, ~2 minutes
1. **Auth** — GitHub OAuth or email (10 sec)
2. **Configure** — Enter Anthropic API key + Telegram bot token (30 sec)
3. **Deploy** — We provision TEE, inject secrets, start OpenClaw (60-90 sec)

### Components to Build
1. **Deploy Wizard** — Next.js web UI (Heroku deploy-button pattern)
2. **Provisioning API** — Wraps Phala Cloud API, manages user→instance mappings
3. **OpenClaw TEE Manifest** — `openclaw-tee.json` (like Heroku's `app.json`)
4. **Dashboard** — Status, logs, restart, attestation verification
5. **"Deploy to TEE" button** — Embeddable badge for GitHub READMEs

### Components Off-Shelf
- Phala Cloud (TEE infrastructure)
- OpenClaw Docker image
- Stripe (billing)
- GitHub OAuth

### Key Design Decisions
- **Secrets never stored in plaintext** — encrypted with TEE public key before transit
- **Attestation on every deploy** — TDX quote verified against Intel PCCS
- **Billing**: Starter $5/mo, Pro $15/mo, Enterprise custom (we margin on Phala)

Full design doc: `brainandbots/research/tee-service-design.md`

---

## Family Deployment (Parallel Track)

The family setup is the first customer of this service. But it can also be done simpler as a stepping stone:

### Option A: Full service (TEE in cloud)
- Deploy via the service we're building
- Each family member gets their own bot
- Runs on cloud TEE

### Option B: Local server (Boss's i5)
- Install Proxmox/Docker on the i5
- Run OpenClaw instances for each family member
- Expose via Tailscale or Cloudflare Tunnel
- No TEE but fully self-hosted (data never leaves the house)

### Recommendation
**Do both.** Option B today for family (fastest path). Option A as the product.

---

## Open Questions
1. Which TEE provider? (research incoming)
2. Pricing model? (free tier? pay-per-bot?)
3. API key: user provides their own or we subsidize?
4. Domain: tee.brainandbot.gg? deploy.brainandbot.gg?

---

## Scrum

**Scrum Master:** McClowin 🍊
**Check-ins:** Morning + Evening
**Next check-in:** Tonight Feb 13 — Day 1 review

---

*Last updated: 2026-02-13 14:30 UTC by McClowin*
