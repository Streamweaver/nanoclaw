# Architecture Decision Records

## ADR-001: Git branching strategy for upstream fork (2026-03-31)

**Context:** This is a fork of `qwibitai/nanoclaw`. We need to pull upstream updates while maintaining local customizations (multi-bot Telegram, Agentmail bridge, group configs).

**Decision:** Keep `main` as a pristine upstream mirror. All local work goes on `deploy/develop` (dev) and eventually `deploy/main` (production). The `deploy/` prefix clearly separates our branches from upstream's.

**Alternatives considered:**
- Working directly on `main` — rejected because it makes upstream merges messy
- Using `custom/` prefix — `deploy/` better reflects the intent (these are deployment branches)

---

## ADR-002: Compose for infrastructure, native NanoClaw (2026-03-31)

**Context:** NanoClaw has three types of containers to manage: infrastructure (cloudflared tunnel), credential management, and ephemeral agent containers. We considered full dockerization vs. partial.

**Decision:** Docker Compose manages cloudflared. NanoClaw runs natively (Node.js) with a built-in credential proxy and spawns agent containers directly via the Docker CLI.

**Rationale:** NanoClaw spawns agent containers via `child_process.spawn('docker', ['run', ...])` with host volume mounts. Containerizing NanoClaw would require Docker socket mounting and host-to-container path translation — added complexity with no benefit. The native credential proxy reads from `.env` and is simpler than running OneCLI (which requires its own Postgres and auth layer) for a single-user development setup.

**Alternatives considered:**
- Full dockerization (NanoClaw in a container too) — rejected due to Docker-in-Docker complexity
- OneCLI for credential management — rejected for dev; adds Postgres + auth overhead for features not needed in single-user setup. Can revisit for production if per-agent policies are needed.
- Everything separate (no compose) — rejected because cloudflared benefits from compose lifecycle management

---

## ADR-003: Rename cloudflared tunnel to `nanoclaw` (2026-03-31)

**Context:** The tunnel was previously named `wrecking-crew`, inherited from an unrelated project. This caused confusion about which project owned it.

**Decision:** Deleted and recreated the tunnel as `nanoclaw`. Updated DNS CNAME, credentials file, and config.

**Impact:** None on external routing — `hooks.flagonwiththedragon.com` still routes to `localhost:8800`. Only the tunnel name and internal credentials changed.

---

## ADR-004: Local documentation in `docs/local/` (2026-03-31)

**Context:** Upstream NanoClaw has its own `README.md` and `docs/`. We need to document deployment-specific decisions and infrastructure without conflicting with upstream.

**Decision:** Deployment-specific docs live in `docs/local/`. This directory is tracked in `deploy/*` branches but won't conflict with upstream merges since upstream doesn't have it.

---

## ADR-005: Native credential proxy over OneCLI (2026-03-31)

**Context:** OneCLI provides a containerized credential vault (with Postgres, its own auth layer, and per-agent policies). The native credential proxy reads credentials from `.env` and injects them into container API requests via a local HTTP proxy.

**Decision:** Use the native credential proxy for both development and initial production. It reads `CLAUDE_CODE_OAUTH_TOKEN` from `.env` — no external services needed.

**Rationale:** OneCLI adds three containers (app, Postgres, and its own auth bootstrapping) for features not needed in a single-user setup. The native proxy is built into NanoClaw, requires zero setup beyond putting the token in `.env`, and is portable to production without additional infrastructure.

**Alternatives considered:**
- OneCLI Agent Vault — provides per-agent policies and rate limiting, but requires Postgres and has a complex auth bootstrapping process. Worth revisiting if multi-user or per-agent credential policies are needed.

---

## ADR-006: nanocore compose project name (2026-03-31)

**Context:** NanoClaw's orphan cleanup kills containers matching the `nanoclaw-` prefix on startup. Docker Compose derives container names from the project name, and the default project name (derived from the directory) was `nanoclaw` — causing infrastructure containers to be killed on startup.

**Decision:** Set the compose project name to `nanocore`. Infrastructure containers are named `nanocore-*`, agent containers are named `nanoclaw-*`. No collision.

**Alternatives considered:**
- Filter by Docker Compose label in orphan cleanup — works but treats the symptom, not the cause. Proper namespacing is cleaner.
