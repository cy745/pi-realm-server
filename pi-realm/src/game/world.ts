// World initialization — coordinate-based map system
// Replace the old room-based system with infinite Perlin noise terrain + regions

import { TerrainSampler, terrainSpeedFactor, terrainStaminaCost } from '../map/terrain.ts';
import { createDemoLocations } from '../map/region.ts';
import type { Character } from '../types.ts';

export interface WorldState {
  terrain: TerrainSampler;
  regions: ReturnType<typeof createDemoLocations>;
  chars: Map<string, Character>;
}

export function createWorld(seed = 42): WorldState {
  const terrain = new TerrainSampler(seed);
  const regions = createDemoLocations(seed);

  const chars = new Map<string, Character>();

  // Player
  chars.set('player-1', {
    id: 'player-1',
    name: 'Wanderer',
    type: 'player',
    x: 500, y: 800,  // Raven's Hollow Market Square
    attributes: { level: 1, hp: { current: 100, max: 100 }, mp: { current: 50, max: 50 }, atk: 10, def: 5, spd: 5 },
    movement: { speed: 1.4, currentStamina: 100, maxStamina: 100, vehicle: null },
    goals: [],
    isOnline: false,
  });

  // NPCs
  chars.set('npc-bartender', {
    id: 'npc-bartender',
    name: 'Grum',
    type: 'npc',
    x: 520, y: 780,  // The Crown & Sword tavern
    attributes: { level: 3, hp: { current: 80, max: 80 }, mp: { current: 30, max: 30 }, atk: 6, def: 4, spd: 3 },
    movement: { speed: 1.2, currentStamina: 100, maxStamina: 100, vehicle: null },
    faction: 'village',
    goals: ['keep the tavern running', 'gather rumors'],
    isOnline: false,
  });

  chars.set('npc-smith', {
    id: 'npc-smith',
    name: 'Hilda',
    type: 'npc',
    x: 470, y: 830,  // Hollow Forge
    attributes: { level: 5, hp: { current: 120, max: 120 }, mp: { current: 20, max: 20 }, atk: 14, def: 8, spd: 4 },
    movement: { speed: 1.0, currentStamina: 120, maxStamina: 120, vehicle: null },
    faction: 'village',
    goals: ['craft weapons', 'find rare ore'],
    isOnline: false,
  });

  chars.set('npc-guard', {
    id: 'npc-guard',
    name: 'Aldric',
    type: 'npc',
    x: 500, y: 810,  // Raven's Hollow, patrolling
    attributes: { level: 4, hp: { current: 150, max: 150 }, mp: { current: 40, max: 40 }, atk: 12, def: 10, spd: 6 },
    movement: { speed: 1.6, currentStamina: 150, maxStamina: 150, vehicle: null },
    faction: 'village',
    goals: ['patrol the square', 'protect the village'],
    isOnline: false,
  });

  chars.set('npc-mysterious', {
    id: 'npc-mysterious',
    name: '???',
    type: 'npc',
    x: -1800, y: 2000,  // Old Crypt Ruins
    attributes: { level: 8, hp: { current: 200, max: 200 }, mp: { current: 100, max: 100 }, atk: 18, def: 12, spd: 10 },
    movement: { speed: 1.5, currentStamina: 200, maxStamina: 200, vehicle: null },
    faction: 'unknown',
    goals: ['search the ruins for artifacts'],
    isOnline: false,
  });

  return { terrain, regions, chars };
}

/** Distance between two characters (meters) */
export function charDistance(a: Character, b: Character): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Distance between a coordinate and a character */
export function coordCharDistance(x: number, y: number, char: Character): number {
  return Math.sqrt((x - char.x) ** 2 + (y - char.y) ** 2);
}
