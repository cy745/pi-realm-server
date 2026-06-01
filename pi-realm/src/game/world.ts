// World initialization — creates demo content for the game loop

import { createRoom, type CreateRoomOptions } from './room-state.ts';
import type { Character, RoomState } from '../types.ts';

export function createDemoWorld(): {
  rooms: Map<string, RoomState>;
  characters: Map<string, Character>;
} {
  const rooms = new Map<string, RoomState>();
  const characters = new Map<string, Character>();

  // ── Rooms ──────────────────────────────────────────
  const roomDefs: CreateRoomOptions[] = [
    {
      id: 'village-square',
      name: 'Village Square',
      description: 'A cobblestone square at the heart of the village. A weathered fountain gurgles in the center.',
      exits: { N: 'blacksmith', E: 'tavern', S: 'forest-path' },
      material: 'stone',
      capacity: 30,
    },
    {
      id: 'tavern',
      name: 'The Drunken Dragon Tavern',
      description: 'Warm firelight flickers across wooden walls. The air smells of ale and roasted meat.',
      exits: { W: 'village-square' },
      material: 'wood',
      capacity: 15,
    },
    {
      id: 'blacksmith',
      name: 'Blacksmith Workshop',
      description: 'Heat radiates from the forge. Hammers and half-finished blades line the walls.',
      exits: { S: 'village-square' },
      material: 'stone',
      capacity: 5,
    },
    {
      id: 'forest-path',
      name: 'Forest Path',
      description: 'A dirt path winding through towering pines. Sunlight filters through the canopy.',
      exits: { N: 'village-square', S: 'old-ruins' },
      material: 'earth',
      capacity: 10,
    },
    {
      id: 'old-ruins',
      name: 'Old Ruins',
      description: 'Crumbling stone walls overgrown with ivy. Strange symbols are carved into the remaining pillars.',
      exits: { N: 'forest-path', DOWN: 'ruins-crypt' },
      material: 'stone',
      capacity: 8,
    },
    {
      id: 'ruins-crypt',
      name: 'Underground Crypt',
      description: 'Dark and damp. Cobwebs stretch between ancient sarcophagi. A faint glow emanates from the floor.',
      exits: { UP: 'old-ruins' },
      material: 'stone',
      capacity: 6,
    },
  ];

  for (const def of roomDefs) {
    rooms.set(def.id, createRoom(def));
  }

  // ── Characters ─────────────────────────────────────

  const playerTemplates: Character[] = [
    {
      id: 'player-1',
      name: 'Wanderer',
      type: 'player',
      roomId: 'village-square',
      attributes: { level: 1, hp: { current: 100, max: 100 }, mp: { current: 50, max: 50 }, atk: 10, def: 5, spd: 5 },
      goals: [],
      isOnline: false,
    },
  ];

  const npcTemplates: Character[] = [
    {
      id: 'npc-bartender',
      name: 'Grum',
      type: 'npc',
      roomId: 'tavern',
      attributes: { level: 3, hp: { current: 80, max: 80 }, mp: { current: 30, max: 30 }, atk: 6, def: 4, spd: 3 },
      faction: 'village',
      goals: ['keep the tavern running', 'gather rumors'],
      isOnline: false,
    },
    {
      id: 'npc-smith',
      name: 'Hilda',
      type: 'npc',
      roomId: 'blacksmith',
      attributes: { level: 5, hp: { current: 120, max: 120 }, mp: { current: 20, max: 20 }, atk: 14, def: 8, spd: 4 },
      faction: 'village',
      goals: ['craft weapons', 'find rare ore'],
      isOnline: false,
    },
    {
      id: 'npc-guard',
      name: 'Aldric',
      type: 'npc',
      roomId: 'village-square',
      attributes: { level: 4, hp: { current: 150, max: 150 }, mp: { current: 40, max: 40 }, atk: 12, def: 10, spd: 6 },
      faction: 'village',
      goals: ['patrol the square', 'protect the village'],
      isOnline: false,
    },
    {
      id: 'npc-mysterious',
      name: '???',
      type: 'npc',
      roomId: 'old-ruins',
      attributes: { level: 8, hp: { current: 200, max: 200 }, mp: { current: 100, max: 100 }, atk: 18, def: 12, spd: 10 },
      faction: 'unknown',
      goals: ['search the ruins for artifacts'],
      isOnline: false,
    },
  ];

  for (const ch of [...playerTemplates, ...npcTemplates]) {
    characters.set(ch.id, ch);
  }

  return { rooms, characters };
}
