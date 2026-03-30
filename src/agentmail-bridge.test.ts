import { describe, it, expect } from 'vitest';

import { formatEmailAsMessage, resolveGroupJid } from './agentmail-bridge.js';

// --- formatEmailAsMessage ---

describe('formatEmailAsMessage', () => {
  it('includes sender, inbox ID, messageId, threadId, subject, and body', () => {
    const result = formatEmailAsMessage({
      from: 'alice@example.com',
      to: 'inbox-123@agentmail.dev',
      messageId: 'msg_123',
      threadId: 'thr_456',
      subject: 'Hello there',
      text: 'This is the body',
      html: '<p>This is the body</p>',
    });
    expect(result).toContain('alice@example.com');
    expect(result).toContain('inbox-123@agentmail.dev');
    expect(result).toContain('MsgID: msg_123');
    expect(result).toContain('ThreadID: thr_456');
    expect(result).toContain('Hello there');
    expect(result).toContain('This is the body');
  });

  it('handles missing subject', () => {
    const result = formatEmailAsMessage({
      from: 'alice@example.com',
      to: 'inbox-123@agentmail.dev',
      messageId: 'msg_001',
      threadId: 'thr_001',
      text: 'Body only',
    });
    expect(result).toContain('(no subject)');
    expect(result).toContain('Body only');
  });

  it('falls back to html when text is absent', () => {
    const result = formatEmailAsMessage({
      from: 'alice@example.com',
      to: 'inbox-123@agentmail.dev',
      messageId: 'msg_002',
      threadId: 'thr_002',
      subject: 'HTML email',
      html: '<p>HTML content here</p>',
    });
    expect(result).toContain('<p>HTML content here</p>');
  });

  it('handles missing both text and html', () => {
    const result = formatEmailAsMessage({
      from: 'alice@example.com',
      to: 'inbox-123@agentmail.dev',
      messageId: 'msg_003',
      threadId: 'thr_003',
      subject: 'Empty email',
    });
    expect(result).toContain('(no body)');
  });
});

// --- resolveGroupJid ---

describe('resolveGroupJid', () => {
  const inboxMap: Record<string, string> = {
    'inbox-123@agentmail.dev': 'group-abc@g.us',
    'inbox-456@agentmail.dev': 'tg:-100999',
  };

  it('maps inbox ID to group JID', () => {
    expect(resolveGroupJid('inbox-123@agentmail.dev', inboxMap)).toBe(
      'group-abc@g.us',
    );
  });

  it('maps a different inbox ID to its group JID', () => {
    expect(resolveGroupJid('inbox-456@agentmail.dev', inboxMap)).toBe(
      'tg:-100999',
    );
  });

  it('returns null for unknown inbox', () => {
    expect(resolveGroupJid('unknown@agentmail.dev', inboxMap)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveGroupJid('', inboxMap)).toBeNull();
  });
});
