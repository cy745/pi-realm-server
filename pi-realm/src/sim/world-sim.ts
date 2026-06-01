// Background world simulation
// Each tick: time, weather, fire, decay, vegetation

import type {
  RoomId,
  RoomState,
  StateChange,
  WeatherType,
} from '../types.ts';
import { recordStateChange } from '../game/room-state.ts';

export interface SimulationContext {
  rooms: Map<RoomId, RoomState>;
  currentTick: number;
  worldTime: number;
}

export function advanceTimeOfDay(ctx: SimulationContext): void {
  // Cycle: dawn -> day -> dusk -> night -> dawn
  const cycle: Array<'dawn' | 'day' | 'dusk' | 'night'> = ['dawn', 'day', 'dusk', 'night'];
  for (const room of ctx.rooms.values()) {
    const currentIndex = cycle.indexOf(room.dynamic.timeOfDay);
    const nextIndex = (currentIndex + 1) % cycle.length;
    const next = cycle[nextIndex]!;
    const before = { timeOfDay: room.dynamic.timeOfDay };
    room.dynamic.timeOfDay = next;
    recordStateChange(room, {
      roomId: room.id,
      type: 'time_change',
      cause: 'decay',
      before,
      after: { timeOfDay: next },
      tick: ctx.currentTick,
      worldTime: ctx.worldTime,
    });
  }
}

export interface WeatherUpdate {
  type: WeatherType;
  intensity: number;
}

export function evolveWeather(
  ctx: SimulationContext,
  getWeather: (roomId: RoomId) => WeatherUpdate | null,
): StateChange[] {
  const changes: StateChange[] = [];
  for (const room of ctx.rooms.values()) {
    const update = getWeather(room.id);
    if (!update) continue;
    if (update.type === room.dynamic.weather.type && update.intensity === room.dynamic.weather.intensity) {
      continue;
    }
    const before = {
      weather: { ...room.dynamic.weather },
    };
    room.dynamic.weather = {
      type: update.type,
      intensity: update.intensity,
    };
    const change = recordStateChange(room, {
      roomId: room.id,
      type: 'weather_change',
      cause: 'weather',
      before,
      after: { weather: { ...room.dynamic.weather } },
      tick: ctx.currentTick,
      worldTime: ctx.worldTime,
    });
    changes.push(change);
  }
  return changes;
}

export function applyWeatherEffects(ctx: SimulationContext): void {
  for (const room of ctx.rooms.values()) {
    const w = room.dynamic.weather;
    // Rain extinguishes fire
    if (w.type === 'rain' && room.dynamic.fire.intensity > 0) {
      const before = { fire: { ...room.dynamic.fire } };
      room.dynamic.fire.intensity = Math.max(0, room.dynamic.fire.intensity - 0.1 * w.intensity);
      recordStateChange(room, {
        roomId: room.id,
        type: 'fire_extinguished',
        cause: 'weather',
        before,
        after: { fire: { ...room.dynamic.fire } },
        tick: ctx.currentTick,
        worldTime: ctx.worldTime,
      });
    }
    // Storm damages wooden structures
    if (w.type === 'storm' && room.base.material === 'wood') {
      const before = { structural: room.dynamic.structural };
      room.dynamic.structural = Math.max(0, room.dynamic.structural - 0.01 * w.intensity);
      recordStateChange(room, {
        roomId: room.id,
        type: 'structural_decay',
        cause: 'weather',
        before,
        after: { structural: room.dynamic.structural },
        tick: ctx.currentTick,
        worldTime: ctx.worldTime,
      });
    }
  }
}

export function spreadFire(ctx: SimulationContext): StateChange[] {
  const changes: StateChange[] = [];
  // Collect rooms with fire first to avoid mutation during iteration
  const burningRooms = Array.from(ctx.rooms.values()).filter(
    (r) => r.dynamic.fire.intensity > 0,
  );

  for (const room of burningRooms) {
    // Decrement fuel
    room.dynamic.fire.fuelRemaining -= 1;
    if (room.dynamic.fire.fuelRemaining <= 0) {
      const before = { fire: { ...room.dynamic.fire } };
      room.dynamic.fire.intensity = 0;
      room.dynamic.fire.fuelRemaining = 0;
      const change = recordStateChange(room, {
        roomId: room.id,
        type: 'fire_extinguished',
        cause: 'decay',
        before,
        after: { fire: { ...room.dynamic.fire } },
        tick: ctx.currentTick,
        worldTime: ctx.worldTime,
      });
      changes.push(change);
      continue;
    }

    // Spread to adjacent rooms
    for (const [, neighborId] of Object.entries(room.base.exits)) {
      const neighbor = ctx.rooms.get(neighborId);
      if (!neighbor) continue;
      if (neighbor.dynamic.fire.intensity > 0) continue;
      // Don't spread to stone easily
      const ignitionThreshold = neighbor.base.material === 'wood' ? 0.3 : 0.7;
      if (room.dynamic.fire.intensity >= ignitionThreshold) {
        const before = { fire: { ...neighbor.dynamic.fire } };
        neighbor.dynamic.fire.intensity = 0.3;
        neighbor.dynamic.fire.fuelRemaining = 10;
        const change = recordStateChange(neighbor, {
          roomId: neighbor.id,
          type: 'fire_spread',
          cause: 'fire_spread',
          causedBy: room.id,
          before,
          after: { fire: { ...neighbor.dynamic.fire } },
          tick: ctx.currentTick,
          worldTime: ctx.worldTime,
        });
        changes.push(change);
      }
    }
  }

  return changes;
}

export function applyStructuralDecay(ctx: SimulationContext): void {
  for (const room of ctx.rooms.values()) {
    if (room.dynamic.structural < 1.0 && room.dynamic.structural > 0) {
      const decay = 0.005;
      const before = { structural: room.dynamic.structural };
      room.dynamic.structural = Math.max(0, room.dynamic.structural - decay);
      if (room.dynamic.structural === 0) {
        recordStateChange(room, {
          roomId: room.id,
          type: 'collapse',
          cause: 'decay',
          before,
          after: { structural: 0 },
          tick: ctx.currentTick,
          worldTime: ctx.worldTime,
        });
      }
    }
  }
}
