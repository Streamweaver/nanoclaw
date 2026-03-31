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
    (supporting services)              (Node.js process)
    +-------------------+              +------------------+
    | onecli + postgres |              | Message loop     |
    | cloudflared       |              | IPC watcher      |
    +-------------------+              | Scheduler        |
                                       | Email bridge     |
                                       +--------+---------+
                                                |
                              +-----------------+-----------------+
                              |                 |                 |
                         Docker              Docker            Docker
                         Container           Container         Container
                         +--------+         +--------+        +--------+
                         | Newton |         | Alcuin |        | Turing |
                         |Personal|         |Opt.Rule|        |TechTav.|
                         | (main) |         |+X tools|        |        |
                         |+email  |         |+email  |        |+email  |
                         +--------+         +--------+        +--------+
```

## Component Breakdown

| Component | How It Runs | Purpose |
|-----------|-------------|---------|
| **NanoClaw** | Native Node.js (`npm run dev` local, systemd in prod) | Orchestrator — message loop, routing, spawns agent containers |
| **OneCLI + Postgres** | Docker Compose | Credential proxy — injects API keys into agent containers without exposing secrets |
| **cloudflared** | Docker Compose | Tunnel — routes `hooks.flagonwiththedragon.com` to `localhost:8800` for Agentmail webhooks |
| **Agent containers** | Spawned dynamically by NanoClaw via `docker run` | Ephemeral per-message workers running Claude Agent SDK |

## Why NanoClaw Stays Native

NanoClaw spawns agent containers by calling `docker run` via `child_process.spawn()`. Containerizing NanoClaw itself would require:

- Mounting the Docker socket (`/var/run/docker.sock`) into the container
- Translating all volume mount paths from container paths to host paths
- Giving the NanoClaw container full Docker daemon access

This adds complexity with no real benefit. NanoClaw is the orchestrator that manages containers — it doesn't benefit from being containerized itself. Supporting services (OneCLI, cloudflared) are pure infrastructure and fit naturally into Compose.

## Cloudflared Tunnel

| Setting | Value |
|---------|-------|
| Tunnel name | `nanoclaw` |
| Hostname | `hooks.flagonwiththedragon.com` |
| Target | `localhost:8800` |
| Config | `~/.cloudflared/config.yml` |
| Credentials | `~/.cloudflared/<tunnel-uuid>.json` |

## Contexts (Groups)

| Context | Bot Name | Telegram Bot | Agentmail Address | JID | Role |
|---------|----------|--------------|-------------------|-----|------|
| Personal | Newton | @WreckingCrewAssistantBot | richminute924@agentmail.to | tg:newton:8580174170 | Main |
| Optional Rule Games | Alcuin | @OptionalRuleAssistantBot | vivaciouslocation34@agentmail.to | tg:alcuin:8580174170 | Non-main |
| Tech Tavern | Turing | @TechTavernAssistantBot | friendlyadvice566@agentmail.to | tg:turing:8580174170 | Non-main |
