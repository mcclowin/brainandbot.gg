# OpenClaw One-Click / Easy Deploy Options

*Research date: 2026-02-13*

## Summary

Found **7 viable deployment options** ranging from true one-click hosted services to Ansible scripts. No Railway, Render, Fly.io, Coolify, CapRover, Portainer, Vercel, or Netlify templates found. No Terraform/Pulumi templates found. ClawHub.ai is mostly empty (JS-rendered, couldn't extract content).

---

## 1. ClawHost (clawhost.cloud) ⭐ TRUE ONE-CLICK

- **Repo:** [bfzli/clawhost](https://github.com/bfzli/clawhost) — 111 stars
- **What:** Open-source hosting platform. Select server → pay → OpenClaw live in minutes on dedicated Hetzner VPS.
- **Features:** Auto SSL (Let's Encrypt), DNS via Cloudflare, 6 global regions, SSH key mgmt, persistent volumes, billing via Polar.sh
- **Pricing:** Subscription-based (Polar.sh billing). Likely the "$49/mo hosted" service mentioned.
- **Self-hostable:** Yes, MIT licensed. You can run the whole platform yourself.
- **Ease: 5/5** — Literally one-click from a web UI
- **What's missing:** Vendor lock-in to Hetzner. Need to trust a third-party platform. No ARM support mentioned.

## 2. DigitalOcean App Platform (digitalocean-labs)

- **Repo:** [digitalocean-labs/openclaw-appplatform](https://github.com/digitalocean-labs/openclaw-appplatform) — 16 stars
- **What:** Pre-built Docker image for DO App Platform. Has a "Deploy to DigitalOcean" button.
- **Features:** 3-stage deployment (CLI-only → +ngrok Web UI → +Tailscale production). s6-overlay process supervision. All channel plugins included.
- **Ease: 4/5** — Deploy button exists, but need to configure env vars (gateway token, ngrok/Tailscale keys)
- **What's missing:** Data persistence requires DO Spaces (extra config). ngrok URL changes on restart. Official DO Marketplace listing NOT found.

## 3. OpenClaw Cloud (openperf/openclaw-cloud)

- **Repo:** [openperf/openclaw-cloud](https://github.com/openperf/openclaw-cloud) — 206 stars
- **What:** Cloud-native management platform. Deploy multiple OpenClaw agents via Docker with a web dashboard.
- **Features:** Multi-agent management, hot-swappable skills from ClawHub (700+), channel integrations (Element, Telegram, Discord), config hot-reload
- **Stack:** React 19 + Express + tRPC + MySQL/TiDB + Drizzle ORM
- **Ease: 3/5** — Docker deploy but requires MySQL, Node 22+, manual env config
- **What's missing:** No one-click deploy button. Needs DB setup. Documentation in Chinese (English available but secondary).

## 4. ClawSync (waynesutton/clawsync)

- **Repo:** [waynesutton/clawsync](https://github.com/waynesutton/clawsync) — 33 stars
- **What:** "OpenClaw for the cloud" — web-based AI agent with chat UI, skills, MCP support, multi-model routing. Built on Convex.
- **Features:** Multi-agent, agent-to-agent interaction, public chat UI, SyncBoard admin, browser automation, X/Twitter integration, file storage
- **Deploy:** `npm run deploy` → hosted on Convex (convex.site). Also supports Cloudflare CDN.
- **Ease: 3/5** — Convex simplifies backend (free tier), but many API keys needed for full features
- **What's missing:** Not true OpenClaw — it's OpenClaw-inspired. Different architecture entirely. More of a reimagination than a deployment tool.

## 5. OpenClaw Ansible Installer (Official)

- **Repo:** [openclaw/openclaw-ansible](https://github.com/openclaw/openclaw-ansible) — 293 stars
- **What:** Official automated installer. One curl command: `curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash`
- **Features:** UFW firewall, Fail2ban, Tailscale VPN, Docker, auto-updates, systemd service, multi-OS (Debian/Ubuntu/macOS)
- **Ease: 4/5** — Single command install, but requires a server/VPS already provisioned
- **What's missing:** You need to provision the server yourself first. Post-install wizard still needed (`openclaw onboard`).

## 6. OpenClaw on OrbStack (macOS)

- **Repo:** [aaajiao/openclaw-orbstack](https://github.com/aaajiao/openclaw-orbstack) — 19 stars
- **What:** One-click OpenClaw chatbot on macOS via OrbStack VM
- **Ease: 3/5** — macOS only, requires OrbStack
- **What's missing:** macOS-only. Niche use case.

## 7. OpenClaw on Termux (Android)

- **Repo:** [hillerliao/install-openclaw-on-termux](https://github.com/hillerliao/install-openclaw-on-termux) — 72 stars
- **What:** Deploy script for OpenClaw on Android via Termux
- **Ease: 2/5** — Termux is fiddly, Android limitations
- **What's missing:** Not production-grade. Phone must stay on.

## 8. OpenClaw on GCP

- **Repo:** [lktiep/OpenClawGCP](https://github.com/lktiep/OpenClawGCP) — 17 stars
- **What:** Complete guide for deploying on Google Cloud Platform
- **Ease: 2/5** — Guide, not automation. GCP complexity.
- **What's missing:** No one-click. Manual GCP setup.

---

## NOT Found (Gaps = Opportunities)

| Platform | Status | Opportunity |
|----------|--------|-------------|
| **Railway.app** | ❌ No template | High — Railway is perfect for this (Docker + persistent volume) |
| **Render** | ❌ Nothing | Medium — render.yaml would be easy to create |
| **Fly.io** | ❌ Nothing | Medium — fly.toml template would work |
| **DigitalOcean Marketplace** | ❌ Not listed (only App Platform repo) | High — 1-click droplet would be huge |
| **Coolify** | ❌ No template | High — Coolify users are exactly the target audience |
| **CapRover** | ❌ No template | Medium |
| **Portainer** | ❌ No template | Medium — docker-compose template would suffice |
| **Vercel/Netlify** | ❌ N/A | Low — OpenClaw needs persistent processes, not serverless |
| **Terraform** | ❌ Nothing | Medium — IaC crowd would love this |
| **Pulumi** | ❌ Nothing | Low priority |
| **ClawHub.ai** | ❓ Site loads but no readable content (JS-rendered) | Unknown — couldn't evaluate deployment skills |

---

## Ease Rankings (Best → Worst)

| # | Option | Ease | Notes |
|---|--------|------|-------|
| 1 | ClawHost | 5/5 | True one-click, web UI, pay and go |
| 2 | DO App Platform | 4/5 | Deploy button, some config needed |
| 3 | Ansible Installer | 4/5 | One curl command, needs server |
| 4 | OpenClaw Cloud | 3/5 | Docker but needs DB + config |
| 5 | ClawSync | 3/5 | Convex-based, not true OpenClaw |
| 6 | OrbStack (macOS) | 3/5 | macOS-only niche |
| 7 | Termux (Android) | 2/5 | Hacky, not production |
| 8 | GCP Guide | 2/5 | Manual, complex |

## Key Takeaway

The biggest gaps are **Railway, Render, Fly.io, and DigitalOcean Marketplace**. A simple `railway.json` or `render.yaml` or DO 1-click image would capture a huge audience that currently has no easy path. ClawHost is the closest to "hosted OpenClaw as a service" but it's third-party and Hetzner-locked.
