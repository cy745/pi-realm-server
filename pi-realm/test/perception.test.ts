// Tests for Cross-Location Perception
// Verifies: damage falloff, light line-of-sight, sound/vibration propagation

import { describe, expect, it } from 'vitest';
import {
  applyFalloff,
  calculatePerception,
  getDamageSensations,
  type WorldTopology,
} from '../src/visibility/perception.ts';
import type { Character, WorldEvent } from '../src/types.ts';

function makeCharacter(roomId: string, level = 10): Character {
  return {
    id: 'c1',
    name: 'C1',
    type: 'player',
    roomId,
    attributes: {
      level,
      hp: { current: 100, max: 100 },
      mp: { current: 50, max: 50 },
      atk: 10,
      def: 5,
      spd: 5,
    },
    goals: [],
    isOnline: true,
  };
}

function makeExplosionEvent(location: string, damage = 100): WorldEvent {
  return {
    id: 'e1',
    type: 'explosion',
    tick: 1,
    worldTime: 1,
    location,
    payload: { damage, subtype: 'explosion' },
    propagation: {
      sound: { radius: 8, obstacleReduction: 2 },
      light: { radius: 6, blockedByWalls: true },
      damage: { radius: 3, falloff: 'linear' },
      vibration: { radius: 12, reducesPerWall: 1 },
    },
  };
}

function makeTopology(
  positions: Map<string, { x: number; y: number }>,
  walls: Array<[string, string]>,
): WorldTopology {
  const wallCounts = new Map<string, number>();
  for (const [a, b] of walls) {
    const key = `${a}|${b}`;
    wallCounts.set(key, (wallCounts.get(key) ?? 0) + 1);
  }

  function distance(a: string, b: string): number {
    if (a === b) return 0;
    const pa = positions.get(a);
    const pb = positions.get(b);
    if (!pa || !pb) return 1;
    return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
  }

  return {
    getRoom: (id) => ({ id, exits: {} }),
    hasLineOfSight: (a, b) => {
      if (a === b) return true;
      return (wallCounts.get(`${a}|${b}`) ?? 0) === 0;
    },
    pathDistance: distance,
    countWallsBetween: (a, b) => {
      if (a === b) return 0;
      return wallCounts.get(`${a}|${b}`) ?? 0;
    },
  };
}

describe('Perception - Falloff', () => {
  it('linear falloff: damage = base - distance', () => {
    expect(applyFalloff(100, 0, 'linear')).toBe(100);
    expect(applyFalloff(100, 3, 'linear')).toBe(97);
    expect(applyFalloff(100, 5, 'linear')).toBe(95);
  });

  it('linear falloff clamps to 0 at distance >= base', () => {
    expect(applyFalloff(100, 100, 'linear')).toBe(0);
    expect(applyFalloff(100, 200, 'linear')).toBe(0);
  });

  it('inverse_square falloff: damage = base / (1 + d^2)', () => {
    expect(applyFalloff(100, 0, 'inverse_square')).toBe(100);
    expect(applyFalloff(100, 1, 'inverse_square')).toBe(50);
    expect(applyFalloff(100, 2, 'inverse_square')).toBeCloseTo(100 / 5);
  });

  it('constant falloff: no distance reduction', () => {
    expect(applyFalloff(100, 0, 'constant')).toBe(100);
    expect(applyFalloff(100, 5, 'constant')).toBe(100);
  });
});

describe('Perception - Damage Channel', () => {
  it('character in same room takes full damage', () => {
    const event = makeExplosionEvent('courtyard', 100);
    const char = makeCharacter('courtyard');
    const topology = makeTopology(new Map([['courtyard', { x: 0, y: 0 }]]), []);

    const result = calculatePerception(event, char, topology);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('damage');
    expect(result?.damage).toBe(100);
  });

  it('damage decreases linearly with distance', () => {
    const event = makeExplosionEvent('a', 100);
    const char = makeCharacter('b');
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 2, y: 0 }],
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    expect(result?.type).toBe('damage');
    expect(result?.damage).toBe(98);
  });

  it('damage channel has highest priority', () => {
    // Even with no light/sound range, damage applies
    const event = makeExplosionEvent('a', 50);
    event.propagation.sound.radius = 0;
    event.propagation.light.radius = 0;
    event.propagation.vibration.radius = 0;
    const char = makeCharacter('b');
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 1, y: 0 }],
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    expect(result?.type).toBe('damage');
  });

  it('outside damage radius: falls through to other channels', () => {
    const event = makeExplosionEvent('a', 50);
    const char = makeCharacter('b');
    // distance 7, damage radius 3 -> no damage; light radius 6 -> no visual; sound radius 8 -> hears
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 7, y: 0 }],
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    expect(result?.type).toBe('heard');
  });
});

