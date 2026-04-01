import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTask,
  getAllTasks,
  getTaskById,
  logTaskRun,
  getTaskRunLogs,
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

  it('sets context_mode to isolated when specified', async () => {
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
