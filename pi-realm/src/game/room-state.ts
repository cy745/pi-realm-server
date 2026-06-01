// Map State management: objective world truth
// Single source of truth for room states

import type {
  CharacterId,
  ExitMap,
  FireState,
  HiddenItems,
  Material,
  RoomBase,
  RoomDynamic,
  RoomId,
  RoomState,
  StateChange,
  StateChangeCause,
  StateChangeId,
  StateChangeType,
  VisibleItems,
  WeatherState,
} from '../types.ts';

let stateChangeCounter = 0;

export function generateStateChangeId(): StateChangeId {
  stateChangeCounter += 1;
  return `sc-${stateChangeCounter}-${Date.now().toString(36)}`;
}

export function createDefaultFire(): FireState {
  return { intensity: 0, fuelRemaining: 0, spreadRadius: 0 };
}

export function createDefaultWeather(): WeatherState {
  return { type: 'clear', intensity: 0 };
}

export function createDefaultVisible(): VisibleItems {
  return { items: [], corpses: [], debris: [], marks: [], lightSources: [] };
}

export function createDefaultHidden(): HiddenItems {
  return { secretDoors: [], traps: [], hiddenItems: [] };
}

export interface CreateRoomOptions {
  id: RoomId;
  name: string;
  description: string;
  exits: ExitMap;
  material: Material;
  capacity: number;
}

export function createRoom(options: CreateRoomOptions): RoomState {
  const base: RoomBase = {
    name: options.name,
    description: options.description,
    exits: options.exits,
    material: options.material,
    capacity: options.capacity,
  };

  const dynamic: RoomDynamic = {
    structural: 1.0,
    fire: createDefaultFire(),
    weather: createDefaultWeather(),
    timeOfDay: 'day',
    season: 'spring',
    visible: createDefaultVisible(),
    hidden: createDefaultHidden(),
  };

  return {
    id: options.id,
    base,
    dynamic,
    history: [],
  };
}

export interface RecordStateChangeOptions {
  roomId: RoomId;
  type: StateChangeType;
  cause: StateChangeCause;
  causedBy?: StateChange['causedBy'];
  before: Partial<RoomDynamic>;
  after: Partial<RoomDynamic>;
  tick: number;
  worldTime: number;
  witnessedBy?: CharacterId[];
}

export function recordStateChange(
  room: RoomState,
  options: RecordStateChangeOptions,
): StateChange {
  const change: StateChange = {
    id: generateStateChangeId(),
    tick: options.tick,
    worldTime: options.worldTime,
    roomId: options.roomId,
    type: options.type,
    cause: options.cause,
    before: options.before,
    after: options.after,
    witnessedBy: options.witnessedBy ?? [],
  };
  if (options.causedBy !== undefined) {
    change.causedBy = options.causedBy;
  }
  room.history.push(change);
  return change;
}

export function getStateChange(
  room: RoomState,
  changeId: StateChangeId,
): StateChange | undefined {
  return room.history.find((c) => c.id === changeId);
}
