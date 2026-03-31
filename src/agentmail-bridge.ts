import crypto from 'crypto';
import http from 'http';

import { Webhook } from 'svix';

import {
  AGENTMAIL_INBOX_MAP,
  AGENTMAIL_WEBHOOK_PORT,
  AGENTMAIL_WEBHOOK_SECRET,
} from './config.js';
import { logger } from './logger.js';
import { NewMessage } from './types.js';

// --- Types ---

export interface EmailData {
  from: string;
  to: string;
  messageId: string;
  threadId: string;
  subject?: string;
  text?: string;
  html?: string;
}

export interface BridgeDeps {
  storeMessage: (msg: NewMessage) => void;
  storeChatMetadata: (
    chatJid: string,
    timestamp: string,
    name?: string,
    channel?: string,
    isGroup?: boolean,
  ) => void;
}

// --- Pure helpers (exported for tests) ---

export function formatEmailAsMessage(email: EmailData): string {
  const subject = email.subject || '(no subject)';
  const body = email.text || email.html || '(no body)';
  return `[Email from ${email.from} to ${email.to} | MsgID: ${email.messageId} | ThreadID: ${email.threadId}]\nSubject: ${subject}\n\n${body}`;
}

export function resolveGroupJid(
  inboxId: string,
  inboxMap: Record<string, string>,
): string | null {
  if (!inboxId) return null;
  return inboxMap[inboxId] ?? null;
}

// --- Webhook processing ---

function processInboundEmail(
  payload: Record<string, unknown>,
  deps: BridgeDeps,
): void {
  const data = (payload.message ?? payload.data) as
    | Record<string, unknown>
    | undefined;
  if (!data) {
    logger.warn('Agentmail webhook missing message/data field');
    return;
  }

  const inboxId = String(data.inbox_id ?? data.to ?? '');
  const email: EmailData = {
    from: String(data.from ?? ''),
    to: inboxId,
    messageId: String(data.message_id ?? ''),
    threadId: String(data.thread_id ?? ''),
    subject: data.subject ? String(data.subject) : undefined,
    text: data.text ? String(data.text) : undefined,
    html: data.html ? String(data.html) : undefined,
  };

  const groupJid = resolveGroupJid(inboxId, AGENTMAIL_INBOX_MAP);
  if (!groupJid) {
    logger.warn(
      { to: email.to },
      'Agentmail webhook: no group mapped for inbox',
    );
    return;
  }

  const content = formatEmailAsMessage(email);
  const now = new Date().toISOString();
  const msgId = `agentmail-${crypto.randomUUID()}`;

  const msg: NewMessage = {
    id: msgId,
    chat_jid: groupJid,
    sender: email.from,
    sender_name: email.from,
    content,
    timestamp: now,
    is_from_me: false,
    is_bot_message: false,
  };

  deps.storeMessage(msg);
  deps.storeChatMetadata(groupJid, now, undefined, 'agentmail', true);

  logger.info(
    { from: email.from, to: email.to, groupJid },
    'Agentmail inbound email stored',
  );
}

// --- HTTP server ---

function collectBody(
  req: http.IncomingMessage,
  maxBytes = 1_048_576,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function startAgentmailBridge(deps: BridgeDeps): http.Server | null {
  if (!AGENTMAIL_WEBHOOK_SECRET) {
    logger.info('Agentmail bridge: no webhook secret configured, skipping');
    return null;
  }

  if (Object.keys(AGENTMAIL_INBOX_MAP).length === 0) {
    logger.info('Agentmail bridge: no inbox map configured, skipping');
    return null;
  }

  const wh = new Webhook(AGENTMAIL_WEBHOOK_SECRET);

  const server = http.createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    // Webhook endpoint
    if (req.method === 'POST' && (req.url === '/ingest/agentmail' || req.url === '/agentmail/webhook')) {
      let body: string;
      try {
        body = await collectBody(req);
      } catch (err) {
        logger.error({ err }, 'Agentmail bridge: failed to read request body');
        res.writeHead(400);
        res.end('bad request');
        return;
      }

      // Verify Svix signature
      const headers: Record<string, string> = {};
      for (const key of ['svix-id', 'svix-timestamp', 'svix-signature']) {
        const val = req.headers[key];
        if (typeof val === 'string') {
          headers[key] = val;
        }
      }

      let payload: Record<string, unknown>;
      try {
        payload = wh.verify(body, headers) as Record<string, unknown>;
      } catch (err) {
        logger.warn({ err }, 'Agentmail bridge: signature verification failed');
        res.writeHead(401);
        res.end('unauthorized');
        return;
      }

      // Only process message.received events
      const eventType =
        (payload.event_type as string) ||
        (req.headers['svix-event-type'] as string) ||
        (payload.type as string) ||
        '';
      if (eventType !== 'message.received') {
        logger.debug(
          { eventType },
          'Agentmail bridge: ignoring non-message event',
        );
        res.writeHead(200);
        res.end('ok');
        return;
      }

      try {
        processInboundEmail(payload, deps);
        res.writeHead(200);
        res.end('ok');
      } catch (err) {
        logger.error({ err }, 'Agentmail bridge: failed to process email');
        res.writeHead(500);
        res.end('internal error');
      }
      return;
    }

    // All other routes
    res.writeHead(404);
    res.end('not found');
  });

  server.listen(AGENTMAIL_WEBHOOK_PORT, () => {
    logger.info(
      { port: AGENTMAIL_WEBHOOK_PORT },
      'Agentmail webhook bridge started',
    );
  });

  return server;
}
