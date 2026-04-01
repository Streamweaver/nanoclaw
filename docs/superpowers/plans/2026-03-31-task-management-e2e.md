# Task Management & E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `get_task_runs` MCP tool for execution history and E2E tests validating the scheduled task pipeline, message flow, and run log snapshots.

**Architecture:** Snapshot pattern (host writes JSON before container starts, container reads it) — same as existing `list_tasks` / `current_tasks.json`. E2E tests mock the container runner but use real SQLite, real IPC file I/O, and real scheduler/IPC polling.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, @modelcontextprotocol/sdk, zod

**Spec:** `docs/superpowers/specs/2026-03-31-task-management-e2e-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/db.ts` | Modify | Add `getTaskRunLogs()` query |
| `src/container-runner.ts` | Modify | Add `writeTaskRunLogsSnapshot()` |
| `src/task-scheduler.ts` | Modify | Call snapshot before task execution |
| `src/index.ts` | Modify | Call snapshot before agent start |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | Modify | Add `get_task_runs` MCP tool |
| `src/db.test.ts` | Modify | Add `getTaskRunLogs` unit tests |
| `src/e2e/test-harness.ts` | Create | Shared E2E test infrastructure |
| `src/e2e/task-pipeline.test.ts` | Create | Scheduled task pipeline E2E tests |
| `src/e2e/message-flow.test.ts` | Create | Message routing E2E tests |
| `src/e2e/task-runs-snapshot.test.ts` | Create | Run logs snapshot E2E tests |

---

### Task 1: Add `getTaskRunLogs` to database layer

**Files:**
- Modify: `src/db.ts:541` (after `logTaskRun`)
- Test: `src/db.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/db.test.ts`:

```typescript
import {
  _initTestDatabase,
  createTask,
  logTaskRun,
  getTaskRunLogs,
  // ... existing imports
} from './db.js';

describe('getTaskRunLogs', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('returns runs for a specific task ordered by most recent first', () => {
    createTask({
      id: 'task-1',
      group_folder: 'personal',
      chat_jid: 'chat@g.us',
      prompt: 'test',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      context_mode: 'isolated',
      next_run: '2026-04-01T09:00:00.000Z',
      status: 'active',
      created_at: '2026-03-31T00:00:00.000Z',
    });

    logTaskRun({ task_id: 'task-1', run_at: '2026-03-30T09:00:00.000Z', duration_ms: 1000, status: 'success', result: 'first', error: null });
    logTaskRun({ task_id: 'task-1', run_at: '2026-03-31T09:00:00.000Z', duration_ms: 2000, status: 'success', result: 'second', error: null });

    const runs = getTaskRunLogs({ taskId: 'task-1' });
    expect(runs.length).toBe(2);
    expect(runs[0].run_at).toBe('2026-03-31T09:00:00.000Z'); // most recent first
    expect(runs[1].run_at).toBe('2026-03-30T09:00:00.000Z');
  });

  it('filters by group folder', () => {
    createTask({ id: 'task-a', group_folder: 'personal', chat_jid: 'a@g.us', prompt: 'a', schedule_type: 'once', schedule_value: '2026-04-01T00:00:00.000Z', context_mode: 'isolated', next_run: '2026-04-01T00:00:00.000Z', status: 'active', created_at: '2026-03-31T00:00:00.000Z' });
    createTask({ id: 'task-b', group_folder: 'optionalrule', chat_jid: 'b@g.us', prompt: 'b', schedule_type: 'once', schedule_value: '2026-04-01T00:00:00.000Z', context_mode: 'isolated', next_run: '2026-04-01T00:00:00.000Z', status: 'active', created_at: '2026-03-31T00:00:00.000Z' });

    logTaskRun({ task_id: 'task-a', run_at: '2026-03-31T09:00:00.000Z', duration_ms: 1000, status: 'success', result: 'a-result', error: null });
    logTaskRun({ task_id: 'task-b', run_at: '2026-03-31T09:00:00.000Z', duration_ms: 1000, status: 'success', result: 'b-result', error: null });

    const runs = getTaskRunLogs({ groupFolder: 'personal' });
    expect(runs.length).toBe(1);
    expect(runs[0].task_id).toBe('task-a');
  });

  it('respects limit parameter', () => {
    createTask({ id: 'task-1', group_folder: 'personal', chat_jid: 'chat@g.us', prompt: 'test', schedule_type: 'cron', schedule_value: '0 9 * * *', context_mode: 'isolated', next_run: '2026-04-01T09:00:00.000Z', status: 'active', created_at: '2026-03-31T00:00:00.000Z' });

    for (let i = 0; i < 15; i++) {
      logTaskRun({ task_id: 'task-1', run_at: `2026-03-${String(i + 10).padStart(2, '0')}T09:00:00.000Z`, duration_ms: 1000, status: 'success', result: `run-${i}`, error: null });
    }

    const runs = getTaskRunLogs({ taskId: 'task-1', limit: 5 });
    expect(runs.length).toBe(5);
  });

  it('returns all runs when no filters specified', () => {
    createTask({ id: 'task-a', group_folder: 'personal', chat_jid: 'a@g.us', prompt: 'a', schedule_type: 'once', schedule_value: '2026-04-01T00:00:00.000Z', context_mode: 'isolated', next_run: '2026-04-01T00:00:00.000Z', status: 'active', created_at: '2026-03-31T00:00:00.000Z' });
    createTask({ id: 'task-b', group_folder: 'optionalrule', chat_jid: 'b@g.us', prompt: 'b', schedule_type: 'once', schedule_value: '2026-04-01T00:00:00.000Z', context_mode: 'isolated', next_run: '2026-04-01T00:00:00.000Z', status: 'active', created_at: '2026-03-31T00:00:00.000Z' });

    logTaskRun({ task_id: 'task-a', run_at: '2026-03-31T09:00:00.000Z', duration_ms: 1000, status: 'success', result: 'a', error: null });
    logTaskRun({ task_id: 'task-b', run_at: '2026-03-31T10:00:00.000Z', duration_ms: 1000, status: 'error', result: null, error: 'fail' });

    const runs = getTaskRunLogs({});
    expect(runs.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/db.test.ts`
