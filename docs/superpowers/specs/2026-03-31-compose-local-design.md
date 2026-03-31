# Design: Unified Docker Compose for Local Development

**Date:** 2026-03-31
**Status:** Approved
**Branch:** deploy/develop

## Problem

NanoClaw's infrastructure services (OneCLI credential proxy, Postgres, cloudflared tunnel) are managed separately — OneCLI has its own compose at `~/.onecli/`, cloudflared runs as a bare CLI process. This leads to confusion about what's running, how to start/stop services, and which containers belong to which project.

## Decision Summary

- Single `compose.local.yml` at project root manages all infrastructure services
- NanoClaw stays native (not containerized) — see ADR-002 in `docs/local/decisions.md`
- Makefile provides single-command dev workflow
- `.local` suffix prevents collision with any future upstream `compose.yml`

## Services

### onecli-postgres

| Setting | Value |
|---------|-------|
| Image | `postgres:18-alpine` |
| Host port | None (internal only) |
| Network | `nanoclaw` bridge |
| Healthcheck | `pg_isready` every 5s |
| Restart | `unless-stopped` |
| Volume | Named volume `onecli_pgdata` (external, reuses existing) |

No host port exposed. Only the OneCLI app service communicates with Postgres over the internal Docker network. This avoids port conflicts with other local Postgres instances.

### onecli

| Setting | Value |
|---------|-------|
| Image | `ghcr.io/onecli/onecli:latest` |
| Host ports | 10254, 10255 |
| Network | `nanoclaw` bridge |
| Depends on | `onecli-postgres` (healthy) |
| Restart | `unless-stopped` |
| Env file | `.env` (project root) |
| Volume | Named volume `onecli_app-data` (external, reuses existing) |

Credential proxy that injects API keys into agent containers at runtime. NanoClaw connects to it at `http://localhost:10254` (via host port mapping). Reads `NEXTAUTH_SECRET` and Postgres credentials from `.env`.

### cloudflared

| Setting | Value |
|---------|-------|
| Image | `cloudflare/cloudflared:latest` |
| Host ports | None (outbound tunnel only) |
| Network | `nanoclaw` bridge |
| Restart | `unless-stopped` |
| Volumes | `~/.cloudflared/` mounted read-only |
| Command | `tunnel run nanoclaw` |

Routes `hooks.flagonwiththedragon.com` to `host.docker.internal:8800`. The tunnel config (`~/.cloudflared/config.yml`) must be updated to use `host.docker.internal` instead of `localhost` since cloudflared runs inside a container.

## Network

Single `nanoclaw` bridge network. All three services join this network for internal communication (OneCLI to Postgres). Cloudflared reaches NanoClaw on the host via `host.docker.internal`.

## Configuration

### .env additions

Add OneCLI variables to the existing project `.env` under a new section:

```
# --- OneCLI ---
NEXTAUTH_SECRET=<value>
POSTGRES_USER=onecli
POSTGRES_PASSWORD=onecli
POSTGRES_DB=onecli
```

Postgres credentials use the same defaults as the original OneCLI compose. `NEXTAUTH_SECRET` should be migrated from whatever OneCLI originally generated (check `~/.onecli/.env` or OneCLI's data volume).

### .env.example update

Add the OneCLI section to `.env.example` so the template stays complete.

### cloudflared config update

`~/.cloudflared/config.yml` ingress changes from:

```yaml
ingress:
  - hostname: hooks.flagonwiththedragon.com
    service: http://localhost:8800
```

to:

```yaml
ingress:
  - hostname: hooks.flagonwiththedragon.com
    service: http://host.docker.internal:8800
```

## Makefile

Located at project root. Targets:

| Target | Behavior |
|--------|----------|
| `make up` | Start infrastructure (`docker compose -f compose.local.yml up -d`), wait for healthy services, then run NanoClaw in foreground (`npm run dev`) |
| `make down` | Stop infrastructure (`docker compose -f compose.local.yml down`) |
| `make restart` | `down` then `up` |
| `make logs` | Tail infrastructure logs (`docker compose -f compose.local.yml logs -f`) |
| `make infra` | Start only infrastructure (no NanoClaw) |
| `make status` | Show running container status |

`make up` traps SIGINT so Ctrl+C stops NanoClaw but leaves infrastructure running. `make down` is a separate explicit step.

## What Doesn't Change

- NanoClaw runs natively on the host (`npm run dev` in dev, systemd in prod)
- Agent containers are spawned dynamically by NanoClaw via `docker run`
- NanoClaw's `.env` remains the single source of config
- OneCLI URL stays `http://localhost:10254` in NanoClaw's config
- Agentmail webhook endpoint stays `hooks.flagonwiththedragon.com`

## Migration

1. Create `compose.local.yml` at project root
2. Create `Makefile` at project root
3. Add OneCLI env vars to `.env` and `.env.example`
4. Update `~/.cloudflared/config.yml` to use `host.docker.internal`
5. Verify OneCLI data carries over (compose references existing `onecli_pgdata` and `onecli_app-data` volumes as external, so no data loss)
6. Stop any running OneCLI containers from old compose (`cd ~/.onecli && docker compose down`)
7. Test `make up` brings everything up and NanoClaw connects to OneCLI
8. Test end-to-end: send email to Agentmail address, verify it routes through cloudflared tunnel to NanoClaw
9. Update `docs/local/deployment.md` with final commands

## File Inventory

| File | Action |
|------|--------|
| `compose.local.yml` | Create |
| `Makefile` | Create |
| `.env` | Add OneCLI section |
| `.env.example` | Add OneCLI section |
| `~/.cloudflared/config.yml` | Update `localhost` to `host.docker.internal` |
| `docs/local/deployment.md` | Update with `make` commands |
| `docs/local/decisions.md` | Add ADR for compose.local.yml |
