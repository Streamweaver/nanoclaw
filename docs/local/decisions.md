# Architecture Decision Records

## ADR-001: Git branching strategy for upstream fork (2026-03-31)

**Context:** This is a fork of `qwibitai/nanoclaw`. We need to pull upstream updates while maintaining local customizations (multi-bot Telegram, Agentmail bridge, group configs).

**Decision:** Keep `main` as a pristine upstream mirror. All local work goes on `deploy/develop` (dev) and eventually `deploy/main` (production). The `deploy/` prefix clearly separates our branches from upstream's.

**Alternatives considered:**
- Working directly on `main` — rejected because it makes upstream merges messy
- Using `custom/` prefix — `deploy/` better reflects the intent (these are deployment branches)

---

## ADR-002: Compose for infrastructure, native NanoClaw (2026-03-31)

**Context:** NanoClaw has three types of containers to manage: OneCLI (credential proxy + Postgres), cloudflared (tunnel), and ephemeral agent containers. We considered full dockerization vs. partial.

**Decision:** Docker Compose manages OneCLI and cloudflared. NanoClaw runs natively (Node.js) and spawns agent containers directly via the Docker CLI.

**Rationale:** NanoClaw spawns agent containers via `child_process.spawn('docker', ['run', ...])` with host volume mounts. Containerizing NanoClaw would require Docker socket mounting and host-to-container path translation for every volume mount — added complexity with no benefit.

**Alternatives considered:**
- Full dockerization (NanoClaw in a container too) — rejected due to Docker-in-Docker complexity
- Everything separate (no compose) — rejected because OneCLI and cloudflared are pure infrastructure that benefit from unified lifecycle management
- Docker Compose for dev, systemd in prod — we do both: compose defines the services, prod wraps `docker compose up` in a systemd unit

---

## ADR-003: Rename cloudflared tunnel to `nanoclaw` (2026-03-31)

**Context:** The tunnel was previously named `wrecking-crew`, inherited from an unrelated project. This caused confusion about which project owned it.

**Decision:** Deleted and recreated the tunnel as `nanoclaw`. Updated DNS CNAME, credentials file, and config.

**Impact:** None on external routing — `hooks.flagonwiththedragon.com` still routes to `localhost:8800`. Only the tunnel name and internal credentials changed.

---

## ADR-004: Local documentation in `docs/local/` (2026-03-31)

**Context:** Upstream NanoClaw has its own `README.md` and `docs/`. We need to document deployment-specific decisions and infrastructure without conflicting with upstream.

**Decision:** Deployment-specific docs live in `docs/local/`. This directory is tracked in `deploy/*` branches but won't conflict with upstream merges since upstream doesn't have it.
