// Game Engine — the central loop that orchestrates all modules
//
// Flow:
//   init() → startLoop() → [tick → sim → events → notify] × ∞
//                            ↑                          ↕
//                     player action → process → notify

import { MemoryStore, DEFAULT_DECAY_RATE } from './memory.ts';
import { createDemoWorld } from './world.ts';
import { processAction, type Action, type ActionResult } from './actions.ts';
import { advanceTimeOfDay, applyStructuralDecay, applyWeatherEffects, evolveWeather, spreadFire, type SimulationContext } from '../sim/world-sim.ts';
import { calculatePerception, type WorldTopology } from '../visibility/perception.ts';
import { TickScheduler, DEFAULT_TICK_CONFIG } from '../tick/tick-loop.ts';
import type { Character, CharacterId, RoomId, RoomState, WorldEvent } from '../types.ts';

export type NotifyCallback = (characterId: CharacterId, message: unknown) => void;

export interface CharacterView {
  self: CharacterSnapshot;
  currentRoom: RoomView;
  events: NarratedEvent[];
  availableActions: string[];
}

interface CharacterSnapshot {
  characterId: CharacterId;
  name: string;
  roomId: RoomId;
  hp: { current: number; max: number };
  mp: { current: number; max: number };
}

interface RoomView {
  name: string;
  description: string;
  exits: string[];
  occupants: string[];
  marks: string[];
  timeOfDay: string;
  weather: string;
}

interface NarratedEvent {
  id: string;
  message: string;
  type: string;
}

export class GameEngine {
  rooms: Map<RoomId, RoomState>;
  characters: Map<CharacterId, Character>;
  memory: MemoryStore;
  ticker: TickScheduler;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private notifyCallbacks: Map<CharacterId, NotifyCallback[]> = new Map();

  // World topology for perception calculations
  private topology: WorldTopology;

