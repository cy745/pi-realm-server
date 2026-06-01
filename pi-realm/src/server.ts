// Pi Realm Server Entrypoint
// Express + WebSocket + Game Engine

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { GameEngine } from './game/engine.ts';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const TICK_INTERVAL = parseInt(process.env['TICK_INTERVAL'] ?? '30000', 10); // 30s for dev

const app = express();
app.use(cors());
app.use(express.json());

// ── Game Engine ─────────────────────────────────────

const engine = new GameEngine();
engine.startLoop(TICK_INTERVAL);

// ── HTTP API ────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
    modules: { built: new Date().toISOString() },
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      node: process.version,
    },
    world: {
      locations: engine.world.regions.all().length,
      characters: engine.world.chars.size,
      tick: engine.ticker.getHistory().length,
      gameTime: engine.ticker.getCurrentGameTime(),
    },
    modules: {
      'map-terrain': { status: 'online' },
      'tick-loop': { status: 'online' },
      perception: { status: 'online' },
      filter: { status: 'online' },
      scout: { status: 'online' },
      memory: { status: 'online' },
    },
  });
});

app.get('/api/world/locations', (_req, res) => {
  const locs = engine.world.regions.all().map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    x: l.x,
    y: l.y,
    w: l.width,
    h: l.height,
    parent: l.parentId,
    children: l.childrenIds.length,
  }));
  res.json(locs);
});

app.get('/api/world/characters', (_req, res) => {
  const charList = Array.from(engine.world.chars.values()).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    x: Math.round(c.x),
    y: Math.round(c.y),
    hp: c.attributes.hp,
    level: c.attributes.level,
    stamina: { current: Math.round(c.movement.currentStamina), max: c.movement.maxStamina },
    vehicle: c.movement.vehicle,
    address: engine.world.regions.getAddressString(c.x, c.y),
  }));
  res.json(charList);
});

app.get('/api/world/terrain', (req, res) => {
  const x = Number(req.query['x']) || 0;
  const y = Number(req.query['y']) || 0;
  const sample = engine.world.terrain.sample(x, y);
  res.json({ x, y, type: sample.type, height: sample.height, slope: sample.slope });
});

// ── WebSocket ──────────────────────────────────────

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

interface WsClient {
  ws: WebSocket;
  characterId: string | null;
}

const clients = new Map<WebSocket, WsClient>();

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress ?? 'unknown';
  console.log(`[ws] client connected: ${clientIp}`);

  const client: WsClient = { ws, characterId: null };
  clients.set(ws, client);

  ws.send(JSON.stringify({
    type: 'connected',
    payload: { server: 'pi-realm', version: '0.1.0', timestamp: Date.now() },
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'invalid JSON' } }));
    }
  });

  ws.on('close', () => {
    console.log(`[ws] client disconnected: ${clientIp}`);
    // Unregister notify callback
    if (client.characterId) {
      // Mark character offline
      const char = engine.world.chars.get(client.characterId);
      if (char) char.isOnline = false;
    }
    clients.delete(ws);
  });

  ws.on('error', () => clients.delete(ws));
});

function handleMessage(ws: WebSocket, msg: { type: string; payload?: Record<string, unknown> }): void {
  const client = clients.get(ws);
  if (!client) return;

  switch (msg.type) {
    case 'login': {
      const charId = (msg.payload?.characterId ?? 'player-1') as string;
      const char = engine.world.chars.get(charId);
      if (!char) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: `Character '${charId}' not found` } }));
        return;
      }
      client.characterId = charId;
      char.isOnline = true;

      // Register notification callback
      const callback = (_charId: string, data: unknown) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(data));
        }
      };
      engine.onNotify(charId, callback);

      // Send initial view
      const view = engine.generateView(charId);
      ws.send(JSON.stringify({
        type: 'login_ok',
        payload: { characterId: charId, name: char.name, x: char.x, y: char.y, view },
      }));
      console.log(`[ws] ${char.name} (${charId}) logged in`);
      break;
    }

    case 'action': {
      if (!client.characterId) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'login first' } }));
        return;
      }
      const action = msg.payload as { type: string; payload?: Record<string, unknown> };
      const result = engine.handleAction(client.characterId, action);
      const view = engine.generateView(client.characterId);
      ws.send(JSON.stringify({
        type: 'action_result',
        payload: { action: action.type, result, view },
      }));
      break;
    }

    case 'look': {
      if (!client.characterId) return;
      const view = engine.generateView(client.characterId);
      ws.send(JSON.stringify({ type: 'view', payload: view }));
      break;
    }

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', payload: { message: `unknown type: ${msg.type}` } }));
  }
}

// ── Start ──────────────────────────────────────────

httpServer.listen(PORT, HOST, () => {
  console.log(`┌─────────────────────────────────────────`);
  console.log(`│  Pi Realm Server`);
  console.log(`│  http://${HOST}:${PORT}/api/health`);
  console.log(`│  ws://${HOST}:${PORT}/ws`);
  console.log(`│  tick: ${TICK_INTERVAL / 1000}s  chars: ${engine.world.chars.size}`);
  console.log(`│  mode: ${process.env['NODE_ENV'] ?? 'development'}`);
  console.log(`└─────────────────────────────────────────`);
});

// ── Graceful Shutdown ──────────────────────────────

function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting down...`);
  engine.stopLoop();
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('sigterm'));
process.on('SIGINT', () => shutdown('sigint'));
