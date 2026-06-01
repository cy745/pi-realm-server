// Live server status polling + singleton WebSocket for events

import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────

export interface ServerStatus {
  server: { uptime: number; memory: number; node: string };
  world: { locations: number; characters: number; tick: number; gameTime: number };
  modules: Record<string, { status: string }>;
}

export interface RoomInfo {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parent: string | null;
  children: number;
}

export interface CharInfo {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  hp: { current: number; max: number };
  level: number;
  stamina: { current: number; max: number };
  vehicle: string | null;
  address: string;
}

export interface WsEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

// ── Singleton WebSocket ────────────────────────────

type WsListener = (event: WsEvent) => void;
let wsInstance: WebSocket | null = null;
let wsListeners: WsListener[] = [];
let wsConnected = false;

function ensureWs(): void {
  if (wsInstance && wsInstance.readyState === WebSocket.OPEN) return;
  if (wsInstance && wsInstance.readyState === WebSocket.CONNECTING) return;

  try {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    wsInstance = new WebSocket(wsUrl);
    wsInstance.onopen = () => {
      wsConnected = true;
      console.log('[ws] connected');
    };
    wsInstance.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const event: WsEvent = { type: data.type, payload: data.payload, timestamp: Date.now() };
        for (const fn of wsListeners) fn(event);
      } catch { /* ignore */ }
    };
    wsInstance.onclose = () => {
      wsConnected = false;
      wsInstance = null;
      console.log('[ws] disconnected, reconnecting in 3s');
      setTimeout(ensureWs, 3000);
    };
    wsInstance.onerror = () => {
      wsInstance?.close();
    };
  } catch { /* ignore */ }
}

function subscribeWs(fn: WsListener): () => void {
  wsListeners.push(fn);
  ensureWs();
  return () => {
    wsListeners = wsListeners.filter((l) => l !== fn);
  };
}

// ── Status Polling ──────────────────────────────────

export function useServerStatus(pollMs = 3000): {
  status: ServerStatus | null;
  rooms: RoomInfo[];
  chars: CharInfo[];
  events: WsEvent[];
} {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [chars, setChars] = useState<CharInfo[]>([]);
  const [events, setEvents] = useState<WsEvent[]>([]);

  // Poll HTTP status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [sRes, rRes, cRes] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/world/locations'),
          fetch('/api/world/characters'),
        ]);
        if (sRes.ok) setStatus(await sRes.json());
        if (rRes.ok) setRooms(await rRes.json());
        if (cRes.ok) setChars(await cRes.json());
      } catch {
        // server not ready
      }
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  // Singleton WebSocket
  useEffect(() => {
    return subscribeWs((event) => {
      setEvents((prev) => [event, ...prev.slice(0, 49)]);
    });
  }, []);

  return { status, rooms, chars, events };
}
