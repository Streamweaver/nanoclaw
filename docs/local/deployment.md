# Deployment Guide

## Development (Local / WSL2)

### Start supporting services
```bash
docker compose -f docker-compose.yml up -d
```

### Start NanoClaw
```bash
npm run dev
```

### Stop everything
```bash
# Stop NanoClaw: Ctrl+C
docker compose -f docker-compose.yml down
```

### Rebuild agent container (after Dockerfile or agent-runner changes)
```bash
./container/build.sh
```

## Production (DigitalOcean Droplet)

Not yet deployed. Target setup:

- Ubuntu VPS ($5-10/month)
- Two systemd units:
  1. `nanoclaw-infra.service` — runs `docker compose up` for OneCLI + cloudflared
  2. `nanoclaw.service` — runs the NanoClaw Node.js process (depends on infra)
- Auto-restart on failure, start on boot

### Prerequisites
- Docker + Docker Compose
- Node.js 22
- `.env` with credentials
- `~/.cloudflared/` with tunnel credentials
- OneCLI configured with Anthropic API key

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
