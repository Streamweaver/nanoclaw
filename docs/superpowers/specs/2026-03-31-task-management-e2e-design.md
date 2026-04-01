# Scheduled Task Management & E2E Tests

## Overview

Two changes:
1. Add `get_task_runs` MCP tool so container agents can query execution history
2. Add E2E test suite covering the scheduled task pipeline and message flow

The existing MCP tools (`schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`, `update_task`) are already implemented in `container/agent-runner/src/ipc-mcp-stdio.ts`. The IPC processing and authorization are handled in `src/ipc.ts`. This spec adds the missing piece (execution history) and validates the whole system with E2E tests.

## 1. `get_task_runs` MCP Tool

### Problem

Agents can create and manage scheduled tasks but have no way to check whether tasks actually ran, succeeded, or failed. Without execution history, agents can't self-correct, report status, or answer "did my research task run last night?"

### Design

Follow the same snapshot pattern used by `list_tasks` / `current_tasks.json`:

1. **Host side** (`src/container-runner.ts`): Add `writeTaskRunLogsSnapshot()` that writes recent run logs to `data/ipc/{group}/task_run_logs.json`. Called alongside `writeTasksSnapshot()` before each container start.

2. **Host side** (`src/db.ts`): Add `getTaskRunLogs(taskId, limit)` query function that returns the N most recent runs for a task from `task_run_logs`.

3. **Container side** (`container/agent-runner/src/ipc-mcp-stdio.ts`): Add `get_task_runs` MCP tool that reads from `/workspace/ipc/task_run_logs.json`.

### Snapshot format (`task_run_logs.json`)

```json
[
  {
    "taskId": "task-123",
    "runAt": "2026-03-31T09:00:00.000Z",
    "durationMs": 45000,
    "status": "success",
    "result": "Found 3 new articles...",
    "error": null
  }
]
```

Filtered by group (same auth model as tasks snapshot): main sees all, others see only their own group's task runs.

### Snapshot size

Write the last 10 runs per task to keep the snapshot small. Agents can request a specific task's history or all recent runs.

### MCP tool schema

```
get_task_runs:
  task_id: string (optional) - Filter to a specific task. Omit to see all recent runs.
  limit: number (optional, default 10) - Max runs to return.
```

### Files changed

| File | Change |
|------|--------|
| `src/db.ts` | Add `getTaskRunLogs(taskId?, groupFolder?, limit?)` |
| `src/container-runner.ts` | Add `writeTaskRunLogsSnapshot()`, call it next to `writeTasksSnapshot()` |
| `src/task-scheduler.ts` | Call `writeTaskRunLogsSnapshot()` before task execution |
| `src/index.ts` | Call `writeTaskRunLogsSnapshot()` before agent start (same place as `writeTasksSnapshot()`) |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | Add `get_task_runs` tool |

## 2. E2E Test Suite

### Problem

307 unit tests cover individual components well, but nothing tests the orchestration: does a task created via IPC actually get picked up by the scheduler, executed, logged, and delivered?

### Approach

Mock the container runner (no real Docker/Claude calls) but exercise everything else with real SQLite, real IPC file I/O, and real scheduler/IPC polling loops. Tests run fast (no network, no containers) while validating the integration.

### Test harness (`src/e2e/test-harness.ts`)

Provides:
- In-memory SQLite via `_initTestDatabase()`
- Temp directory for IPC files (cleaned up after each test)
- Mock `runContainerAgent` that returns configurable results
- Real `startIpcWatcher` and `startSchedulerLoop` with short poll intervals (50ms)
- Helper to write IPC files and wait for processing
- Helper to assert DB state (tasks, run logs, messages)

### Test suite 1: Scheduled task pipeline (`src/e2e/task-pipeline.test.ts`)

| Test | What it validates |
|------|-------------------|
| Create task via IPC, scheduler picks it up | IPC file -> DB task -> scheduler detects due -> container called |
| Task result logged and delivered | Container returns result -> `task_run_logs` row -> `sendMessage` called |
| Cron task reschedules after run | After execution, `next_run` updated to next cron interval |
| Interval task prevents drift | Anchors to scheduled time, not completion time |
| One-time task marks completed | After run, status = 'completed', next_run = null |
| Pause prevents execution | Paused task not picked up by scheduler even if due |
| Resume re-enables execution | Resumed task runs on next poll |
| Cancel removes task | Cancelled task deleted from DB |
| Update changes schedule | Updated schedule_value reflected in next_run |
| Script gate prevents agent wake | Script returns `{ "wakeAgent": false }` -> container not called |
| Auth: non-main can't schedule for other group | IPC file written, task not created, warning logged |
| Task run logs snapshot written | Before container start, `task_run_logs.json` contains recent runs |
| Error handling: invalid group folder | Task paused, error logged to run log |

### Test suite 2: Message flow (`src/e2e/message-flow.test.ts`)

| Test | What it validates |
|------|-------------------|
| IPC send_message routes to correct chat | Message file -> `sendMessage` called with correct JID and text |
| Auth: non-main can't message other group | Message blocked, warning logged |
| Main group can message any group | Message delivered regardless of target |
| Error files moved to errors directory | Malformed JSON -> file moved to `data/ipc/errors/` |
| Multiple messages processed in order | Files processed by name (timestamp-ordered) |

### Test suite 3: `get_task_runs` snapshot (`src/e2e/task-runs-snapshot.test.ts`)

| Test | What it validates |
|------|-------------------|
| Snapshot includes recent runs | After task execution, snapshot contains the run log entry |
| Snapshot filtered by group | Non-main group's snapshot only has their runs |
| Main group sees all runs | Main group's snapshot has runs from all groups |
| Snapshot limited to last N runs | With >10 runs, only most recent 10 appear |

### Test conventions

- Use `vi.useFakeTimers()` for scheduler timing
- Temp IPC directories via `fs.mkdtempSync()`
- Each test gets fresh DB via `_initTestDatabase()`
- Tests are independent, no shared state between tests
- Poll assertions use short retry loops (max 500ms) rather than fixed delays

### Files created

| File | Purpose |
|------|---------|
| `src/e2e/test-harness.ts` | Shared test infrastructure |
| `src/e2e/task-pipeline.test.ts` | Scheduled task E2E tests |
| `src/e2e/message-flow.test.ts` | Message routing E2E tests |
| `src/e2e/task-runs-snapshot.test.ts` | Run logs snapshot tests |

### Vitest config

Add `src/e2e/**/*.test.ts` to the include pattern (already covered by `src/**/*.test.ts` glob).

## Non-goals

- No changes to existing MCP tools (they already work)
- No new IPC action types (snapshot pattern avoids request-response complexity)
- No real container execution in tests (mock only)
- No UI for task management (agents manage via conversation)

## Dependencies

- `better-sqlite3` (existing)
- `vitest` (existing)
- No new dependencies
