// Tests for Background World Simulation
// Verifies: time of day cycle, weather effects, fire spread, structural decay

import { describe, expect, it } from 'vitest';
import {
  advanceTimeOfDay,
  applyStructuralDecay,
  applyWeatherEffects,
  evolveWeather,
  spreadFire,
  type SimulationContext,
} from '../src/sim/world-sim.ts';
import { createRoom } from '../src/game/room-state.ts';
import type { RoomId, RoomState } from '../src/types.ts';

function makeRoom(id: RoomId, material: 'stone' | 'wood' = 'stone'): RoomState {
  return createRoom({
    id,
    name: id,
    description: '',
    exits: {},
    material,
    capacity: 10,
  });
}

function makeCtx(rooms: RoomState[], currentTick = 1, worldTime = 1): SimulationContext {
  const map = new Map<RoomId, RoomState>();
  for (const r of rooms) map.set(r.id, r);
  return { rooms: map, currentTick, worldTime };
}

describe('Background Sim - Time of Day', () => {
  it('advances all rooms through the cycle', () => {
    const a = makeRoom('a');
    const b = makeRoom('b');
    const ctx = makeCtx([a, b]);

    expect(a.dynamic.timeOfDay).toBe('day');
    advanceTimeOfDay(ctx);
    expect(a.dynamic.timeOfDay).toBe('dusk');
    expect(b.dynamic.timeOfDay).toBe('dusk');

    advanceTimeOfDay(ctx);
    expect(a.dynamic.timeOfDay).toBe('night');

    advanceTimeOfDay(ctx);
    expect(a.dynamic.timeOfDay).toBe('dawn');

    advanceTimeOfDay(ctx);
    expect(a.dynamic.timeOfDay).toBe('day'); // back to start
  });

  it('records state change for time advance', () => {
    const a = makeRoom('a');
    const ctx = makeCtx([a]);
    advanceTimeOfDay(ctx);
    expect(a.history).toHaveLength(1);
    expect(a.history[0]!.type).toBe('time_change');
  });
});

describe('Background Sim - Weather Evolution', () => {
  it('updates weather when provider returns new state', () => {
    const a = makeRoom('a');
    const ctx = makeCtx([a]);
    const changes = evolveWeather(ctx, () => ({ type: 'rain', intensity: 0.5 }));
    expect(a.dynamic.weather.type).toBe('rain');
    expect(a.dynamic.weather.intensity).toBe(0.5);
    expect(changes).toHaveLength(1);
  });

  it('does not record change when weather unchanged', () => {
    const a = makeRoom('a');
    const ctx = makeCtx([a]);
    a.dynamic.weather = { type: 'clear', intensity: 0 };
    const changes = evolveWeather(ctx, () => ({ type: 'clear', intensity: 0 }));
    expect(changes).toHaveLength(0);
  });
});

describe('Background Sim - Weather Effects', () => {
  it('rain extinguishes fire', () => {
    const a = makeRoom('a');
    a.dynamic.fire.intensity = 0.8;
    a.dynamic.fire.fuelRemaining = 10;
    const ctx = makeCtx([a]);
    a.dynamic.weather = { type: 'rain', intensity: 1.0 };

    applyWeatherEffects(ctx);
    expect(a.dynamic.fire.intensity).toBeLessThan(0.8);
  });

  it('storm damages wooden structures', () => {
    const a = makeRoom('a', 'wood');
    a.dynamic.structural = 1.0;
    const ctx = makeCtx([a]);
    a.dynamic.weather = { type: 'storm', intensity: 1.0 };

    applyWeatherEffects(ctx);
    expect(a.dynamic.structural).toBeLessThan(1.0);
  });

  it('storm does not damage stone structures', () => {
    const a = makeRoom('a', 'stone');
    a.dynamic.structural = 1.0;
    const ctx = makeCtx([a]);
    a.dynamic.weather = { type: 'storm', intensity: 1.0 };

    applyWeatherEffects(ctx);
    expect(a.dynamic.structural).toBe(1.0);
  });
});

describe('Background Sim - Fire Spread', () => {
  it('decrements fuel over time', () => {
    const a = makeRoom('a');
    a.dynamic.fire.intensity = 0.5;
    a.dynamic.fire.fuelRemaining = 3;
    const ctx = makeCtx([a]);

    spreadFire(ctx);
    expect(a.dynamic.fire.fuelRemaining).toBe(2);
  });

  it('fire extinguishes when fuel runs out', () => {
    const a = makeRoom('a');
    a.dynamic.fire.intensity = 0.5;
    a.dynamic.fire.fuelRemaining = 1;
    const ctx = makeCtx([a]);

    spreadFire(ctx);
    expect(a.dynamic.fire.intensity).toBe(0);
  });

  it('fire spreads to adjacent wooden rooms', () => {
    const burning = makeRoom('burning', 'wood');
    const neighbor = makeRoom('neighbor', 'wood');
    burning.base.exits = { E: 'neighbor' };
    burning.dynamic.fire.intensity = 1.0;
    burning.dynamic.fire.fuelRemaining = 10;
    const ctx = makeCtx([burning, neighbor]);

    spreadFire(ctx);
    expect(neighbor.dynamic.fire.intensity).toBeGreaterThan(0);
  });

  it('fire does not spread to stone easily', () => {
    const burning = makeRoom('burning', 'wood');
    const stone = makeRoom('stone', 'stone');
    burning.base.exits = { E: 'stone' };
    burning.dynamic.fire.intensity = 0.5; // not enough to ignite stone
    burning.dynamic.fire.fuelRemaining = 10;
    const ctx = makeCtx([burning, stone]);

    spreadFire(ctx);
    expect(stone.dynamic.fire.intensity).toBe(0);
  });

  it('records state change when fire spreads', () => {
    const burning = makeRoom('burning', 'wood');
    const neighbor = makeRoom('neighbor', 'wood');
    burning.base.exits = { E: 'neighbor' };
    burning.dynamic.fire.intensity = 1.0;
    burning.dynamic.fire.fuelRemaining = 10;
    const ctx = makeCtx([burning, neighbor]);

    spreadFire(ctx);
    const spreadChange = neighbor.history.find((c) => c.type === 'fire_spread');
    expect(spreadChange).toBeDefined();
    expect(spreadChange?.cause).toBe('fire_spread');
  });
});

describe('Background Sim - Structural Decay', () => {
  it('decays damaged structures over time', () => {
    const a = makeRoom('a');
    a.dynamic.structural = 0.5;
    const ctx = makeCtx([a]);

    applyStructuralDecay(ctx);
    expect(a.dynamic.structural).toBeLessThan(0.5);
  });

  it('does not decay fully intact structures', () => {
    const a = makeRoom('a');
    a.dynamic.structural = 1.0;
    const ctx = makeCtx([a]);

    applyStructuralDecay(ctx);
    expect(a.dynamic.structural).toBe(1.0);
  });

  it('records collapse when structural reaches 0', () => {
    const a = makeRoom('a');
    a.dynamic.structural = 0.001;
    const ctx = makeCtx([a]);

    applyStructuralDecay(ctx);
    expect(a.dynamic.structural).toBe(0);
    const collapse = a.history.find((c) => c.type === 'collapse');
    expect(collapse).toBeDefined();
  });
});