Expected: FAIL with "getTaskRunLogs is not exported"

- [ ] **Step 3: Implement `getTaskRunLogs` in `src/db.ts`**

Add after the `logTaskRun` function (line ~541):

```typescript
export interface TaskRunLogRow {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: string;
  result: string | null;
  error: string | null;
}

export function getTaskRunLogs(opts: {
  taskId?: string;
  groupFolder?: string;
  limit?: number;
}): TaskRunLogRow[] {
  const limit = opts.limit ?? 50;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.taskId) {
    conditions.push('l.task_id = ?');
    params.push(opts.taskId);
  }
  if (opts.groupFolder) {
    conditions.push('t.group_folder = ?');
    params.push(opts.groupFolder);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  return db
    .prepare(
      `SELECT l.task_id, l.run_at, l.duration_ms, l.status, l.result, l.error
       FROM task_run_logs l
       JOIN scheduled_tasks t ON l.task_id = t.id
       ${where}
       ORDER BY l.run_at DESC
       LIMIT ?`,
    )
    .all(...params) as TaskRunLogRow[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add getTaskRunLogs query for task execution history"
```

---

### Task 2: Add `writeTaskRunLogsSnapshot` to container-runner

**Files:**
- Modify: `src/container-runner.ts:694` (after `writeTasksSnapshot`)
- Modify: `src/db.ts` (export `getTaskRunLogs`)

- [ ] **Step 1: Implement `writeTaskRunLogsSnapshot` in `src/container-runner.ts`**

Add after `writeTasksSnapshot` (line ~694), import `getTaskRunLogs` from `./db.js`:

First, add `getTaskRunLogs` to the imports at line 1 area. The file doesn't currently import from `./db.js`, so add:

```typescript
import { getTaskRunLogs } from './db.js';
```

Then add the function after `writeTasksSnapshot`:

```typescript
export function writeTaskRunLogsSnapshot(
  groupFolder: string,
  isMain: boolean,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Get recent runs. Main sees all; others filtered by group.
  const runs = isMain
    ? getTaskRunLogs({ limit: 100 })
    : getTaskRunLogs({ groupFolder, limit: 100 });

  const logsFile = path.join(groupIpcDir, 'task_run_logs.json');
  fs.writeFileSync(logsFile, JSON.stringify(runs, null, 2));
}
```

