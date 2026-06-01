// Pi Realm Server Entrypoint
// Express + WebSocket server for development and production

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
    modules: {
      built: new Date().toISOString(),
    },
  });
});

// System status
app.get('/api/status', (_req, res) => {
  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      node: process.version,
    },
    world: {
      rooms: 0,
      characters: 0,
      tick: 0,
      gameTime: 0,
    },
    modules: {
      'room-state': { status: 'online' },
      'tick-loop': { status: 'online' },
      'world-sim': { status: 'online' },
      perception: { status: 'online' },
      filter: { status: 'online' },
      scout: { status: 'online' },
      memory: { status: 'online' },
    },
  });
});

// HTTP server
const httpServer = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress ?? 'unknown';
  console.log(`[ws] client connected: ${clientIp}`);

  ws.send(
    JSON.stringify({
      type: 'connected',
      payload: { server: 'pi-realm', version: '0.1.0', timestamp: Date.now() },
    }),
  );

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[ws] message: ${msg.type ?? 'unknown'}`);
      ws.send(
        JSON.stringify({
          type: 'echo',
          payload: msg,
        }),
      );
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'invalid JSON' } }));
    }
  });

  ws.on('close', () => {
    console.log(`[ws] client disconnected: ${clientIp}`);
  });
});

// Start
httpServer.listen(PORT, HOST, () => {
  console.log(`┌─────────────────────────────────────────`);
  console.log(`│  Pi Realm Server`);
  console.log(`│  http://${HOST}:${PORT}/api/health`);
  console.log(`│  ws://${HOST}:${PORT}/ws`);
  console.log(`│  mode: ${process.env['NODE_ENV'] ?? 'development'}`);
  console.log(`└─────────────────────────────────────────`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[sigterm] shutting down...');
  wss.close();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n[sigint] shutting down...');
  wss.close();
  httpServer.close(() => process.exit(0));
});
