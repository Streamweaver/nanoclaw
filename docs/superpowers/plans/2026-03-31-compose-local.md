# Unified Docker Compose for Local Development — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify OneCLI (+ Postgres) and cloudflared into a single `compose.local.yml` with a Makefile for one-command dev startup.

**Architecture:** Single compose file at project root manages all infrastructure services. NanoClaw stays native on the host. Makefile wraps compose commands and `npm run dev` for a simple dev workflow.

**Tech Stack:** Docker Compose V2, GNU Make, cloudflare/cloudflared image, ghcr.io/onecli/onecli image, postgres:18-alpine

**Spec:** `docs/superpowers/specs/2026-03-31-compose-local-design.md`

---

### Task 1: Create compose.local.yml

**Files:**
- Create: `compose.local.yml`

- [ ] **Step 1: Create the compose file**

```yaml
services:
  onecli-postgres:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-onecli}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-onecli}
      POSTGRES_DB: ${POSTGRES_DB:-onecli}
    volumes:
      - onecli_pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-onecli}"]
      interval: 5s
      timeout: 3s
      start_period: 15s
      retries: 10
    networks:
      - nanoclaw

  onecli:
    image: ghcr.io/onecli/onecli:latest
    restart: unless-stopped
    depends_on:
      onecli-postgres:
        condition: service_healthy
    ports:
      - "10254:10254"
      - "10255:10255"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-onecli}:${POSTGRES_PASSWORD:-onecli}@onecli-postgres:5432/${POSTGRES_DB:-onecli}
    volumes:
      - onecli_app-data:/app/data
    env_file:
      - path: .env
        required: false
    networks:
      - nanoclaw

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run nanoclaw
    volumes:
      - ${HOME}/.cloudflared:/home/nonroot/.cloudflared:ro
    networks:
      - nanoclaw

volumes:
  onecli_pgdata:
    external: true
  onecli_app-data:
    external: true

networks:
  nanoclaw:
    driver: bridge
```

- [ ] **Step 2: Verify compose file parses correctly**

Run: `docker compose -f compose.local.yml config --quiet`
Expected: No output (silent success)

- [ ] **Step 3: Commit**

```bash
git add compose.local.yml
git commit -m "infra: add compose.local.yml with OneCLI and cloudflared services"
```

---

### Task 2: Handle Docker volume migration

The existing OneCLI install created volumes named `onecli_pgdata` and `onecli_app-data`. The compose file references these as `external: true` so existing data carries over. If the volumes don't exist (fresh install), they need to be created.

**Files:**
- Modify: `compose.local.yml` (only if volumes need adjustment)

- [ ] **Step 1: Check existing volumes**

Run: `docker volume ls --format "{{.Name}}" | grep onecli`
Expected: `onecli_pgdata` and `onecli_app-data` listed

If both exist, skip to Step 3.

- [ ] **Step 2: Create volumes if missing (fresh install only)**

Run:
```bash
docker volume create onecli_pgdata
docker volume create onecli_app-data
```
Expected: Volume names echoed back

- [ ] **Step 3: Stop old OneCLI compose**

Run: `cd ~/.onecli && docker compose down && cd -`
Expected: Old containers stopped. Volumes are preserved (no `-v` flag).

- [ ] **Step 4: Verify volumes still exist after old compose is down**

Run: `docker volume ls --format "{{.Name}}" | grep onecli`
Expected: Both volumes still listed

---

### Task 3: Update cloudflared config

Cloudflared now runs inside a container where `localhost` means the container itself. Update the config to use `host.docker.internal` so it reaches NanoClaw on the host.

**Files:**
- Modify: `~/.cloudflared/config.yml`

- [ ] **Step 1: Update config for container paths and host.docker.internal**

The cloudflared container runs as user `nonroot` with home `/home/nonroot`. The host's `~/.cloudflared/` is mounted to `/home/nonroot/.cloudflared/`, so `credentials-file` must use the container path. And `localhost` must become `host.docker.internal` since cloudflared is now in a container.

Change `~/.cloudflared/config.yml` from:

```yaml
tunnel: nanoclaw
credentials-file: /home/streamweaver/.cloudflared/7cb6d294-e071-478f-9a3c-817f06a51b25.json

ingress:
  - hostname: hooks.flagonwiththedragon.com
    service: http://localhost:8800
  - service: http_status:404
```

to:

```yaml
tunnel: nanoclaw
credentials-file: /home/nonroot/.cloudflared/7cb6d294-e071-478f-9a3c-817f06a51b25.json

ingress:
  - hostname: hooks.flagonwiththedragon.com
    service: http://host.docker.internal:8800
  - service: http_status:404
```

Two changes: `credentials-file` path updated to container path, and `localhost` changed to `host.docker.internal`.

- [ ] **Step 2: Verify the config looks correct**

Run: `cat ~/.cloudflared/config.yml`
Expected: `credentials-file` starts with `/home/nonroot/`, ingress service uses `host.docker.internal:8800`

---

### Task 4: Update .env and .env.example

Add OneCLI environment variables to the project's `.env` so the compose file can read them.