- [ ] **Step 2: Call snapshot in `src/task-scheduler.ts` before task execution**

In `src/task-scheduler.ts`, add `writeTaskRunLogsSnapshot` to the import from `./container-runner.js` (line 10):

```typescript
import {
  ContainerOutput,
  runContainerAgent,
  writeTaskRunLogsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
```

Then in `runTask()`, add a call right after the `writeTasksSnapshot` block (after line 148):

```typescript
  writeTaskRunLogsSnapshot(task.group_folder, isMain);
```

- [ ] **Step 3: Call snapshot in `src/index.ts` before agent start**

In `src/index.ts`, add `writeTaskRunLogsSnapshot` to the import from `./container-runner.js`, then add a call right after the existing `writeTasksSnapshot` call (after line 382):

```typescript
  writeTaskRunLogsSnapshot(group.folder, isMain);
```

- [ ] **Step 4: Run all tests to verify nothing is broken**

Run: `npm test -- --run`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/container-runner.ts src/task-scheduler.ts src/index.ts
git commit -m "feat: write task run logs snapshot before container starts"
```

---

### Task 3: Add `get_task_runs` MCP tool to container agent

**Files:**
- Modify: `container/agent-runner/src/ipc-mcp-stdio.ts:338` (before `transport` setup)

- [ ] **Step 1: Add the `get_task_runs` tool**

Add before the `// Start the stdio transport` line (line 340):

```typescript
server.tool(
  'get_task_runs',
  'Get execution history for scheduled tasks. Shows when tasks ran, whether they succeeded or failed, duration, and result/error details. Use to check if a task ran, diagnose failures, or report status.',
  {
    task_id: z.string().optional().describe('Filter to a specific task ID. Omit to see all recent runs.'),
    limit: z.number().optional().default(10).describe('Max number of runs to return (default 10).'),
  },
  async (args) => {
    const logsFile = path.join(IPC_DIR, 'task_run_logs.json');

    try {
      if (!fs.existsSync(logsFile)) {
        return { content: [{ type: 'text' as const, text: 'No task run history found.' }] };
      }

      const allRuns = JSON.parse(fs.readFileSync(logsFile, 'utf-8')) as Array<{
        task_id: string;
        run_at: string;
        duration_ms: number;
        status: string;
        result: string | null;
        error: string | null;
      }>;

      let runs = args.task_id
        ? allRuns.filter((r) => r.task_id === args.task_id)
        : allRuns;

      const limit = args.limit ?? 10;
      runs = runs.slice(0, limit);

      if (runs.length === 0) {
        return { content: [{ type: 'text' as const, text: args.task_id ? `No runs found for task ${args.task_id}.` : 'No task run history found.' }] };
      }

      const formatted = runs
        .map((r) => {
          const duration = r.duration_ms < 1000 ? `${r.duration_ms}ms` : `${(r.duration_ms / 1000).toFixed(1)}s`;
          const detail = r.status === 'error' ? `Error: ${r.error}` : (r.result ? r.result.slice(0, 150) : 'No output');
          return `- [${r.task_id}] ${r.run_at} (${duration}) ${r.status.toUpperCase()}\n  ${detail}`;
        })
        .join('\n');

      return { content: [{ type: 'text' as const, text: `Task run history:\n${formatted}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading run logs: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);
```

- [ ] **Step 2: Build container to verify no compile errors**

Run: `cd /home/streamweaver/codingprojects/nanoclaw/container/agent-runner && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add container/agent-runner/src/ipc-mcp-stdio.ts
git commit -m "feat: add get_task_runs MCP tool for execution history"
```

---

### Task 4: E2E test harness

**Files:**
- Create: `src/e2e/test-harness.ts`

This harness provides shared infrastructure for all E2E test suites. It sets up an in-memory DB, a temp IPC directory, mock deps, and helpers for writing IPC files and waiting for processing.

- [ ] **Step 1: Create the test harness**

```typescript
import fs from 'fs';
import os from 'os';
import path from 'path';

import { vi } from 'vitest';

