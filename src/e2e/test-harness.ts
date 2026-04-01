import fs from 'fs';
import os from 'os';
import path from 'path';

import { _initTestDatabase, _closeDatabase } from '../db.js';
import { IpcDeps } from '../ipc.js';
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
