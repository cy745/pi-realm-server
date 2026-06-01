// Memory system: per-character subjective memory with decay
// Distinct from Map State (objective world truth)

import type {
  CharacterId,
  EventId,
  MapStateReference,
  MemoryEntry,
  RoomId,
  StateChangeId,
} from '../types.ts';

let memoryCounter = 0;

export function generateMemoryId(): string {
  memoryCounter += 1;
  return `mem-${memoryCounter}-${Date.now().toString(36)}`;
}

export interface AddMemoryOptions {
  characterId: CharacterId;
  description: string;
  relatedEventId?: EventId;
  relatedStateChangeId?: StateChangeId;
  mapStateReference: MapStateReference;
  permanent?: boolean;
  worldTime: number;
}

export function createMemory(options: AddMemoryOptions): MemoryEntry {
  const memory: MemoryEntry = {
    id: generateMemoryId(),
    characterId: options.characterId,
    description: options.description,
    mapStateReference: options.mapStateReference,
    relevance: 1.0,
    acquiredAt: options.worldTime,
    permanent: options.permanent ?? false,
    reinforcedAt: [],
  };
  if (options.relatedEventId !== undefined) {
    memory.relatedEventId = options.relatedEventId;
  }
  if (options.relatedStateChangeId !== undefined) {
    memory.relatedStateChangeId = options.relatedStateChangeId;
  }
  return memory;
}

export const DEFAULT_DECAY_RATE = 0.05;     // per tick
export const RELEVANCE_THRESHOLD = 0.1;     // below this = forgotten
export const REINFORCEMENT_BOOST = 0.3;     // relevance boost on reinforcement

export class MemoryStore {
  private memories: MemoryEntry[] = [];

  add(memory: MemoryEntry): void {
    this.memories.push(memory);
  }

  getByCharacter(characterId: CharacterId): MemoryEntry[] {
    return this.memories.filter((m) => m.characterId === characterId);
  }

  getByCharacterAndRoom(characterId: CharacterId, roomId: RoomId): MemoryEntry[] {
    return this.memories.filter(
      (m) => m.characterId === characterId && m.mapStateReference.roomId === roomId,
    );
  }

  getActiveMemories(characterId: CharacterId): MemoryEntry[] {
    // Active = above threshold, or permanent
    return this.getByCharacter(characterId).filter(
      (m) => m.permanent || m.relevance > RELEVANCE_THRESHOLD,
    );
  }

  reinforce(memoryId: string): void {
    const memory = this.memories.find((m) => m.id === memoryId);
    if (!memory) return;
    memory.relevance = Math.min(1.0, memory.relevance + REINFORCEMENT_BOOST);
    memory.reinforcedAt.push(Date.now());
  }

  decay(rate: number = DEFAULT_DECAY_RATE): void {
    for (const memory of this.memories) {
      if (memory.permanent) continue;
      memory.relevance = Math.max(0, memory.relevance - rate);
    }
  }

  prune(): MemoryEntry[] {
    // Remove memories below threshold (non-permanent)
    const toRemove: MemoryEntry[] = [];
    this.memories = this.memories.filter((m) => {
      if (m.permanent) return true;
      if (m.relevance > RELEVANCE_THRESHOLD) return true;
      toRemove.push(m);
      return false;
    });
    return toRemove;
  }

  size(): number {
    return this.memories.length;
  }

  clear(): void {
    this.memories = [];
  }
}
