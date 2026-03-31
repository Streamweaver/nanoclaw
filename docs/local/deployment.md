# Deployment Guide

## Development (Local / WSL2)

### Start everything
```bash
make up          # starts infra in background, NanoClaw in foreground
```

### Other commands
```bash
make infra       # start infrastructure only (no NanoClaw)
make down        # stop infrastructure containers
make restart     # stop + start everything
make logs        # tail infrastructure logs
make status      # show container status
make build       # rebuild agent container image
```

### Manual startup (if needed)
```bash
docker compose -f compose.local.yml up -d   # start infra
npm run dev                                   # start NanoClaw
```

## Production (DigitalOcean Droplet)

Not yet deployed. Target setup:

- Ubuntu VPS ($5-10/month)
- Two systemd units:
  1. `nanoclaw-infra.service` — runs `docker compose -f compose.local.yml up` for cloudflared
  2. `nanoclaw.service` — runs the NanoClaw Node.js process (depends on infra)
- Auto-restart on failure, start on boot

### Deployment steps
1. Clone repo, checkout `deploy/develop` (or `deploy/main` when ready)
2. Copy `.env` with credentials (including `CLAUDE_CODE_OAUTH_TOKEN`)
3. Copy `~/.cloudflared/` with tunnel credentials (dir must be chmod 755, files 644)
4. `npm install && npm run build && ./container/build.sh`
5. Create systemd units
6. Verify: `make up`, send test message on Telegram

### Prerequisites
- Docker + Docker Compose
- Node.js 22
- `.env` with credentials
- `~/.cloudflared/` with tunnel credentials

## Git Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Upstream mirror only. Pull from `upstream/main`, never commit directly. |
| `deploy/develop` | Active development. All local customizations and features. |
| `deploy/main` | Production (future). Created when ready to promote from develop. |

### Pulling upstream updates
```bash
git fetch upstream
git checkout main
git pull upstream main
git checkout deploy/develop
git merge main
```

### Remotes
| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `git@github.com:Streamweaver/nanoclaw.git` | Your fork |
| `upstream` | `git@github.com:qwibitai/nanoclaw.git` | Source repo |
