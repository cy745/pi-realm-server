// Game Engine — coordinate-based map system
// Replaces room-based map with infinite Perlin noise terrain + regions

import { MemoryStore, DEFAULT_DECAY_RATE } from './memory.ts';
import { calculateMove, applyMove, restTick } from './movement.ts';
import { createWorld, charDistance, type WorldState } from './world.ts';
import { processAction, type Action, type ActionResult } from './actions.ts';
import { advanceTimeOfDay, applyStructuralDecay, applyWeatherEffects, evolveWeather, spreadFire, type SimulationContext } from '../sim/world-sim.ts';
import { TickScheduler, DEFAULT_TICK_CONFIG } from '../tick/tick-loop.ts';
import { terrainSpeedFactor } from '../map/terrain.ts';
import type { CharacterId, WorldEvent } from '../types.ts';

export const TICK_STAMINA_RESTORE = 0.02; // 2% per tick

export type NotifyCallback = (characterId: CharacterId, message: unknown) => void;

export interface CharacterView {
  self: CharacterSnapshot;
  location: string;
  terrain: string;
  address: string;
  orientation: string;
  events: NarratedEvent[];
  availableActions: string[];
}

interface CharacterSnapshot {
  characterId: CharacterId;
  name: string;
  x: number;
  y: number;
  hp: { current: number; max: number };
  mp: { current: number; max: number };
  stamina: { current: number; max: number };
  vehicle: string | null;
}

interface NarratedEvent {
  id: string;
  message: string;
  type: string;
}

export class GameEngine {
  world: WorldState;
  memory: MemoryStore;
  ticker: TickScheduler;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private notifyCallbacks: Map<CharacterId, NotifyCallback[]> = new Map();

  constructor() {
    this.world = createWorld(42);
    this.memory = new MemoryStore();
    this.ticker = new TickScheduler(DEFAULT_TICK_CONFIG);
  }

  // ── Lifecycle ─────────────────────────────────────

  startLoop(intervalMs?: number): void {
    const interval = intervalMs ?? DEFAULT_TICK_CONFIG.tickIntervalMs;
    console.log(`[engine] tick loop every ${interval / 1000}s`);

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

    // Rest stamina for all characters
    for (const char of this.world.chars.values()) {
      restTick(char, 1);
    }

    this.memory.decay(DEFAULT_DECAY_RATE);

    const gameTime = this.ticker.completeTick(tickRecord.id, now);
    console.log(`[tick] #${tickRecord.id} done → gameTime=${gameTime}`);

    this.broadcastTick();
  }

  // ── Actions ───────────────────────────────────────

  handleAction(charId: CharacterId, action: Action): ActionResult {
    const char = this.world.chars.get(charId);
    if (!char) {
      return { success: false, message: 'Character not found.', events: [] };
    }

    const result = processAction(
      action, char,
      this.world.regions, this.world.terrain,
      this.ticker.getHistory().length,
      this.ticker.getCurrentGameTime(),
    );

    if (result.events.length > 0) {
      this.broadcastEvents(charId, result.events);
    }

    return result;
  }

  // ── View Generation ───────────────────────────────

  generateView(charId: CharacterId): CharacterView {
    const char = this.world.chars.get(charId);
    if (!char) {
      return {
        self: { characterId: charId, name: '?', x: 0, y: 0, hp: { current: 0, max: 0 }, mp: { current: 0, max: 0 }, stamina: { current: 0, max: 0 }, vehicle: null },
        location: 'Void',
        terrain: 'unknown',
        address: 'Lost',
        orientation: 'nowhere',
        events: [],
        availableActions: [],
      };
    }

    const ts = this.world.terrain.sample(char.x, char.y);
    const address = this.world.regions.getAddressString(char.x, char.y);
    const orientation = this.world.regions.getOrientation(char.x, char.y);

    return {
      self: {
        characterId: char.id,
        name: char.name,
        x: char.x,
        y: char.y,
        hp: { ...char.attributes.hp },
        mp: { ...char.attributes.mp },
        stamina: { current: Math.round(char.movement.currentStamina), max: char.movement.maxStamina },
        vehicle: char.movement.vehicle,
      },
      location: address.split(' › ').pop() ?? 'Wilderness',
      terrain: ts.type,
      address,
      orientation,
      events: [],
      availableActions: ['look', 'move', 'say', 'rest', 'address', 'who'],
    };
  }

  // ── Notifications ─────────────────────────────────

  onNotify(charId: CharacterId, cb: NotifyCallback): void {
    if (!this.notifyCallbacks.has(charId)) {
      this.notifyCallbacks.set(charId, []);
    }
    this.notifyCallbacks.get(charId)!.push(cb);
  }

  private broadcastTick(): void {
    for (const charId of this.world.chars.keys()) {
      const view = this.generateView(charId);
      this.notify(charId, { type: 'tick', payload: view });
    }
  }

  private broadcastEvents(charId: CharacterId, events: WorldEvent[]): void {
    const narrated = events.map((e) => ({
      id: e.id,
      message: `${e.type}: ${JSON.stringify(e.payload)}`,
      type: e.type,
    }));
    this.notify(charId, { type: 'events', payload: { events: narrated } });
  }

  private notify(charId: CharacterId, message: unknown): void {
    const cbs = this.notifyCallbacks.get(charId);
    if (!cbs) return;
    for (const cb of cbs) {
      try { cb(charId, message); } catch { /* noop */ }
    }
  }
}
