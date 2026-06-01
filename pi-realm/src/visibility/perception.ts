// Cross-location perception: simplified distance model
// Each event propagates through 4 channels: damage, light, sound, vibration

import type {
  Character,
  PerceptionResult,
  RoomId,
  WorldEvent,
} from '../types.ts';

export interface WorldTopology {
  getRoom(id: RoomId): { id: RoomId; exits: Record<string, RoomId> } | undefined;
  hasLineOfSight(from: RoomId, to: RoomId): boolean;
  pathDistance(from: RoomId, to: RoomId): number;
  countWallsBetween(from: RoomId, to: RoomId): number;
}

export function applyFalloff(
  baseValue: number,
  distance: number,
  falloff: 'linear' | 'inverse_square' | 'constant',
): number {
  if (distance <= 0) return baseValue;
  switch (falloff) {
    case 'constant':
      return baseValue;
    case 'linear':
      return Math.max(0, baseValue - distance);
    case 'inverse_square':
      return baseValue / (1 + distance * distance);
  }
}

export function getDamageSensations(payload: Record<string, unknown>): string[] {
  const explicit = payload['sensations'];
  if (Array.isArray(explicit)) {
    return explicit.filter((s): s is string => typeof s === 'string');
  }
  // Infer from event type
  const type = payload['subtype'];
  if (type === 'fire') return ['fire', 'heat'];
  if (type === 'explosion') return ['fire', 'heat', 'shockwave', 'noise'];
  if (type === 'physical') return ['impact'];
  return ['impact'];
}

export function calculatePerception(
  event: WorldEvent,
  character: Character,
  topology: WorldTopology,
): PerceptionResult | null {
  const distance = topology.pathDistance(event.location, character.roomId);
  const walls = topology.countWallsBetween(event.location, character.roomId);
  const lineOfSight = topology.hasLineOfSight(event.location, character.roomId);

  // 1. Damage channel
  if (distance <= event.propagation.damage.radius) {
    const baseDamage = typeof event.payload['damage'] === 'number' ? event.payload['damage'] : 0;
    const damage = applyFalloff(baseDamage, distance, event.propagation.damage.falloff);
    if (damage > 0) {
      return {
        type: 'damage',
        damage,
        sensations: getDamageSensations(event.payload),
        witnessed: false,
      };
    }
  }

  // 2. Light/visual channel
  if (lineOfSight && distance <= event.propagation.light.radius) {
    return {
      type: 'witnessed',
      damage: 0,
      sensations: ['flame', 'shockwave', 'light'],
      witnessed: true,
    };
  }

  // 3. Sound channel
  const effectiveSoundRadius =
    event.propagation.sound.radius - walls * event.propagation.sound.obstacleReduction;
  if (distance <= effectiveSoundRadius) {
    return {
      type: 'heard',
      damage: 0,
      sensations: ['noise'],
      witnessed: false,
      muffled: walls > 0,
    };
  }

  // 4. Vibration channel
  const effectiveVibrationRadius =
    event.propagation.vibration.radius - walls * event.propagation.vibration.reducesPerWall;
  if (distance <= effectiveVibrationRadius) {
    return {
      type: 'felt',
      damage: 0,
      sensations: ['tremor', 'vibration'],
      witnessed: false,
    };
  }

  return null;
}