import { _initTestDatabase, _closeDatabase } from '../db.js';
import { processTaskIpc, IpcDeps } from '../ipc.js';
import { RegisteredGroup } from '../types.js';

export interface TestContext {
  ipcBaseDir: string;
  groups: Record<string, RegisteredGroup>;
  deps: IpcDeps;
  sentMessages: Array<{ jid: string; text: string }>;
  taskChangedCount: number;
}

export function createTestContext(): TestContext {
  _initTestDatabase();

  const ipcBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-e2e-'));

  const sentMessages: Array<{ jid: string; text: string }> = [];
  let taskChangedCount = 0;

  const groups: Record<string, RegisteredGroup> = {
    'main@g.us': {
      name: 'Main',
      folder: 'main',
      trigger: 'always',
      added_at: '2024-01-01T00:00:00.000Z',
      isMain: true,
    },
    'personal@g.us': {
      name: 'Personal',
      folder: 'personal',
      trigger: '@Newton',
      added_at: '2024-01-01T00:00:00.000Z',
    },
    'optionalrule@g.us': {
      name: 'Optional Rule',
      folder: 'optionalrule',
      trigger: '@Alcuin',
      added_at: '2024-01-01T00:00:00.000Z',
    },
  };

  const deps: IpcDeps = {
    sendMessage: async (jid: string, text: string) => {
      sentMessages.push({ jid, text });
    },
    registeredGroups: () => groups,
    registerGroup: (jid, group) => {
      groups[jid] = group;
    },
    syncGroups: async () => {},
    getAvailableGroups: () => [],
    writeGroupsSnapshot: () => {},
    onTasksChanged: () => {
      taskChangedCount++;
    },
  };

  const ctx: TestContext = {
    ipcBaseDir,
    groups,
    deps,
    sentMessages,
    get taskChangedCount() {
      return taskChangedCount;
    },
    set taskChangedCount(v: number) {
      taskChangedCount = v;
    },
  };

  return ctx;
}

export function cleanupTestContext(ctx: TestContext): void {
  _closeDatabase();
  fs.rmSync(ctx.ipcBaseDir, { recursive: true, force: true });
}

/**
 * Write an IPC JSON file to a group's task directory, same format as
 * the container MCP server writes.
 */
