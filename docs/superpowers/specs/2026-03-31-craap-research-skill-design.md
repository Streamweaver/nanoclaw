# CRAAP Research Skill Design

## Summary

A container skill that gives each group's agent a structured research capability using the CRAAP evaluation framework. Research runs as a subagent (via agent teams) so the main assistant stays responsive. Triggered conversationally ("research X") or via scheduled tasks. Produces standalone digest files in `research/` and sends a brief summary to the chat.

## Components

### 1. Container Skill (`container/skills/research/SKILL.md`)

Single skill file containing:

**Invocation patterns:**
- Conversational: user asks the agent to research something
- Scheduled: agent receives a scheduled task prompt to research its domain

**Subagent workflow:**
- Agent spawns a research subagent via `TeamCreate`
- Subagent does the actual research work (search, fetch, evaluate, synthesize)
- Main agent remains available for other messages
- Subagent sends chat summary via `send_message` when done

**Research methodology:**
1. **Discover sources** — use `WebSearch` to find 5-10 relevant sources
2. **Evaluate each source** — fetch content via `WebFetch` or `agent-browser`, score against CRAAP dimensions (1-5 each):
   - Currency: How recent? Is the information up to date for this domain?
   - Relevance: How well does it relate to the research topic?
   - Authority: Who authored/published it? What are their credentials?
   - Accuracy: Is it supported by evidence? Verifiable elsewhere?
   - Purpose: Why does this exist? Inform, persuade, sell, entertain?
3. **Filter** — discard sources scoring below 3.0 average
4. **Synthesize** — write a digest combining findings from qualifying sources
5. **Save** — write digest to `research/YYYY-MM-DD-<slug>.md`
6. **Notify** — send brief summary to chat via `send_message`

**Digest file template:**

```markdown
---
topic: <research topic>
date: YYYY-MM-DD
sources: <number of qualifying sources>
---

# <Topic>

## Key Findings

<3-5 bullet point synthesis of the most important findings>

## Sources

### <Source title>
- URL: <url>
- Published: <date>
- Author/Publisher: <who>
- CRAAP Score: <average> (C:<n> R:<n> A:<n> Ac:<n> P:<n>)
- Summary: <2-3 sentence summary of what this source contributes>

### <Source title>
...

## Analysis

<Synthesis paragraph connecting the sources, identifying trends, noting gaps or contradictions>
```

**Chat summary format:**

Brief message sent to the chat when research completes:
```
Research complete: <topic>
<3-5 key findings as bullet points>
Full digest saved to research/<filename>
```

### 2. CLAUDE.md Changes

Strip detailed CRAAP methodology from all three group files. Replace with:

```
## Research

Use the research skill for research tasks. It runs as a subagent and saves results to `research/`.
```

Keep the domain-specific focus areas and the research folder reference in the Memory section. These tell the agent *what* to research — the skill handles *how*.

### 3. Scheduled Tasks

Each group gets a recurring scheduled task. Prompt:

> Research what's new in your domain focus areas. Use the research skill.

Schedule: daily via cron (e.g., `0 8 * * *` — 8am local time). Can be adjusted per group later.

Context mode: `isolated` — each research run is self-contained.

These are created once via the agents themselves (or via IPC from the main group). Not hardcoded.

## What's NOT in scope

- No new TypeScript code, MCP tools, or agent-runner changes
- No cross-group research aggregation (can be added later)
- No topic list config files (agent uses its CLAUDE.md focus areas)
- No research indexing or search (Glob/Grep on `research/` is sufficient for now)
- No helper scripts for file format enforcement

## File changes

| File | Change |
|------|--------|
| `container/skills/research/SKILL.md` | New — the research skill |
| `groups/personal/CLAUDE.md` | Strip CRAAP methodology, add skill pointer |
| `groups/optionalrule/CLAUDE.md` | Strip CRAAP methodology, add skill pointer |
| `groups/techtavern/CLAUDE.md` | Strip CRAAP methodology, add skill pointer |

## Testing

- Send "research AI regulation trends" to one bot, verify it spawns a subagent, produces a digest file, and sends a chat summary
- Verify the main assistant remains responsive while research runs
- Create a scheduled task and verify it runs and produces output
- Check digest file matches the template format
