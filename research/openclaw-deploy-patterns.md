# OpenClaw Deploy Patterns Research

**Date:** 2026-02-14
**Purpose:** Practical patterns for headless, non-interactive OpenClaw deployment in Phala TEE

---

## TL;DR — What We Can Steal

The **coollabsio/openclaw** Docker wrapper is the gold standard. It solves exactly our problem: fully automated, zero-wizard deployment via env vars. We should fork/adapt their `configure.js` + `entrypoint.sh` pattern.

---

## 1. OpenClaw Native Features for Headless Deploy

### Non-Interactive Onboarding (Built-in)
OpenClaw supports `--non-interactive` mode:
```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```
- Also: `--json` for machine-readable output
- `openclaw agents add` supports `--non-interactive` too
- **Limitation:** Still requires running a CLI command inside the container. Not purely declarative.

### `--allow-unconfigured` Flag
The Hetzner guide uses `--allow-unconfigured` on the gateway command to bootstrap without full config. Useful for first-run but not a replacement for proper config.

### Docker Setup Script (`docker-setup.sh`)
Official script that:
- Auto-generates gateway token via `openssl rand -hex 32`
- Writes `.env` file with all config
- Builds image with optional `OPENCLAW_DOCKER_APT_PACKAGES`
- Supports `OPENCLAW_EXTRA_MOUNTS` and `OPENCLAW_HOME_VOLUME`
- **Still runs interactive onboard** (`openclaw-cli onboard --no-install-daemon`)
- Not suitable for fully automated deploy

### Config File Structure
OpenClaw writes to `~/.openclaw/openclaw.json`:
- `gateway.*` — port, bind, auth mode/token
- `agents.defaults.workspace` — workspace path
- `agents.defaults.model.primary` — default model
- `channels.telegram.botToken`, `channels.discord.token`, etc.
- `wizard.lastRunAt/Version/Commit` — wizard state tracking

### Workspace Seeding
OpenClaw seeds workspace with bootstrap files (`AGENTS.md`, `SOUL.md`, etc.) on first run via the wizard. The workspace path is configurable.

---

## 2. coollabsio/openclaw — THE Pattern to Copy 🏆