  constructor() {
    const world = createDemoWorld();
    this.rooms = world.rooms;
    this.characters = world.characters;
    this.memory = new MemoryStore();
    this.ticker = new TickScheduler(DEFAULT_TICK_CONFIG);

    this.topology = {
      getRoom: (id) => {
        const r = this.rooms.get(id);
        return r ? { id: r.id, exits: r.base.exits } : undefined;
      },
      hasLineOfSight: (_a, _b) => true,
      pathDistance: (a, b) => {
        if (a === b) return 0;
        // BFS for shortest path
        const visited = new Set<string>();
        const queue: Array<[string, number]> = [[a, 0]];
        visited.add(a);
        while (queue.length > 0) {
          const [current, dist] = queue.shift()!;
          const room = this.rooms.get(current);
          if (!room) continue;
          for (const exit of Object.values(room.base.exits)) {
            if (exit === b) return dist + 1;
            if (!visited.has(exit)) {
              visited.add(exit);
              queue.push([exit, dist + 1]);
            }
          }
        }
        return Infinity;
      },
      countWallsBetween: (_a, _b) => {
        // Simple: if adjacent, no wall; if distance > 1, 1 wall per extra step
        const dist = this.topology.pathDistance(_a, _b);
        return Math.max(0, dist - 1);
      },
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  startLoop(intervalMs?: number): void {
    const interval = intervalMs ?? DEFAULT_TICK_CONFIG.tickIntervalMs;
    console.log(`[engine] tick loop every ${interval / 1000}s (config: 5m, dev: 30s)`);

    // Run tick every interval
    this.tickTimer = setInterval(() => {
      this.runTick();
    }, interval);
  }

  stopLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // ── Tick ──────────────────────────────────────────

  runTick(): void {
    const now = Date.now();
    const tickRecord = this.ticker.schedule(now);

    if (tickRecord.status === 'skipped') {
      console.log(`[tick] #${tickRecord.id} SKIPPED (tick ${tickRecord.skippedBecause} overran)`);
      return;
    }

    this.ticker.startTick(tickRecord.id, now);
    console.log(`[tick] #${tickRecord.id} start (gameTime=${this.ticker.getCurrentGameTime()})`);

    // Build simulation context
    const ctx: SimulationContext = {
      rooms: this.rooms,
      currentTick: tickRecord.id,
      worldTime: this.ticker.getCurrentGameTime(),
    };

    // Run simulations
    advanceTimeOfDay(ctx);
    evolveWeather(ctx, (_roomId) => ({
      type: Math.random() > 0.8 ? 'rain' : 'clear' as 'rain' | 'clear',
      intensity: Math.random(),
    }));
    applyWeatherEffects(ctx);
    spreadFire(ctx);
    applyStructuralDecay(ctx);
    this.memory.decay(DEFAULT_DECAY_RATE);

    // Complete tick
    const gameTime = this.ticker.completeTick(tickRecord.id, now);
    console.log(`[tick] #${tickRecord.id} done → gameTime=${gameTime}`);

    // Notify connected clients
    this.broadcastTick();
  }

  // ── Actions ───────────────────────────────────────

  handleAction(charId: CharacterId, action: Action): ActionResult {
    const char = this.characters.get(charId);
    if (!char) {
      return { success: false, message: 'Character not found.', events: [] };
    }

    const result = processAction(
      action,
      char,
      this.rooms,
      this.ticker.getHistory().length,
      this.ticker.getCurrentGameTime(),
    );

    // For movement, update follow-up events
    if (result.events.length > 0) {
      this.broadcastEvents(charId, result.events);
    }

    return result;
  }

  // ── View Generation ───────────────────────────────

  generateView(charId: CharacterId): CharacterView {
    const char = this.characters.get(charId);
    if (!char) {
      return {
        self: { characterId: charId, name: '?', roomId: '', hp: { current: 0, max: 0 }, mp: { current: 0, max: 0 } },
        currentRoom: { name: 'Void', description: 'You are lost.', exits: [], occupants: [], marks: [], timeOfDay: 'day', weather: 'clear' },
        events: [],
        availableActions: [],
      };
    }

    const room = this.rooms.get(char.roomId);

    const selfSnap: CharacterSnapshot = {
      characterId: char.id,
      name: char.name,
      roomId: char.roomId,
      hp: { ...char.attributes.hp },
      mp: { ...char.attributes.mp },
    };

    const roomView: RoomView = room
      ? {
          name: room.base.name,
          description: room.base.description,
          exits: Object.keys(room.base.exits),
          occupants: [],
          marks: room.dynamic.visible.marks,
          timeOfDay: room.dynamic.timeOfDay,
          weather: `${room.dynamic.weather.type} (${Math.round(room.dynamic.weather.intensity * 100)}%)`,
        }
      : { name: 'Void', description: 'You are lost.', exits: [], occupants: [], marks: [], timeOfDay: 'day', weather: 'clear' };

    // Add other characters in same room
    for (const [, other] of this.characters) {
      if (other.id !== charId && other.roomId === char.roomId) {
        roomView.occupants.push(other.name);
      }
    }

    return {
      self: selfSnap,
      currentRoom: roomView,
      events: [],
      availableActions: ['look', 'move', 'say', 'who', 'inventory'],
    };
  }

  // ── Client Notifications ──────────────────────────

  onNotify(charId: CharacterId, cb: NotifyCallback): void {
    if (!this.notifyCallbacks.has(charId)) {
      this.notifyCallbacks.set(charId, []);
    }
    this.notifyCallbacks.get(charId)!.push(cb);
  }

  private broadcastTick(): void {
    for (const charId of this.characters.keys()) {
      const view = this.generateView(charId);
      this.notify(charId, {
        type: 'tick',
        payload: view,
      });
    }
  }

  private broadcastEvents(charId: CharacterId, events: WorldEvent[]): void {
    const narrated = events.map((e) => ({
      id: e.id,
      message: `${e.type}: ${JSON.stringify(e.payload)}`,
      type: e.type,
    }));
    this.notify(charId, {
      type: 'events',
      payload: { events: narrated },
    });
  }

  private notify(charId: CharacterId, message: unknown): void {
    const cbs = this.notifyCallbacks.get(charId);
    if (!cbs) return;
    for (const cb of cbs) {
      try { cb(charId, message); } catch { /* noop */ }
    }
  }
}
