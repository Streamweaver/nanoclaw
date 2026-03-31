# Local Architecture

Deployment-specific architecture for Scott's NanoClaw installation. For upstream project architecture, see `docs/SPEC.md` and `docs/REQUIREMENTS.md`.

## Runtime Components

```
                         Internet
                            |
              +-------------+---------------+
              |             |               |
         Telegram      Cloudflare       Agentmail
         (3 bots)      (tunnel)         (webhooks)
              |             |               |
              +-------------+---------------+
                            |
         +------------------+------------------+
         |                                     |
    Docker Compose                     NanoClaw (native)
    (compose.local.yml)                (Node.js process)
    +-------------------+              +------------------+
    | cloudflared       |              | Message loop     |
    +-------------------+              | IPC watcher      |
                                       | Scheduler        |
                                       | Email bridge     |
                                       | Credential proxy |
                                       +--------+---------+
                                                |
                              +-----------------+-----------------+
                              |                 |                 |
                         Docker              Docker            Docker
                         Container           Container         Container
                         (ephemeral)         (ephemeral)       (ephemeral)
                         +--------+         +--------+        +--------+
                         |Personal|         |Opt.Rule|        |TechTav.|
                         | (main) |         |+X tools|        |        |
                         |+email  |         |+email  |        |+email  |
                         +--------+         +--------+        +--------+
```

## Component Breakdown

| Component | How It Runs | Purpose |
|-----------|-------------|---------|
| **NanoClaw** | Native Node.js (`npm run dev` local, systemd in prod) | Orchestrator — message loop, routing, spawns agent containers |
| **Credential proxy** | Built into NanoClaw process | Reads Claude token from `.env`, injects into container API requests |
| **cloudflared** | Docker Compose (`compose.local.yml`, project name `nanocore`) | Tunnel — routes `hooks.flagonwiththedragon.com` to `host.docker.internal:8800` for Agentmail webhooks |
| **Agent containers** | Spawned dynamically by NanoClaw via `docker run` | Ephemeral per-message workers running Claude Agent SDK |

## Why NanoClaw Stays Native

NanoClaw spawns agent containers by calling `docker run` via `child_process.spawn()`. Containerizing NanoClaw itself would require:

- Mounting the Docker socket (`/var/run/docker.sock`) into the container
- Translating all volume mount paths from container paths to host paths
- Giving the NanoClaw container full Docker daemon access

This adds complexity with no real benefit. NanoClaw is the orchestrator that manages containers — it doesn't benefit from being containerized itself.

## Container Namespacing

The compose project is named `nanocore` so infrastructure containers (`nanocore-cloudflared-1`) don't collide with agent containers (`nanoclaw-<group>-<timestamp>`). NanoClaw's orphan cleanup kills `nanoclaw-*` containers on startup — the `nanocore` prefix keeps infrastructure safe.

## Cloudflared Tunnel

| Setting | Value |
|---------|-------|
| Tunnel name | `nanoclaw` |
| Hostname | `hooks.flagonwiththedragon.com` |
| Target | `host.docker.internal:8800` (container reaches NanoClaw on host) |
| Config | `~/.cloudflared/config.yml` |
| Credentials | `~/.cloudflared/<tunnel-uuid>.json` |
| Permissions | Directory: 755, files: 644 (container user `nonroot` must read them) |

## Contexts (Groups)

| Context | Telegram Bot | Agentmail Address | JID | Role |
|---------|--------------|-------------------|-----|------|
| Personal | @WreckingCrewAssistantBot | richminute924@agentmail.to | tg:newton:8580174170 | Main |
| Optional Rule Games | @OptionalRuleAssistantBot | vivaciouslocation34@agentmail.to | tg:alcuin:8580174170 | Non-main |
| Tech Tavern | @TechTavernAssistantBot | friendlyadvice566@agentmail.to | tg:turing:8580174170 | Non-main |
