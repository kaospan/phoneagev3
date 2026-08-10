import http from 'http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || process.env.WS_PORT || 8081);
const host = '0.0.0.0';
const heartbeatMs = Number(process.env.WS_HEARTBEAT_MS || 30000);
const maxMessageBytes = Number(process.env.WS_MAX_MESSAGE_BYTES || 1024);
const maxMessagesPerWindow = Number(process.env.WS_MAX_MESSAGES_PER_WINDOW || 30);
const rateWindowMs = Number(process.env.WS_RATE_WINDOW_MS || 1000);
const allowedOrigins = (process.env.WS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isSafeIntegerInRange = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

const isCardinalDelta = (dx, dy) =>
  ((dx === 0 && (dy === -1 || dy === 1)) || (dy === 0 && (dx === -1 || dx === 1)));

const sanitizeInput = (input) => {
  if (!input || typeof input !== 'object') return null;

  if (input.type === 'move') {
    if (!isCardinalDelta(input.dx, input.dy)) return null;
    if (!isSafeIntegerInRange(input.seq, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { type: 'move', dx: input.dx, dy: input.dy, seq: input.seq };
  }

  if (input.type === 'select') {
    if (!isSafeIntegerInRange(input.x, 0, 255)) return null;
    if (!isSafeIntegerInRange(input.y, 0, 255)) return null;
    if (!isSafeIntegerInRange(input.seq, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { type: 'select', x: input.x, y: input.y, seq: input.seq };
  }

  if (input.type === 'deselect') {
    if (!isSafeIntegerInRange(input.seq, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { type: 'deselect', seq: input.seq };
  }

  return null;
};

const isAllowedOrigin = (origin) => {
  if (allowedOrigins.length === 0) return true;
  if (!origin) return false;
  return allowedOrigins.includes(origin);
};

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: ({ origin }, done) => {
    done(isAllowedOrigin(origin), 403, 'Forbidden');
  },
});

let nextId = 1;

const broadcast = (data, except) => {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client !== except) {
      client.send(payload);
    }
  });
};

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.rateWindowStartedAt = Date.now();
  ws.messagesInWindow = 0;
  const id = `p${nextId++}`;
  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const byteLength = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(String(raw));
      if (byteLength > maxMessageBytes) {
        ws.close(1009, 'Message too large');
        return;
      }

      const now = Date.now();
      if (now - ws.rateWindowStartedAt >= rateWindowMs) {
        ws.rateWindowStartedAt = now;
        ws.messagesInWindow = 0;
      }
      ws.messagesInWindow += 1;
      if (ws.messagesInWindow > maxMessagesPerWindow) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input') {
        const input = sanitizeInput(msg.input);
        if (input) {
          broadcast({ type: 'input', id, input }, ws);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, heartbeatMs);

server.listen(port, host);

const shutdown = () => {
  clearInterval(heartbeat);
  wss.close(() => {
    server.close(() => process.exit(0));
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
