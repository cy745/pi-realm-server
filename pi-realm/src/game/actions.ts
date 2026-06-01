// Action system — player commands processed by the server

import type { Character, RoomId, RoomState, WorldEvent } from '../types.ts';

// ── Action Types ────────────────────────────────────

export type ActionType = 'move' | 'look' | 'say' | 'who' | 'inventory';

export interface Action {
  type: ActionType;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  events: WorldEvent[];
  highlights?: string[];
}

// ── Movement ────────────────────────────────────────

export function actionMove(
  char: Character,
  dir: string,
  rooms: Map<string, RoomState>,
  tick: number,
  worldTime: number,
): ActionResult {
  const currentRoom = rooms.get(char.roomId);
  if (!currentRoom) {
    return { success: false, message: 'You are nowhere.', events: [] };
  }

  const exit = currentRoom.base.exits[dir as keyof typeof currentRoom.base.exits];
  if (!exit) {
    return { success: false, message: `You can't go that way.`, events: [] };
  }

  const destRoom = rooms.get(exit);
  if (!destRoom) {
    return { success: false, message: 'The path leads into nothingness.', events: [] };
  }

  // Move character
  const prevRoomId = char.roomId;
  char.roomId = exit;

  // Generate event
  const event: WorldEvent = {
    id: `evt-move-${tick}-${char.id}`,
    type: 'movement',
    tick,
    worldTime,
    location: prevRoomId,
    payload: { characterId: char.id, characterName: char.name, from: prevRoomId, to: exit },
    propagation: {
      sound: { radius: 2, obstacleReduction: 1 },
      light: { radius: 1, blockedByWalls: true },
      damage: { radius: 0, falloff: 'constant' },
      vibration: { radius: 1, reducesPerWall: 1 },
    },
  };

  return {
    success: true,
    message: `You move ${dir} to ${destRoom.base.name}.`,
    events: [event],
    highlights: [destRoom.base.name],
  };
}

// ── Look ────────────────────────────────────────────

export function actionLook(
  char: Character,
  rooms: Map<string, RoomState>,
  _tick: number,
  _worldTime: number,
): ActionResult {
  const room = rooms.get(char.roomId);
  if (!room) {
    return { success: false, message: 'There is nothing to see.', events: [] };
  }

  const charsHere = Array.from(rooms.values())
    .filter((r) => r.id === char.roomId)
    .flatMap((_r) =>
      Array.from([char])
        .map((c) => c.name),
    );

  const exits = Object.keys(room.base.exits);
  const lines: string[] = [
    room.base.name,
    '',
    room.base.description,
  ];

  if (room.dynamic.visible.marks.length > 0) {
    lines.push('', `You notice: ${room.dynamic.visible.marks.join(', ')}`);
  }
  if (exits.length > 0) {
    lines.push('', `Exits: ${exits.join(', ')}`);
  }

  // Find other characters in same room
  return {
    success: true,
    message: lines.join('\n'),
    events: [],
    highlights: charsHere,
  };
}

// ── Say ─────────────────────────────────────────────

export function actionSay(
  char: Character,
  text: string,
  rooms: Map<string, RoomState>,
  tick: number,
  worldTime: number,
): ActionResult {
  const room = rooms.get(char.roomId);
  if (!room) {
    return { success: false, message: 'You are not in any room.', events: [] };
  }

  const event: WorldEvent = {
    id: `evt-say-${tick}-${char.id}`,
    type: 'dialogue',
    tick,
    worldTime,
    location: char.roomId,
    payload: { speakerId: char.id, speakerName: char.name, text },
    propagation: {
      sound: { radius: 5, obstacleReduction: 2 },
      light: { radius: 1, blockedByWalls: true },
      damage: { radius: 0, falloff: 'constant' },
      vibration: { radius: 2, reducesPerWall: 1 },
    },
  };

  return {
    success: true,
    message: `You say: "${text}"`,
    events: [event],
  };
}

// ── Who (list visible characters) ───────────────────

export function actionWho(
  char: Character,
  rooms: Map<string, RoomState>,
): ActionResult {
  const sameRoom = Array.from(rooms.values())
    .filter((r) => r.id === char.roomId);

  // For now, we just show that other characters are present
  // (sharing list is approximate — in full system it goes through visibility filter)
  return {
    success: true,
    message: sameRoom.length > 0
      ? `People here: ${sameRoom.map((r) => r.base.name).join(', ')}`
      : 'You are alone.',
    events: [],
  };
}

// ── Action Router ───────────────────────────────────

export function processAction(
  action: Action,
  char: Character,
  rooms: Map<string, RoomState>,
  tick: number,
  worldTime: number,
): ActionResult {
  switch (action.type) {
    case 'move': {
      const dir = action.payload['direction'] as string ?? action.payload['dir'] as string ?? '';
      return actionMove(char, dir, rooms, tick, worldTime);
    }
    case 'look':
      return actionLook(char, rooms, tick, worldTime);
    case 'say': {
      const text = action.payload['text'] as string ?? '';
      return actionSay(char, text, rooms, tick, worldTime);
    }
    case 'who':
      return actionWho(char, rooms);
    default:
      return { success: false, message: `Unknown action: ${action.type}`, events: [] };
  }
}
