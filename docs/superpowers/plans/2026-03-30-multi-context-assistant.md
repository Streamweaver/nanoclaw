# Multi-Context Personal Assistant System Implementation Plan

**Goal:** Build a 3-context personal assistant system (Personal, Optional Rule Games, Tech Tavern) with Telegram bots, Agentmail email, CRAAP-evaluated research, and X integration.

**Architecture:** Each context maps to one NanoClaw group with a dedicated Telegram bot as the primary interactive channel. Agentmail is integrated as a host-side webhook bridge (inbound email → message injection) plus a container-side MCP server (outbound email tools). Research runs as scheduled tasks with CRAAP evaluation criteria in the prompt. X integration uses the existing `/x-integration` skill on the Optional Rule Games group only. The Personal group serves as the system-level main group.

**Tech Stack:** NanoClaw (Node.js/TypeScript), grammy (Telegram), Agentmail SDK + agentmail-mcp, Svix (webhook verification), cloudflared (tunnel), Docker

**Branch:** `feat/multi-context-assistant`

---

## Status: Phase 1 Complete (2026-03-31)

### Completed

- [x] **Task 1: Agentmail Webhook Bridge** — `src/agentmail-bridge.ts` with Svix signature verification, message injection, body size limit. 8 tests.
- [x] **Task 2: Multi-Bot Telegram Support** — Extended `src/channels/telegram.ts` for `TELEGRAM_BOTS` JSON config with scoped JIDs (`tg:botname:chatid`). Backward compatible with single `TELEGRAM_BOT_TOKEN`. 54 tests.
- [x] **Task 3: Agentmail MCP in Container** — `agentmail-mcp` in Dockerfile, conditional MCP server registration in agent-runner, API key passthrough from host `.env`.
- [x] **Task 4: Personal Group CLAUDE.md** — `groups/telegram_personal/` with admin context, email handling, CRAAP research framework.
- [x] **Task 5: Optional Rule Games Group CLAUDE.md** — `groups/telegram_optionalrule/` with gaming focus, X management guidelines, CRAAP research.
- [x] **Task 6: Tech Tavern Group CLAUDE.md** — `groups/telegram_techtavern/` with business/AI focus, CRAAP research.
- [x] **Runtime Setup** — OneCLI installed and configured, groups registered in SQLite, cloudflared tunnel active (`hooks.flagonwiththedragon.com` → `localhost:8800`), Agentmail webhook registered.
- [x] **End-to-End Verified** — All 3 Telegram bots responding, inbound email → webhook → bridge → agent working, agents replying to emails via Agentmail MCP confirmed.

### Bug Fixes During Implementation

- Fixed Agentmail config reading from `.env` via `readEnvFile` (was only checking `process.env`)
- Fixed webhook payload parsing (`payload.message` not `payload.data`, `event_type` not `type`)
- Fixed webhook path to match Agentmail registration (`/ingest/agentmail`)
- Fixed `mcpServers` type annotation in agent-runner (`Record<string, object>` → structural type)
- Recreated cloudflared tunnel with fresh credentials after old container's credentials were lost

---

## Phase 2: Remaining Work

### Task 10: X Integration for Optional Rule Games

**Priority:** Medium
**Effort:** Config only (existing `/x-integration` skill)

Run `/x-integration` for the Optional Rule Games group. This sets up IPC handlers for X actions (post, reply, like, retweet, quote) using Playwright browser automation against the Optional Rule Games X account.

**Steps:**
- [ ] Run `/x-integration` skill
- [ ] Log into X in the Chrome profile used by Playwright
- [ ] Test drafting a tweet from Alcuin via Telegram
- [ ] Test posting a tweet

### Task 11: CRAAP Research Scheduled Tasks

**Priority:** Medium
**Effort:** Configuration via Telegram messages

Create weekly scheduled research tasks for each group. Each task spawns a fresh container, researches the topic domain, evaluates sources via CRAAP, saves a report, and sends a summary via Telegram.

**Steps:**
- [ ] Message Newton (Personal): "Schedule a weekly research digest every Monday at 9am. Search for interesting developments across science, technology, culture, and current events. Apply CRAAP criteria. Save the report to research/ and send me a summary with the top 5 findings. Use schedule_task with cron `0 9 * * 1` and context_mode `isolated`."
- [ ] Message Alcuin (Optional Rule Games): "Schedule a weekly gaming industry research digest every Wednesday at 10am. Research TTRPGs (new releases, Kickstarters, industry news), computer games (indie spotlight, major releases), and genre media. Apply CRAAP criteria. Save the report to research/ and send me a summary. Draft 2-3 potential tweets and save to x_content/. Use schedule_task with cron `0 10 * * 3` and context_mode `isolated`."
- [ ] Message Turing (Tech Tavern): "Schedule a weekly technology and AI research digest every Tuesday at 8am. Research AI developments, business tech trends, and consulting insights. Apply CRAAP criteria with extra scrutiny on AI claims. Save the report to research/ and send me a summary with actionable insights. Use schedule_task with cron `0 8 * * 2` and context_mode `isolated`."
- [ ] Verify tasks created: ask each bot "List my scheduled tasks"