describe('Perception - Light Channel', () => {
  it('direct line of sight: witnesses event', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 4, y: 0 }], // distance 4, light radius 6
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    expect(result?.type).toBe('witnessed');
    expect(result?.witnessed).toBe(true);
  });

  it('walls block light: does not witness', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 2, y: 0 }],
      ]),
      [['a', 'b']], // wall between
    );

    const result = calculatePerception(event, char, topology);
    // damage: distance 2, radius 3, but damage=0 so no damage
    // light: blocked by wall
    // sound: 8 - 1*2 = 6, distance 2 <= 6, hears
    // vibration: 12 - 1*1 = 11, distance 2 <= 11
    // priority: damage (0 damage fails) > light (blocked) > sound
    expect(result?.type).toBe('heard');
  });

  it('beyond light radius: no visual', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 10, y: 0 }], // distance 10, light radius 6
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    // damage: 10 > 3, no damage
    // light: 10 > 6, no visual
    // sound: 8, distance 10 > 8
    // vibration: 12, distance 10 <= 12, feels
    expect(result?.type).toBe('felt');
  });
});

describe('Perception - Sound Channel', () => {
  it('within sound range and no walls: hears clearly', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    // distance 7: light radius 6 fails, sound radius 8 passes
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 7, y: 0 }],
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    expect(result?.type).toBe('heard');
    expect(result?.muffled).toBe(false);
  });

  it('walls reduce sound radius', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    // 3 walls, each reduces 2, so effective range = 8 - 6 = 2
    // distance 5 > 2, no sound
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 5, y: 0 }],
      ]),
      [['a', 'b'], ['a', 'b'], ['a', 'b']], // 3 walls
    );

    const result = calculatePerception(event, char, topology);
    // sound: effective range 2, distance 5 -> no sound
    // vibration: 12 - 3*1 = 9, distance 5 <= 9 -> feels
    expect(result?.type).toBe('felt');
  });

  it('reports muffled when walls present', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 3, y: 0 }], // within sound radius even with 1 wall
      ]),
      [['a', 'b']],
    );

    const result = calculatePerception(event, char, topology);
    // sound: 8 - 2 = 6, distance 3 <= 6, hears
    expect(result?.type).toBe('heard');
    expect(result?.muffled).toBe(true);
  });
});

describe('Perception - Vibration Channel', () => {
  it('vibration penetrates walls: feels tremor at distance', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    // 5 walls, each reduces 1, effective range = 12 - 5 = 7
    // distance 5 <= 7, feels
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 5, y: 0 }],
      ]),
      [
        ['a', 'b'],
        ['a', 'b'],
        ['a', 'b'],
        ['a', 'b'],
        ['a', 'b'],
      ],
    );

    const result = calculatePerception(event, char, topology);
    expect(result?.type).toBe('felt');
    expect(result?.sensations).toContain('tremor');
  });

  it('out of all channels: no perception', () => {
    const event = makeExplosionEvent('a', 0);
    const char = makeCharacter('b');
    // distance 100, no channel reaches
    const topology = makeTopology(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 100, y: 0 }],
      ]),
      [],
    );

    const result = calculatePerception(event, char, topology);
    expect(result).toBeNull();
  });
});

describe('Perception - Sensations', () => {
  it('infers sensations from event subtype', () => {
    expect(getDamageSensations({ subtype: 'fire' })).toEqual(['fire', 'heat']);
    expect(getDamageSensations({ subtype: 'explosion' })).toEqual([
      'fire',
      'heat',
      'shockwave',
      'noise',
    ]);
    expect(getDamageSensations({ subtype: 'physical' })).toEqual(['impact']);
  });

  it('uses explicit sensations if provided', () => {
    const result = getDamageSensations({ sensations: ['cold', 'darkness'] });
    expect(result).toEqual(['cold', 'darkness']);
  });
});
