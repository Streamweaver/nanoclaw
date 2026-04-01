---
name: research
description: Conduct structured research using the CRAAP evaluation framework. Use when asked to research a topic, investigate trends, or when running scheduled research tasks. Spawns a subagent so the main assistant stays available.
---

# CRAAP Research

Structured research skill that evaluates sources using the CRAAP framework (Currency, Relevance, Authority, Accuracy, Purpose). Runs as a subagent to keep the main assistant responsive.

## When to use

- User asks you to research something
- Scheduled task asks you to research your domain
- You need to investigate a topic before answering

## Workflow

### 1. Dispatch a research subagent

Use `TeamCreate` to spawn a subagent with the research instructions below. Do NOT do the research yourself — delegate it so you stay available for other messages.

The subagent prompt should include:
- The research topic or domain focus areas
- Instructions to follow the methodology below
- Instructions to save the digest and send a chat summary when done

### 2. Research methodology (for the subagent)

Include these instructions in the subagent prompt:

---

**Step 1: Discover sources**

Use `WebSearch` to find 5-10 relevant sources on the topic. Use multiple search queries to get breadth. Prefer recent sources.

**Step 2: Fetch and evaluate each source**

For each source, fetch the content using `WebFetch` (or `agent-browser` for pages that need JavaScript). Then score it on each CRAAP dimension (1-5):

- **Currency** (1-5): How recent is this? Is it current enough for this domain?
- **Relevance** (1-5): How well does it address the research topic?
- **Authority** (1-5): Who wrote/published this? Are they credible in this domain?
- **Accuracy** (1-5): Is it supported by evidence? Can claims be verified?
- **Purpose** (1-5): Is this informing, persuading, or selling? Any bias?

Discard sources with an average score below 3.0.

**Step 3: Synthesize**

Write a digest that combines findings from qualifying sources. Identify key trends, areas of agreement, contradictions, and gaps.

**Step 4: Save the digest**

Write the digest to `research/YYYY-MM-DD-<slug>.md` using this format:

```markdown
---
topic: <research topic>
date: YYYY-MM-DD
sources: <number of qualifying sources>
---

# <Topic>

## Key Findings

- <finding 1>
- <finding 2>
- <finding 3>

## Sources

### <Source title>
- URL: <url>
- Published: <date or "unknown">
- Author/Publisher: <who>
- CRAAP Score: <average> (C:<n> R:<n> A:<n> Ac:<n> P:<n>)
- Summary: <2-3 sentences on what this source contributes>

## Analysis

<Synthesis connecting the sources — trends, consensus, contradictions, gaps>
```

**Step 5: Send chat summary**

Use `mcp__nanoclaw__send_message` to notify the user:

```
Research complete: <topic>
- <key finding 1>
- <key finding 2>
- <key finding 3>
Full digest: research/<filename>
```

---

## Example subagent prompt

When a user says "research the latest in AI regulation":

```
Research the latest developments in AI regulation.

Follow the CRAAP research methodology:
1. Use WebSearch to find 5-10 relevant sources
2. Fetch and evaluate each source on CRAAP dimensions (Currency, Relevance, Authority, Accuracy, Purpose) scoring 1-5 each
3. Discard sources scoring below 3.0 average
4. Synthesize findings into a digest
5. Save to research/YYYY-MM-DD-ai-regulation.md using the digest template format (YAML frontmatter with topic/date/sources, then Key Findings, Sources with CRAAP scores, and Analysis sections)
6. Send a brief summary to the chat via mcp__nanoclaw__send_message with key findings and the filename
```

## Scheduled research

For scheduled tasks, your CLAUDE.md lists domain focus areas. Use those as the research topics. Pick 1-2 focus areas per run to keep research focused and high quality.
