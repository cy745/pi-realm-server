// Tests for Map State (objective world truth)
// Verifies: room creation, state change recording, history accumulation

import { describe, expect, it } from 'vitest';
import {
  createDefaultFire,
  createDefaultHidden,
  createDefaultVisible,
  createDefaultWeather,
  createRoom,
  recordStateChange,
} from '../src/game/room-state.ts';
import type { RoomState } from '../src/types.ts';

describe('Map State - Room Creation', () => {
  it('creates a room with default dynamic state', () => {
    const room = createRoom({
      id: 'castle-courtyard',
      name: 'Castle Courtyard',
      description: 'A quiet stone courtyard',
      exits: { N: 'throne-room', S: 'gate' },
      material: 'stone',
      capacity: 20,
    });

    expect(room.id).toBe('castle-courtyard');
    expect(room.base.name).toBe('Castle Courtyard');
    expect(room.base.material).toBe('stone');
    expect(room.base.exits).toEqual({ N: 'throne-room', S: 'gate' });
    expect(room.dynamic.structural).toBe(1.0);
    expect(room.dynamic.fire).toEqual(createDefaultFire());
    expect(room.dynamic.weather).toEqual(createDefaultWeather());
    expect(room.dynamic.visible).toEqual(createDefaultVisible());
    expect(room.dynamic.hidden).toEqual(createDefaultHidden());
    expect(room.history).toEqual([]);
  });

  it('each room has independent state', () => {
    const a = createRoom({
      id: 'a',
      name: 'A',
      description: '',
      exits: {},
      material: 'stone',
      capacity: 10,
    });
    const b = createRoom({
      id: 'b',
      name: 'B',
      description: '',
      exits: {},
      material: 'wood',
      capacity: 5,
    });
    a.dynamic.structural = 0.3;
    expect(b.dynamic.structural).toBe(1.0);
  });
});

describe('Map State - State Change Recording', () => {
  function makeRoom(): RoomState {
    return createRoom({
      id: 'r1',
      name: 'R',
      description: '',
      exits: {},
      material: 'stone',
      capacity: 10,
    });
  }

  it('records a state change with before/after snapshots', () => {
    const room = makeRoom();
    const change = recordStateChange(room, {
      roomId: 'r1',
      type: 'damage',
      cause: 'event',
      before: { structural: 1.0 },
      after: { structural: 0.7 },
      tick: 1,
      worldTime: 1,
    });

    expect(change.id).toBeTruthy();
    expect(change.type).toBe('damage');
    expect(change.before.structural).toBe(1.0);
    expect(change.after.structural).toBe(0.7);
    expect(change.witnessedBy).toEqual([]);
    expect(room.history).toHaveLength(1);
  });

  it('accumulates history in chronological order', () => {
    const room = makeRoom();
    recordStateChange(room, {
      roomId: 'r1',
      type: 'fire_started',
      cause: 'event',
      before: { fire: { intensity: 0, fuelRemaining: 0, spreadRadius: 0 } },
      after: { fire: { intensity: 0.5, fuelRemaining: 10, spreadRadius: 1 } },
      tick: 1,
      worldTime: 1,
    });
    recordStateChange(room, {
      roomId: 'r1',
      type: 'damage',
      cause: 'event',
      before: { structural: 1.0 },
      after: { structural: 0.8 },
      tick: 2,
      worldTime: 2,
    });

    expect(room.history).toHaveLength(2);
    expect(room.history[0]!.type).toBe('fire_started');
    expect(room.history[1]!.type).toBe('damage');
  });

  it('tracks witnessedBy list for memory anchoring', () => {
    const room = makeRoom();
    const change = recordStateChange(room, {
      roomId: 'r1',
      type: 'damage',
      cause: 'event',
      before: { structural: 1.0 },
      after: { structural: 0.5 },
      tick: 1,
      worldTime: 1,
      witnessedBy: ['char-1', 'char-2'],
    });
    expect(change.witnessedBy).toEqual(['char-1', 'char-2']);
  });

  it('each state change has unique id', () => {
    const room = makeRoom();
    const c1 = recordStateChange(room, {
      roomId: 'r1',
      type: 'damage',
      cause: 'event',
      before: {},
      after: {},
      tick: 1,
      worldTime: 1,
    });
    const c2 = recordStateChange(room, {
      roomId: 'r1',
      type: 'damage',
      cause: 'event',
      before: {},
      after: {},
      tick: 2,
      worldTime: 2,
    });
    expect(c1.id).not.toBe(c2.id);
  });
});