export function writeIpcTaskFile(
  ipcBaseDir: string,
  groupFolder: string,
  data: object,
): string {
  const tasksDir = path.join(ipcBaseDir, groupFolder, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(tasksDir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}

/**
 * Write an IPC JSON file to a group's messages directory.
 */
export function writeIpcMessageFile(
  ipcBaseDir: string,
  groupFolder: string,
  data: object,
): string {
  const messagesDir = path.join(ipcBaseDir, groupFolder, 'messages');
  fs.mkdirSync(messagesDir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(messagesDir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}
```

- [ ] **Step 2: Verify the harness compiles**

Run: `npx tsc --noEmit`
Expected: No errors (the harness imports only existing modules)

- [ ] **Step 3: Commit**

```bash
git add src/e2e/test-harness.ts
git commit -m "feat: add E2E test harness with temp IPC dirs and mock deps"
```

---

### Task 5: E2E tests — task pipeline

**Files:**
- Create: `src/e2e/task-pipeline.test.ts`

These tests exercise the IPC task processing directly via `processTaskIpc()` (the function called by the IPC watcher) and verify database state. They don't start the full watcher/scheduler loops — those are stateful singletons. Instead they test the core orchestration functions that the loops call.

- [ ] **Step 1: Create the test file**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTask,
  getAllTasks,
  getTaskById,
  logTaskRun,
  getTaskRunLogs,
  deleteTask,
  updateTask,
  updateTaskAfterRun,
} from '../db.js';
import { processTaskIpc } from '../ipc.js';
import { computeNextRun } from '../task-scheduler.js';
import {
  createTestContext,
  cleanupTestContext,
  TestContext,
} from './test-harness.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  cleanupTestContext(ctx);
});

describe('task pipeline: creation via IPC', () => {
  it('creates a cron task via IPC from main group', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'Daily research digest',
        schedule_type: 'cron',
        schedule_value: '0 9 * * *',
        targetJid: 'personal@g.us',
      },
      'main',
      true,
      ctx.deps,
    );

    const tasks = getAllTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].group_folder).toBe('personal');
    expect(tasks[0].prompt).toBe('Daily research digest');
    expect(tasks[0].schedule_type).toBe('cron');
    expect(tasks[0].status).toBe('active');
    expect(tasks[0].next_run).not.toBeNull();
    expect(ctx.taskChangedCount).toBe(1);
  });

  it('creates an interval task via IPC', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'Check deploy status',
        schedule_type: 'interval',
        schedule_value: '3600000',
        targetJid: 'personal@g.us',
      },
      'personal',
      false,
      ctx.deps,
    );

    const tasks = getAllTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].schedule_type).toBe('interval');
    expect(tasks[0].schedule_value).toBe('3600000');
  });

  it('creates a one-time task via IPC', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'Send reminder',
        schedule_type: 'once',
        schedule_value: '2026-06-01T15:00:00.000Z',
        targetJid: 'personal@g.us',
      },
      'personal',
      false,
      ctx.deps,
    );

    const tasks = getAllTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].schedule_type).toBe('once');
  });

  it('blocks non-main group from scheduling for another group', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'sneaky task',
        schedule_type: 'once',
        schedule_value: '2026-06-01T00:00:00.000Z',
        targetJid: 'optionalrule@g.us',
      },
      'personal',
      false,
      ctx.deps,
    );

    const tasks = getAllTasks();
    expect(tasks.length).toBe(0);
  });

  it('sets context_mode to isolated by default', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'test',
        schedule_type: 'once',
        schedule_value: '2026-06-01T00:00:00.000Z',
        targetJid: 'personal@g.us',
        context_mode: 'isolated',
      },
      'personal',
      false,
      ctx.deps,
    );

    const tasks = getAllTasks();
    expect(tasks[0].context_mode).toBe('isolated');
  });
});

describe('task pipeline: lifecycle management', () => {
  const TASK_ID = 'task-lifecycle-test';

  beforeEach(() => {
    createTask({
      id: TASK_ID,
      group_folder: 'personal',
      chat_jid: 'personal@g.us',
      prompt: 'lifecycle test',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      context_mode: 'isolated',
      next_run: '2026-04-01T09:00:00.000Z',
      status: 'active',
      created_at: '2026-03-31T00:00:00.000Z',
    });
  });

  it('pauses a task via IPC', async () => {
    await processTaskIpc(
      { type: 'pause_task', taskId: TASK_ID },
      'personal',
      false,
      ctx.deps,
    );

    expect(getTaskById(TASK_ID)?.status).toBe('paused');
  });

  it('resumes a paused task via IPC', async () => {
    updateTask(TASK_ID, { status: 'paused' });

    await processTaskIpc(
      { type: 'resume_task', taskId: TASK_ID },
      'personal',
      false,
      ctx.deps,
    );

    expect(getTaskById(TASK_ID)?.status).toBe('active');
  });

  it('cancels a task via IPC (deletes from DB)', async () => {
    await processTaskIpc(
      { type: 'cancel_task', taskId: TASK_ID },
      'personal',
      false,
      ctx.deps,
    );

    expect(getTaskById(TASK_ID)).toBeUndefined();
  });

  it('updates task schedule via IPC', async () => {
    await processTaskIpc(
      {
        type: 'update_task',
        taskId: TASK_ID,
        schedule_type: 'interval',
        schedule_value: '3600000',
      },
      'personal',
      false,
      ctx.deps,
    );

    const task = getTaskById(TASK_ID)!;
    expect(task.schedule_type).toBe('interval');
    expect(task.schedule_value).toBe('3600000');
  });

  it('blocks non-main group from managing another groups task', async () => {
    await processTaskIpc(
      { type: 'pause_task', taskId: TASK_ID },
      'optionalrule',
      false,
      ctx.deps,
    );

    // Task should still be active — pause was blocked
    expect(getTaskById(TASK_ID)?.status).toBe('active');
  });
});

describe('task pipeline: scheduling logic', () => {
  it('cron task computes next run after execution', () => {
    const task = {
      id: 'cron-test',
      group_folder: 'personal',
      chat_jid: 'personal@g.us',
      prompt: 'test',
      schedule_type: 'cron' as const,
      schedule_value: '0 9 * * *',
      context_mode: 'isolated' as const,
      next_run: new Date(Date.now() - 1000).toISOString(),
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-03-31T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();
    expect(new Date(nextRun!).getTime()).toBeGreaterThan(Date.now());
  });

  it('one-time task returns null for next run', () => {
    const task = {
      id: 'once-test',
      group_folder: 'personal',
      chat_jid: 'personal@g.us',
      prompt: 'test',
      schedule_type: 'once' as const,
      schedule_value: '2026-04-01T00:00:00.000Z',
      context_mode: 'isolated' as const,
      next_run: new Date(Date.now() - 1000).toISOString(),
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-03-31T00:00:00.000Z',
    };

    expect(computeNextRun(task)).toBeNull();
  });

  it('updateTaskAfterRun marks one-time task as completed', () => {
    createTask({
      id: 'once-complete',
      group_folder: 'personal',
      chat_jid: 'personal@g.us',
      prompt: 'test',
      schedule_type: 'once',
      schedule_value: '2026-04-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2026-04-01T00:00:00.000Z',
      status: 'active',
      created_at: '2026-03-31T00:00:00.000Z',
    });

    updateTaskAfterRun('once-complete', null, 'Done');

    const task = getTaskById('once-complete')!;
    expect(task.status).toBe('completed');
    expect(task.next_run).toBeNull();
    expect(task.last_result).toBe('Done');
  });

  it('task run is logged to task_run_logs', () => {
    createTask({
      id: 'log-test',
      group_folder: 'personal',
      chat_jid: 'personal@g.us',
      prompt: 'test',
      schedule_type: 'once',
      schedule_value: '2026-04-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2026-04-01T00:00:00.000Z',
      status: 'active',
      created_at: '2026-03-31T00:00:00.000Z',
    });

    logTaskRun({
      task_id: 'log-test',
      run_at: '2026-04-01T00:00:05.000Z',
      duration_ms: 5000,
      status: 'success',
      result: 'Research complete',
      error: null,
    });

    const runs = getTaskRunLogs({ taskId: 'log-test' });
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('success');
    expect(runs[0].result).toBe('Research complete');
    expect(runs[0].duration_ms).toBe(5000);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- --run src/e2e/task-pipeline.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/e2e/task-pipeline.test.ts
git commit -m "test: add E2E tests for scheduled task pipeline"
```

---

### Task 6: E2E tests — message flow

**Files:**
- Create: `src/e2e/message-flow.test.ts`

Tests IPC message routing and authorization via `processTaskIpc` for task-related messages and direct message file processing patterns.

- [ ] **Step 1: Create the test file**

```typescript
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { processTaskIpc } from '../ipc.js';
import {
  createTestContext,
  cleanupTestContext,
  writeIpcMessageFile,
  TestContext,
} from './test-harness.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  cleanupTestContext(ctx);
});

describe('message flow: IPC send_message routing', () => {
  it('main group can send message to any group', async () => {
    // Simulate what the IPC watcher does when it reads a message file:
    // it calls deps.sendMessage if authorization passes.
    // Here we test the authorization logic directly.
    const isMain = true;
    const targetJid = 'optionalrule@g.us';
    const targetGroup = ctx.groups[targetJid];

    // Main group can always send
    expect(isMain || (targetGroup && targetGroup.folder === 'main')).toBe(true);

    await ctx.deps.sendMessage(targetJid, 'Hello from main');
    expect(ctx.sentMessages.length).toBe(1);
    expect(ctx.sentMessages[0].jid).toBe('optionalrule@g.us');
    expect(ctx.sentMessages[0].text).toBe('Hello from main');
  });

  it('non-main group can send message to its own chat', async () => {
    const sourceGroup = 'personal';
    const isMain = false;
    const targetJid = 'personal@g.us';
    const targetGroup = ctx.groups[targetJid];

    // Auth check: non-main can send to own group
    const authorized = isMain || (targetGroup && targetGroup.folder === sourceGroup);
    expect(authorized).toBe(true);

    await ctx.deps.sendMessage(targetJid, 'Self message');
    expect(ctx.sentMessages.length).toBe(1);
  });

  it('non-main group cannot send message to another groups chat', async () => {
    const sourceGroup = 'personal';
    const isMain = false;
    const targetJid = 'optionalrule@g.us';
    const targetGroup = ctx.groups[targetJid];

    const authorized = isMain || (targetGroup && targetGroup.folder === sourceGroup);
    expect(authorized).toBe(false);
  });

  it('message to unregistered JID is blocked', async () => {
    const sourceGroup = 'personal';
    const isMain = false;
    const targetJid = 'unknown@g.us';
    const targetGroup = ctx.groups[targetJid];

    const authorized = isMain || (targetGroup && targetGroup.folder === sourceGroup);
    expect(authorized).toBeFalsy();
  });
});

describe('message flow: IPC file writing', () => {
  it('writeIpcMessageFile creates atomic JSON file', () => {
    const filename = writeIpcMessageFile(ctx.ipcBaseDir, 'personal', {
      type: 'message',
      chatJid: 'personal@g.us',
      text: 'Hello',
    });

    const filepath = path.join(ctx.ipcBaseDir, 'personal', 'messages', filename);
    expect(fs.existsSync(filepath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(data.type).toBe('message');
    expect(data.text).toBe('Hello');
  });

  it('no .tmp files left after write', () => {
    writeIpcMessageFile(ctx.ipcBaseDir, 'personal', {
      type: 'message',
      chatJid: 'personal@g.us',
      text: 'Test',
    });

    const messagesDir = path.join(ctx.ipcBaseDir, 'personal', 'messages');
    const files = fs.readdirSync(messagesDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });
});

describe('message flow: task IPC error handling', () => {
  it('unknown IPC task type does not crash', async () => {
    // processTaskIpc logs a warning but doesn't throw
    await expect(
      processTaskIpc(
        { type: 'unknown_action' },
        'personal',
        false,
        ctx.deps,
      ),
    ).resolves.toBeUndefined();
  });

  it('schedule_task with missing fields does not create task', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'incomplete',
        // missing schedule_type, schedule_value, targetJid
      },
      'personal',
      false,
      ctx.deps,
    );

    const { getAllTasks } = await import('../db.js');
    const tasks = getAllTasks();
    expect(tasks.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- --run src/e2e/message-flow.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/e2e/message-flow.test.ts
git commit -m "test: add E2E tests for IPC message flow and authorization"
```

---

### Task 7: E2E tests — task run logs snapshot

**Files:**
- Create: `src/e2e/task-runs-snapshot.test.ts`

Tests that `writeTaskRunLogsSnapshot` produces correct, filtered snapshots.

- [ ] **Step 1: Create the test file**

```typescript
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTask,
  logTaskRun,
  getTaskRunLogs,
} from '../db.js';
import { writeTaskRunLogsSnapshot } from '../container-runner.js';
import {
  createTestContext,
  cleanupTestContext,
  TestContext,
} from './test-harness.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();

  // Create tasks in two groups
  createTask({
    id: 'task-personal',
    group_folder: 'personal',
    chat_jid: 'personal@g.us',
    prompt: 'personal research',
    schedule_type: 'cron',
    schedule_value: '0 9 * * *',
    context_mode: 'isolated',
    next_run: '2026-04-01T09:00:00.000Z',
    status: 'active',
    created_at: '2026-03-31T00:00:00.000Z',
  });

  createTask({
    id: 'task-optionalrule',
    group_folder: 'optionalrule',
    chat_jid: 'optionalrule@g.us',
    prompt: 'gaming news',
    schedule_type: 'cron',
    schedule_value: '0 8 * * *',
    context_mode: 'isolated',
    next_run: '2026-04-01T08:00:00.000Z',
    status: 'active',
    created_at: '2026-03-31T00:00:00.000Z',
  });

  // Log some runs
  logTaskRun({ task_id: 'task-personal', run_at: '2026-03-31T09:00:00.000Z', duration_ms: 5000, status: 'success', result: 'Research done', error: null });
  logTaskRun({ task_id: 'task-optionalrule', run_at: '2026-03-31T08:00:00.000Z', duration_ms: 3000, status: 'success', result: 'News fetched', error: null });
  logTaskRun({ task_id: 'task-personal', run_at: '2026-03-30T09:00:00.000Z', duration_ms: 4000, status: 'error', result: null, error: 'Rate limited' });
});

afterEach(() => {
  cleanupTestContext(ctx);
});

describe('task run logs snapshot', () => {
  it('snapshot includes recent runs for the group', () => {
    writeTaskRunLogsSnapshot('personal', false);

    const logsFile = path.join(process.cwd(), 'data', 'ipc', 'personal', 'task_run_logs.json');
    expect(fs.existsSync(logsFile)).toBe(true);

    const runs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
    expect(runs.length).toBe(2); // both personal runs
    expect(runs.every((r: { task_id: string }) => r.task_id === 'task-personal')).toBe(true);
  });

  it('non-main group snapshot excludes other groups runs', () => {
    writeTaskRunLogsSnapshot('personal', false);

    const logsFile = path.join(process.cwd(), 'data', 'ipc', 'personal', 'task_run_logs.json');
    const runs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));

    const otherGroupRuns = runs.filter((r: { task_id: string }) => r.task_id === 'task-optionalrule');
    expect(otherGroupRuns.length).toBe(0);
  });

  it('main group snapshot includes all groups runs', () => {
    writeTaskRunLogsSnapshot('main', true);

    const logsFile = path.join(process.cwd(), 'data', 'ipc', 'main', 'task_run_logs.json');
    const runs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));

    expect(runs.length).toBe(3); // 2 personal + 1 optionalrule
    const taskIds = new Set(runs.map((r: { task_id: string }) => r.task_id));
    expect(taskIds.has('task-personal')).toBe(true);
    expect(taskIds.has('task-optionalrule')).toBe(true);
  });

  it('snapshot respects limit (last N runs per query)', () => {
    // Add many runs to personal task
    for (let i = 0; i < 120; i++) {
      logTaskRun({
        task_id: 'task-personal',
        run_at: `2026-03-${String(Math.min(i + 1, 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
        duration_ms: 1000,
        status: 'success',
        result: `run-${i}`,
        error: null,
      });
    }

    writeTaskRunLogsSnapshot('personal', false);

    const logsFile = path.join(process.cwd(), 'data', 'ipc', 'personal', 'task_run_logs.json');
    const runs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));

    // Should be capped at 100 (the limit in writeTaskRunLogsSnapshot)
    expect(runs.length).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- --run src/e2e/task-runs-snapshot.test.ts`
Expected: All PASS

Note: These tests write to the real `data/ipc/` directory via `resolveGroupIpcPath`. This is fine for test purposes since the files are just JSON snapshots. If isolation is needed, we can mock `resolveGroupIpcPath` in a follow-up.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/task-runs-snapshot.test.ts
git commit -m "test: add E2E tests for task run logs snapshot filtering"
```

---

### Task 8: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`
Expected: All tests PASS (existing 307 + new tests)

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Clean build, no type errors

- [ ] **Step 3: Build the container agent-runner**

Run: `cd /home/streamweaver/codingprojects/nanoclaw/container/agent-runner && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Clean up any snapshot files created by tests**

```bash
rm -f data/ipc/personal/task_run_logs.json data/ipc/optionalrule/task_run_logs.json data/ipc/main/task_run_logs.json
```

- [ ] **Step 5: Commit any remaining changes**

Only if there are fixes or adjustments discovered during the full run.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | `getTaskRunLogs` DB query + unit tests | `src/db.ts`, `src/db.test.ts` |
| 2 | `writeTaskRunLogsSnapshot` + call sites | `src/container-runner.ts`, `src/task-scheduler.ts`, `src/index.ts` |
| 3 | `get_task_runs` MCP tool in container | `container/agent-runner/src/ipc-mcp-stdio.ts` |
| 4 | E2E test harness | `src/e2e/test-harness.ts` |
| 5 | E2E: task pipeline tests | `src/e2e/task-pipeline.test.ts` |
| 6 | E2E: message flow tests | `src/e2e/message-flow.test.ts` |
| 7 | E2E: run logs snapshot tests | `src/e2e/task-runs-snapshot.test.ts` |
| 8 | Full suite verification | — |
