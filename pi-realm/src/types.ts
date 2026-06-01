// Common types for the game world

export type RoomId = string;
export type CharacterId = string;
export type ItemId = string;
export type EventId = string;
export type StateChangeId = string;

export type Material = 'stone' | 'wood' | 'earth' | 'metal' | 'glass' | 'plant';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherType = 'clear' | 'rain' | 'snow' | 'storm' | 'fog' | 'sandstorm';
export type Direction = 'N' | 'S' | 'E' | 'W' | 'UP' | 'DOWN';

export type ExitMap = Partial<Record<Direction, RoomId>>;

export interface FireState {
  intensity: number;        // 0-1
  fuelRemaining: number;    // ticks before burnout
  spreadRadius: number;
}

export interface WeatherState {
  type: WeatherType;
  intensity: number;        // 0-1
  windDirection?: Direction;
}

export interface LightSource {
  id: string;
  type: 'torch' | 'lantern' | 'fire' | 'magical';
  intensity: number;
  position: { x: number; y: number };
}

export interface VisibleItems {
  items: ItemId[];
  corpses: CharacterId[];
  debris: string[];
  marks: string[];
  lightSources: LightSource[];
}

export interface HiddenItems {
  secretDoors: Array<{ id: string; toRoom: RoomId; revealed: boolean }>;
  traps: Array<{ id: string; trigger: string; effect: string; armed: boolean }>;
  hiddenItems: ItemId[];
}

export interface RoomBase {
  name: string;
  description: string;
  exits: ExitMap;
  material: Material;
  capacity: number;
}

export interface RoomDynamic {
  structural: number;            // 0-1
  fire: FireState;
  weather: WeatherState;
  timeOfDay: TimeOfDay;
  season: Season;
  visible: VisibleItems;
  hidden: HiddenItems;
}

export interface RoomState {
  id: RoomId;
  base: RoomBase;
  dynamic: RoomDynamic;
  history: StateChange[];
}

export type StateChangeType =
  | 'damage'
  | 'fire_started'
  | 'fire_spread'
  | 'fire_extinguished'
  | 'weather_change'
  | 'structural_decay'
  | 'collapse'
  | 'item_moved'
  | 'modification'
  | 'vegetation_growth'
  | 'time_change';

export type StateChangeCause =
  | 'event'
  | 'weather'
  | 'decay'
  | 'npc_action'
  | 'fire_spread'
  | 'emergent'
  | 'player_action';

export interface StateChange {
  id: StateChangeId;
  tick: number;
  worldTime: number;
  roomId: RoomId;
  type: StateChangeType;
  cause: StateChangeCause;
  causedBy?: CharacterId | EventId;
  before: Partial<RoomDynamic>;
  after: Partial<RoomDynamic>;
  witnessedBy: CharacterId[];
}

export interface MovementStats {
  speed: number;           // base speed in m/s
  currentStamina: number;  // current stamina
  maxStamina: number;      // max stamina
  vehicle: string | null;  // vehicle type (TBD)
}

export interface Character {
  id: CharacterId;
  name: string;
  type: 'player' | 'npc';
  x: number;               // world coordinate (meters)
  y: number;               // world coordinate (meters)
  attributes: CharacterAttributes;
  movement: MovementStats;
  faction?: string;
  goals: string[];
  isOnline: boolean;
}

export interface CharacterAttributes {
  level: number;
  hp: { current: number; max: number };
  mp: { current: number; max: number };
  atk: number;
  def: number;
  spd: number;
}

export interface Propagation {
  sound: { radius: number; obstacleReduction: number };
  light: { radius: number; blockedByWalls: boolean };
  damage: { radius: number; falloff: 'linear' | 'inverse_square' | 'constant' };
  vibration: { radius: number; reducesPerWall: number };
}

export interface WorldEvent {
  id: EventId;
  type: string;
  tick: number;
  worldTime: number;
  location: RoomId;
  payload: Record<string, unknown>;
  propagation: Propagation;
  relatedStateChangeId?: StateChangeId;
}

export type PerceptionType = 'damage' | 'witnessed' | 'heard' | 'felt' | null;

export interface PerceptionResult {
  type: Exclude<PerceptionType, null>;
  sensations: string[];
  damage: number;
  witnessed: boolean;
  muffled?: boolean;
}

export interface MapStateReference {
  roomId: RoomId;
  stateChangeId?: StateChangeId;
  snapshotAt: number;
  captured: Partial<RoomDynamic>;
}

export interface MemoryEntry {
  id: string;
  characterId: CharacterId;
  description: string;
  relatedEventId?: EventId;
  relatedStateChangeId?: StateChangeId;
  mapStateReference: MapStateReference;
  relevance: number;
  acquiredAt: number;
  permanent: boolean;
  reinforcedAt: number[];
}

export interface ScoutItemInfo {
  id: string;
  name: string;
  type: string;
}
export interface ScoutSkillInfo {
  id: string;
  name: string;
  level: number;
}
export interface ScoutBuffInfo {
  id: string;
  name: string;
  remainingTicks: number;
}

export interface ScoutSnapshot {
  id: string;
  scoutUserId: CharacterId;
  targetId: CharacterId;
  capturedAt: number;
  visibleFields: string[];
  data: {
    name?: string;
    level?: number;
    hp?: { current: number; max: number };
    mp?: { current: number; max: number };
    equipment?: ScoutItemInfo[];
    skills?: ScoutSkillInfo[];
    buffs?: ScoutBuffInfo[];
    recentActions?: string[];
  };
}