**Files:**
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Check if OneCLI has a NEXTAUTH_SECRET already set**

Run: `cat ~/.onecli/.env 2>/dev/null | grep NEXTAUTH_SECRET || echo "not set"`

If set, note the value for Step 2. If not set, generate one:
Run: `openssl rand -base64 32`

- [ ] **Step 2: Add OneCLI section to `.env`**

Append to `.env`:

```
# --- OneCLI ---
NEXTAUTH_SECRET=<value from step 1>
POSTGRES_USER=onecli
POSTGRES_PASSWORD=onecli
POSTGRES_DB=onecli
```

- [ ] **Step 3: Add OneCLI section to `.env.example`**

Append to `.env.example`:

```
# --- OneCLI ---
NEXTAUTH_SECRET=your_nextauth_secret_here
POSTGRES_USER=onecli
POSTGRES_PASSWORD=onecli
POSTGRES_DB=onecli
```

- [ ] **Step 4: Commit .env.example update**

```bash
git add .env.example
git commit -m "config: add OneCLI env vars to .env.example"
```

---

### Task 5: Create Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create the Makefile**

```makefile
COMPOSE_FILE := compose.local.yml

.PHONY: up down restart logs infra status build

## Start infrastructure and run NanoClaw in foreground
up: infra
	npm run dev

## Start infrastructure only (OneCLI + cloudflared)
infra:
	docker compose -f $(COMPOSE_FILE) up -d
	@echo "Waiting for OneCLI to be healthy..."
	@docker compose -f $(COMPOSE_FILE) exec onecli-postgres pg_isready -U onecli -q && echo "Infrastructure ready."

## Stop infrastructure containers
down:
	docker compose -f $(COMPOSE_FILE) down

## Restart infrastructure and NanoClaw
restart: down up

## Tail infrastructure logs
logs:
	docker compose -f $(COMPOSE_FILE) logs -f

## Show container status
status:
	docker compose -f $(COMPOSE_FILE) ps

## Rebuild the agent container image
build:
	./container/build.sh
```

- [ ] **Step 2: Verify Makefile syntax**

Run: `make -n up`
Expected: Prints the commands that would run (dry run), no syntax errors

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "infra: add Makefile for dev workflow (make up/down/logs)"
```

---

### Task 6: Integration test — bring it all up

**Files:** None (verification only)

- [ ] **Step 1: Start infrastructure**

Run: `make infra`
Expected: Three containers start — `onecli-postgres`, `onecli`, `cloudflared`. Output ends with "Infrastructure ready."

- [ ] **Step 2: Verify all containers are running**

Run: `make status`
Expected: All three services show `running` (postgres shows `healthy`)

- [ ] **Step 3: Verify OneCLI is reachable**

Run: `curl -s http://localhost:10254 | head -5`
Expected: HTML or JSON response from OneCLI (not connection refused)

- [ ] **Step 4: Verify cloudflared tunnel is connected**

Run: `docker compose -f compose.local.yml logs cloudflared | grep -i "registered\|connected" | tail -3`
Expected: Log lines showing tunnel connection registered

- [ ] **Step 5: Start NanoClaw**

Run: `npm run dev` (or `make up` in a fresh terminal)
Expected: NanoClaw starts, connects to OneCLI, Telegram bots come online

- [ ] **Step 6: Verify end-to-end webhook flow**

Send a test email to one of the Agentmail addresses (e.g., `richminute924@agentmail.to`). Verify:
1. Cloudflared routes the webhook to NanoClaw on port 8800
2. NanoClaw's agentmail bridge receives and processes the message
3. The appropriate Telegram bot responds

- [ ] **Step 7: Stop everything**

Ctrl+C to stop NanoClaw, then:
Run: `make down`
Expected: All infrastructure containers stop

---

### Task 7: Update documentation

**Files:**
- Modify: `docs/local/deployment.md`
- Modify: `docs/local/decisions.md`

- [ ] **Step 1: Update deployment.md dev section**

Replace the Development section in `docs/local/deployment.md` with:

```markdown
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
```

- [ ] **Step 2: Add ADR to decisions.md**

Append to `docs/local/decisions.md`:

```markdown
---

## ADR-005: compose.local.yml for infrastructure services (2026-03-31)

**Context:** OneCLI had its own docker-compose at `~/.onecli/`, cloudflared ran as a bare CLI process. Starting and stopping the full dev environment required knowing about multiple systems in multiple locations.

**Decision:** Single `compose.local.yml` at project root manages OneCLI (+ Postgres) and cloudflared. Makefile wraps compose commands for simple `make up` / `make down` workflow. NanoClaw stays native.

**Rationale:** One command to start, one to stop. The `.local` suffix prevents collision with any future upstream `compose.yml`. External volumes reference existing OneCLI data so nothing is lost in migration.

**Alternatives considered:**
- Keep separate compose files with a wrapper script — still two files to understand
- Full dockerization including NanoClaw — rejected due to Docker-in-Docker complexity (ADR-002)
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/local/deployment.md docs/local/decisions.md
git commit -m "docs: update deployment guide and ADRs for compose.local.yml"
```
