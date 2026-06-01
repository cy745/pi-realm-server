// Action system — coordinate-based commands

import type { Character, WorldEvent } from '../types.ts';
import { calculateMove, applyMove } from './movement.ts';
import { RegionTree } from '../map/region.ts';
import { TerrainSampler } from '../map/terrain.ts';

export type ActionType = 'move' | 'look' | 'say' | 'who' | 'rest' | 'address';

export interface Action {
  type: ActionType;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  events: WorldEvent[];
  x?: number;
  y?: number;
  stamina?: number;
  address?: string;
}

let eventIdCounter = 0;
function makeEventId(prefix: string, tick: number): string {
  eventIdCounter += 1;
  return `evt-${prefix}-${tick}-${eventIdCounter}`;
}

// ── Move ─────────────────────────────────────────

export function actionMove(
  char: Character,
  targetX: number,
  targetY: number,
  terrain: TerrainSampler,
  tick: number,
  worldTime: number,
): ActionResult {
  const result = calculateMove(char, targetX, targetY, terrain);
  if (!result.success) {
    return { success: false, message: result.reason ?? 'Cannot move there.', events: [] };
  }

  applyMove(char, result);

  const event: WorldEvent = {
    id: makeEventId('move', tick),
    type: 'movement',
    tick, worldTime,
    location: char.id,
    payload: { characterId: char.id, characterName: char.name, to: { x: result.x, y: result.y }, stamina: char.movement.currentStamina },
    propagation: {
      sound: { radius: 20, obstacleReduction: 5 },
      light: { radius: 5, blockedByWalls: true },
      damage: { radius: 0, falloff: 'constant' },
      vibration: { radius: 10, reducesPerWall: 2 },
    },
  };

  const terrainType = result.terrainType ?? 'unknown';

  return {
    success: true,
    message: `Moved to (${result.x.toFixed(0)}, ${result.y.toFixed(0)}). Terrain: ${terrainType}. Stamina: ${char.movement.currentStamina.toFixed(0)}/${char.movement.maxStamina}.`,
    events: [event],
    x: result.x,
    y: result.y,
    stamina: char.movement.currentStamina,
  };
}

// ── Look ─────────────────────────────────────────

export function actionLook(
  char: Character,
  regions: RegionTree,
  terrain: TerrainSampler,
  _tick: number,
  _worldTime: number,
): ActionResult {
  const address = regions.getAddressString(char.x, char.y);
  const ts = terrain.sample(char.x, char.y);
  const nearest = regions.getOrientation(char.x, char.y);

  const lines: string[] = [
    `You are at (${char.x.toFixed(0)}, ${char.y.toFixed(0)}).`,
    `Address: ${address}`,
    `Terrain: ${ts.type} (height: ${ts.height.toFixed(2)}, slope: ${(ts.slope * 100).toFixed(0)}%)`,
    '',
    `You are ${nearest}.`,
  ];

  return {
    success: true,
    message: lines.join('\n'),
    events: [],
    address,
  };
}

// ── Say ─────────────────────────────────────────

export function actionSay(
  char: Character,
  text: string,
  tick: number,
  worldTime: number,
): ActionResult {
  const event: WorldEvent = {
    id: makeEventId('say', tick),
    type: 'dialogue',
    tick, worldTime,
    location: char.id,
    payload: { speakerId: char.id, speakerName: char.name, text, x: char.x, y: char.y },
    propagation: {
      sound: { radius: 50, obstacleReduction: 10 },
      light: { radius: 5, blockedByWalls: true },
      damage: { radius: 0, falloff: 'constant' },
      vibration: { radius: 10, reducesPerWall: 2 },
    },
  };

  return {
    success: true,
    message: `You say: "${text}"`,
    events: [event],
  };
}

// ── Rest ─────────────────────────────────────────

export function actionRest(
  char: Character,
  durationTicks: number,
): ActionResult {
  const recovery = durationTicks * char.movement.maxStamina * 0.02;
  char.movement.currentStamina = Math.min(char.movement.maxStamina, char.movement.currentStamina + recovery);
  return {
    success: true,
    message: `You rest for ${durationTicks} tick(s). Recovered ${recovery.toFixed(0)} stamina. Current: ${char.movement.currentStamina.toFixed(0)}/${char.movement.maxStamina}.`,
    events: [],
    stamina: char.movement.currentStamina,
  };
}

// ── Address ──────────────────────────────────────

export function actionAddress(
  char: Character,
  regions: RegionTree,
): ActionResult {
  const address = regions.getAddressString(char.x, char.y);
  const orientation = regions.getOrientation(char.x, char.y);
  return {
    success: true,
    message: `Your address: ${address}\nOrientation: ${orientation}`,
    events: [],
    address,
  };
}

// ── Who (nearby characters) ──────────────────────

export function actionWho(char: Character): ActionResult {
  return {
    success: true,
    message: 'You are alone.',
    events: [],
  };
}

// ── Action Router ────────────────────────────────

export function processAction(
  action: Action,
  char: Character,
  regions: RegionTree,
  terrain: TerrainSampler,
  tick: number,
  worldTime: number,
): ActionResult {
  switch (action.type) {
    case 'move': {
      const x = Number(action.payload['x']) || char.x;
      const y = Number(action.payload['y']) || char.y;
      const dir = action.payload['direction'] as string;
      if (dir) {
        const dist = 30; // meters per move step
        const angle: Record<string, number> = { N: 90, S: -90, E: 0, W: 180, NE: 45, NW: 135, SE: -45, SW: -135 };
        const a = angle[dir.toUpperCase()] ?? 0;
        return actionMove(char, char.x + Math.cos(a * Math.PI / 180) * dist, char.y + Math.sin(a * Math.PI / 180) * dist, terrain, tick, worldTime);
      }
      return actionMove(char, x, y, terrain, tick, worldTime);
    }
    case 'look':
      return actionLook(char, regions, terrain, tick, worldTime);
    case 'say': {
      const text = action.payload['text'] as string ?? '';
      return actionSay(char, text, tick, worldTime);
    }
    case 'rest': {
      const ticks = Number(action.payload['ticks']) || 1;
      return actionRest(char, ticks);
    }
    case 'address':
      return actionAddress(char, regions);
    case 'who':
      return actionWho(char);
    default:
      return { success: false, message: `Unknown action: ${action.type}`, events: [] };
  }
}