**Repo:** https://github.com/coollabsio/openclaw
**Used by:** Coolify one-click deploy (https://coolify.io/docs/services/openclaw)

### Architecture
```
┌─────────────────────────────────────────────┐
│ Docker container (coollabsio/openclaw)       │
│                                              │
│  entrypoint.sh                               │
│    1. configure.js (env vars → openclaw.json)│
│    2. openclaw doctor --fix                  │
│    3. nginx (background, basic auth)         │
│    4. exec openclaw gateway                  │
└─────────────────────────────────────────────┘
```

### Key Files
| File | Purpose |
|------|---------|
| `scripts/configure.js` | **ENV VARS → openclaw.json** — the wizard killer |
| `scripts/entrypoint.sh` | Container boot sequence |
| `Dockerfile.base` | Build openclaw from source |
| `Dockerfile` | Add nginx + config scripts |
| `nginx/default.conf` | Reverse proxy with basic auth |

### How configure.js Works (CRITICAL — study this)

**Three-layer config merge:**
1. Load `OPENCLAW_CUSTOM_CONFIG` file (if mounted at `/app/config/openclaw.json`)
2. Merge persisted config from previous runs
3. Apply env vars on top (highest priority)

**Env vars it handles:**
- `OPENCLAW_GATEWAY_TOKEN` (required, enforced)
- `OPENCLAW_GATEWAY_PORT`
- `OPENCLAW_PRIMARY_MODEL` — explicit model override
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, etc. — auto-detected
- `TELEGRAM_BOT_TOKEN` — channel config
- `DISCORD_TOKEN` — channel config
- `AUTH_USERNAME` / `AUTH_PASSWORD` — nginx basic auth
- `DEEPGRAM_API_KEY` — audio transcription
- `OPENCLAW_CUSTOM_CONFIG` — path to custom JSON base config
- `OPENCLAW_DOCKER_APT_PACKAGES` — runtime package install

**Auto-selects primary model** from first available provider key (Anthropic → OpenAI → OpenRouter → Gemini → etc.)

**Custom config injection:** Mount a full `openclaw.json` at `/app/config/openclaw.json` — it becomes the base, env vars override on top. **This is how you'd inject personality/channel config at deploy time.**

### entrypoint.sh Boot Sequence
1. Install extra apt packages if `OPENCLAW_DOCKER_APT_PACKAGES` set
2. Validate `OPENCLAW_GATEWAY_TOKEN` exists (hard fail if not)
3. Validate at least one AI provider key exists (hard fail if not)
4. Create state/workspace dirs
5. Run `configure.js` to generate `openclaw.json`
6. Run `openclaw doctor --fix` to auto-fix issues
7. Generate nginx config with optional basic auth
8. Start nginx in background
9. `exec openclaw gateway`

### Minimal Deploy Command
```bash
docker run -d \
  --name openclaw \
  -p 8080:8080 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e AUTH_PASSWORD=changeme \
  -e OPENCLAW_GATEWAY_TOKEN=my-secret-token \
  -v openclaw-data:/data \
  coollabsio/openclaw:latest
```

**That's it. No wizard. No interactive prompts.**

---

## 3. ClawPhone / Termux Patterns

**Repo:** https://github.com/marshallrichards/clawphone

### How They Handle Config
- Standard `openclaw onboard` wizard run manually after install
- No wizard skip — fully interactive
- Key workarounds: `TMPDIR` override for Termux, manual `openclaw.json` logging path config
- Run gateway in foreground (no systemd in Termux)
- Use `tmux` for session persistence

### Useful Insights
- `gateway.bind: lan` for network access (0.0.0.0)
- Logging path must be explicitly configured for non-standard environments
- TMPDIR issues in constrained environments — relevant for TEE

### Not Directly Useful
ClawPhone is manual/interactive. No automation patterns to steal. But the TMPDIR and logging workarounds matter for constrained environments like TEE.

---

## 4. Coolify One-Click Deploy

**PR #16124** rewrites the Coolify guide. Coolify now has OpenClaw as a native one-click service.

### What Coolify Does
- Select one-click service → set domain → add API key → deploy
- Auto-generates `AUTH_USERNAME`, `AUTH_PASSWORD`, `OPENCLAW_GATEWAY_TOKEN`
- Uses the `coollabsio/openclaw` image
- Handles HTTPS, volumes, networking automatically

### Key Takeaway
The complexity is entirely in the `coollabsio/openclaw` image. Coolify just provides the UI to set env vars and click deploy.

---

## 5. ClawHost

**URL:** https://clawhost.com — redirects to "Coming Soon" page
- "1-click deploy · Fully managed"
- No open source components found
- Waitlist only, not launched yet
- No useful patterns available

---

## 6. Hetzner VPS Guide Patterns

From official docs (https://docs.openclaw.ai/install/hetzner):

### Docker Compose Config Pattern
```yaml
services:
  openclaw-gateway:
    environment:
      - OPENCLAW_GATEWAY_BIND=${OPENCLAW_GATEWAY_BIND}
      - OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}
      - OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
      - GOG_KEYRING_PASSWORD=${GOG_KEYRING_PASSWORD}
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
    command: ["node", "dist/index.js", "gateway", "--bind", "${OPENCLAW_GATEWAY_BIND}", "--port", "${OPENCLAW_GATEWAY_PORT}", "--allow-unconfigured"]
```

### Key: Bake Binaries Into Image
"Installing binaries inside a running container is a trap. Anything installed at runtime will be lost on restart." — Critical for TEE where containers may restart.

---

## 7. Recommended Architecture for Phala TEE Deploy

Based on research, here's what we should build:

### Option A: Fork coollabsio/openclaw (Recommended)
1. **Base:** Use `coollabsio/openclaw` image or fork their Dockerfile
2. **Config injection:** Use their `configure.js` pattern — env vars → openclaw.json
3. **Custom config:** Mount/inject a pre-built `openclaw.json` via `OPENCLAW_CUSTOM_CONFIG`
4. **Workspace seeding:** Pre-populate `/data/workspace/` with SOUL.md, AGENTS.md, etc. in the image or via volume
5. **Channel setup:** Pass `TELEGRAM_BOT_TOKEN` as env var — configure.js handles the rest
6. **No wizard needed** — configure.js + entrypoint.sh replaces it entirely

### Option B: Use `openclaw onboard --non-interactive`
Less elegant but works. Run the non-interactive onboard in an init container or entrypoint script before starting the gateway.

### Key Env Vars for Our Deploy
```
OPENCLAW_GATEWAY_TOKEN=<auto-generated>
ANTHROPIC_API_KEY=<user-provided>
OPENCLAW_PRIMARY_MODEL=anthropic/claude-opus-4-5-20251101
TELEGRAM_BOT_TOKEN=<user-provided>
AUTH_PASSWORD=<auto-generated>
```

### Personality Injection Pattern
```
# Mount custom workspace files
-v ./custom-soul.md:/data/workspace/SOUL.md
-v ./custom-agents.md:/data/workspace/AGENTS.md

# Or mount full custom config
-v ./custom-openclaw.json:/app/config/openclaw.json
```

### What We Still Need to Build
1. **Deploy UI** — Web form that collects API key + Telegram token → generates env vars → deploys to Phala
2. **SOUL.md templates** — Pre-built personality templates users can pick
3. **Token generation** — Auto-generate OPENCLAW_GATEWAY_TOKEN and AUTH_PASSWORD
4. **Health monitoring** — Hit `openclaw health` endpoint to verify deploy success

---

## Source Links
- coollabsio/openclaw: https://github.com/coollabsio/openclaw
- configure.js: https://github.com/coollabsio/openclaw/blob/main/scripts/configure.js
- entrypoint.sh: https://github.com/coollabsio/openclaw/blob/main/scripts/entrypoint.sh
- OpenClaw Docker docs: https://docs.openclaw.ai/install/docker
- Wizard reference: https://docs.openclaw.ai/reference/wizard
- Hetzner guide: https://docs.openclaw.ai/install/hetzner
- Coolify service: https://coolify.io/docs/services/openclaw
- ClawPhone: https://github.com/marshallrichards/clawphone
- Coolify PR: https://github.com/openclaw/openclaw/pull/16124
