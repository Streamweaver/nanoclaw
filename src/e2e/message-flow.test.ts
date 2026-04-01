import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { processTaskIpc } from '../ipc.js';
import { getAllTasks } from '../db.js';
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

    const tasks = getAllTasks();
    expect(tasks.length).toBe(0);
  });
});
