import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTask,
  logTaskRun,
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