### Task 12: Docker Compose for Supporting Services

**Priority:** High
**Effort:** Small

Unify OneCLI (+ Postgres) and cloudflared under a single `docker-compose.yml` at the project root. NanoClaw stays native (see ADR-002 in `docs/local/decisions.md`).

**Steps:**
- [ ] Create `docker-compose.yml` at project root with OneCLI, Postgres, and cloudflared services
- [ ] Migrate OneCLI config from `~/.onecli/docker-compose.yml` to project compose
- [ ] Add cloudflared service using `~/.cloudflared/` credentials
- [ ] Test `docker compose up -d` starts all infrastructure
- [ ] Test `npm run dev` works alongside compose services
- [ ] Test `docker compose down` tears down cleanly
- [ ] Update `docs/local/deployment.md` with final instructions

### Task 14: Cloud VM Deployment

**Priority:** Low (when ready for persistent hosting)
**Effort:** Medium

Deploy NanoClaw to a cloud VM for always-on operation. See `docs/local/deployment.md` for target architecture.

**Steps:**
- [ ] Provision a small Ubuntu VPS (e.g., DigitalOcean, Hetzner, Linode — $5-10/month)
- [ ] Install Docker + Docker Compose + Node.js 22
- [ ] Clone repo, checkout `deploy/develop` (or `deploy/main` when ready)
- [ ] Copy `.env` and `~/.cloudflared/` credentials
- [ ] `npm install && npm run build && ./container/build.sh`
- [ ] Run `/init-onecli` to set up credential vault
- [ ] Register Anthropic token in OneCLI
- [ ] Create systemd unit for `docker compose up` (OneCLI + cloudflared)
- [ ] Create systemd unit for NanoClaw (depends on infra)
- [ ] Re-register groups (or copy `store/messages.db`)
- [ ] Verify all 3 bots respond, email flows, scheduled tasks fire

### Task 13: Merge to Main

**Priority:** Low (after Phase 2 items are tested)

- [ ] Review full diff: `git diff main...feat/multi-context-assistant`
- [ ] Ensure all tests pass: `npx vitest run`
- [ ] Merge: `git checkout main && git merge feat/multi-context-assistant`
- [ ] Tag release

---

## Architecture Reference

```
                         Internet
                            │
              ┌─────────────┼──────────────┐
              │             │              │
         Telegram      Cloudflare      Agentmail
         (3 bots)      (tunnel)        (webhooks)
              │             │              │
              └─────────────┼──────────────┘
                            │
                    NanoClaw Host Process
                    ┌───────┴────────┐
                    │  Message Loop  │
                    │  IPC Watcher   │
                    │  Scheduler     │
                    │  Email Bridge  │
                    └───────┬────────┘
                            │
              ┌─────────────┼──────────────┐
              │             │              │
         Docker         Docker         Docker
         Container      Container      Container
         ┌────────┐    ┌────────┐    ┌────────┐
         │Newton  │    │Alcuin  │    │Turing  │
         │Personal│    │Opt.Rule│    │TechTav.│
         │(main)  │    │+X tools│    │        │
         │+email  │    │+email  │    │+email  │
         └────────┘    └────────┘    └────────┘
```

## Group Configuration

| Context | Bot Name | Telegram | Agentmail | JID | Role |
|---------|----------|----------|-----------|-----|------|
| Personal | Newton | @WreckingCrewAssistantBot | richminute924@agentmail.to | tg:newton:8580174170 | Main |
| Optional Rule Games | Alcuin | @OptionalRuleAssistantBot | vivaciouslocation34@agentmail.to | tg:alcuin:8580174170 | Non-main |
| Tech Tavern | Turing | @TechTavernAssistantBot | friendlyadvice566@agentmail.to | tg:turing:8580174170 | Non-main |

## Infrastructure

| Component | Detail |
|-----------|--------|
| Cloudflared tunnel | `nanoclaw` → hooks.flagonwiththedragon.com → localhost:8800 |
| Agentmail webhook | `ep_3BgwzY2E78TtNnVPsTNJqxuIeJi` |
| OneCLI | Running on localhost:10254, Anthropic secret registered |
| Container image | `nanoclaw-agent:latest` with agentmail-mcp |
| Research schedule | Mon 9am (Personal), Tue 8am (Tech Tavern), Wed 10am (Opt. Rule) |
