// Live server status polling + WebSocket connection

import { useEffect, useState, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────

export interface ServerStatus {
  server: { uptime: number; memory: number; node: string };
  world: { rooms: number; characters: number; tick: number; gameTime: number };
  modules: Record<string, { status: string }>;
}

export interface RoomInfo {
  id: string;
  name: string;
  exits: string[];
  type: string;
}

export interface CharInfo {
  id: string;
  name: string;
  type: string;
  room: string;
  hp: { current: number; max: number };
  level: number;
}

export interface WsEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

// ── Status Polling ──────────────────────────────────

const API_BASE = '';

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
  const wsRef = useRef<WebSocket | null>(null);

  // Poll HTTP status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [sRes, rRes, cRes] = await Promise.all([
          fetch(`${API_BASE}/api/status`),
          fetch(`${API_BASE}/api/world/rooms`),
          fetch(`${API_BASE}/api/world/characters`),
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

  // WebSocket for live events
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = 'localhost:3001';
    const ws = new WebSocket(`${proto}//${host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => console.log('[ws] connected');
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        setEvents((prev) => [
          { type: data.type, payload: data.payload, timestamp: Date.now() },
          ...prev.slice(0, 49), // keep last 50
        ]);
      } catch {
        // ignore
      }
    };
    ws.onclose = () => console.log('[ws] disconnected');

    return () => ws.close();
  }, []);

  return { status, rooms, chars, events };
}
