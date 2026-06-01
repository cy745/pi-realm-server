// Tests for Visibility Filter Pipeline
// Verifies: spatial -> knowledge -> plot -> decay filtering

import { describe, expect, it } from 'vitest';
import {
  decayFilter,
  knowledgeFilter,
  plotFilter,
  runVisibilityPipeline,
  spatialFilter,
  type DecayProvider,
  type FilterContext,
  type KnowledgeProvider,
} from '../src/visibility/filter.ts';
import type { WorldTopology } from '../src/visibility/perception.ts';
import type { Character, WorldEvent } from '../src/types.ts';

function makeCharacter(roomId: string): Character {
  return {
    id: 'char-1',
    name: 'C1',
    type: 'player',
    roomId,
    attributes: {
      level: 10,
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

function makeEvent(location: string, payload: Record<string, unknown> = {}): WorldEvent {
  return {
    id: 'e1',
    type: 'test',
    tick: 1,
    worldTime: 1,
    location,
    payload,
    propagation: {
      sound: { radius: 5, obstacleReduction: 1 },
      light: { radius: 3, blockedByWalls: true },
      damage: { radius: 1, falloff: 'linear' },
      vibration: { radius: 8, reducesPerWall: 1 },
    },
  };
}

const topology: WorldTopology = {
  getRoom: (id) => ({ id, exits: {} }),
  hasLineOfSight: () => true,
  pathDistance: (a, b) => (a === b ? 0 : 1),
  countWallsBetween: () => 0,
};

describe('Filter - Spatial', () => {
  it('same room: visible', () => {
    const event = makeEvent('r1');
    const char = makeCharacter('r1');
    const decision = spatialFilter(event, char, topology);
    expect(decision.visible).toBe(true);
  });

  it('adjacent room: visible', () => {
    const event = makeEvent('r1');
    const char = makeCharacter('r2');
    const decision = spatialFilter(event, char, topology);
    expect(decision.visible).toBe(true);
  });

  it('far room: not visible', () => {
    const farTopology: WorldTopology = {
      getRoom: (id) => ({ id, exits: {} }),
      hasLineOfSight: () => true,
      pathDistance: () => 5,
      countWallsBetween: () => 0,
    };
    const event = makeEvent('r1');
    const char = makeCharacter('r2');
    const decision = spatialFilter(event, char, farTopology);
    expect(decision.visible).toBe(false);
    expect(decision.reason).toBe('spatial');
  });
});

describe('Filter - Knowledge', () => {
  class MockKnowledge implements KnowledgeProvider {
    private known = new Set<string>();
    private flags = new Map<string, Set<string>>();

    know(characterId: string, eventId: string): void {
      this.known.add(`${characterId}|${eventId}`);
    }
    setFlag(characterId: string, flag: string): void {
      if (!this.flags.has(characterId)) this.flags.set(characterId, new Set());
      this.flags.get(characterId)!.add(flag);
    }
    isKnownBy(characterId: string, eventId: string): boolean {
      return this.known.has(`${characterId}|${eventId}`);
    }
    hasPlotFlag(characterId: string, flag: string): boolean {
      return this.flags.get(characterId)?.has(flag) ?? false;
    }
  }

  it('character in knownBy payload: visible', () => {
    const event = makeEvent('r1', { knownBy: ['char-1'] });
    const char = makeCharacter('r2');
    const knowledge = new MockKnowledge();
    const decision = knowledgeFilter(event, char, knowledge);
    expect(decision.visible).toBe(true);
  });

  it('character not in knownBy: not visible', () => {
    const event = makeEvent('r1', { knownBy: ['char-2'] });
    const char = makeCharacter('r2');
    const knowledge = new MockKnowledge();
    const decision = knowledgeFilter(event, char, knowledge);
    expect(decision.visible).toBe(false);
    expect(decision.reason).toBe('knowledge');
  });

  it('knowledge provider mark: visible', () => {
    const event = makeEvent('r1');
    const char = makeCharacter('r2');
    const knowledge = new MockKnowledge();
    knowledge.know('char-1', 'e1');
    const decision = knowledgeFilter(event, char, knowledge);
    expect(decision.visible).toBe(true);
  });
});

describe('Filter - Plot', () => {
  class MockKnowledge implements KnowledgeProvider {
    private flags = new Map<string, Set<string>>();

    setFlag(characterId: string, flag: string): void {
      if (!this.flags.has(characterId)) this.flags.set(characterId, new Set());
      this.flags.get(characterId)!.add(flag);
    }
    isKnownBy(): boolean {
      return false;
    }
    hasPlotFlag(characterId: string, flag: string): boolean {
      return this.flags.get(characterId)?.has(flag) ?? false;
    }
  }

  it('all required flags present: visible', () => {
    const event = makeEvent('r1', { requiresFlags: ['chapter-1', 'met-npc'] });
    const char = makeCharacter('r1');
    const knowledge = new MockKnowledge();
    knowledge.setFlag('char-1', 'chapter-1');
    knowledge.setFlag('char-1', 'met-npc');
    const decision = plotFilter(event, char, knowledge);
    expect(decision.visible).toBe(true);
  });

  it('one flag missing: not visible', () => {
    const event = makeEvent('r1', { requiresFlags: ['chapter-1', 'met-npc'] });
    const char = makeCharacter('r1');
    const knowledge = new MockKnowledge();
    knowledge.setFlag('char-1', 'chapter-1');
    // missing 'met-npc'
    const decision = plotFilter(event, char, knowledge);
    expect(decision.visible).toBe(false);
    expect(decision.reason).toBe('plot');
  });

  it('no required flags: always visible', () => {
    const event = makeEvent('r1');
    const char = makeCharacter('r1');
    const knowledge = new MockKnowledge();
    const decision = plotFilter(event, char, knowledge);
    expect(decision.visible).toBe(true);
  });
});

describe('Filter - Decay', () => {
  class MockDecay implements DecayProvider {
    private tickEmitted = 1;
    setTick(t: number): void {
      this.tickEmitted = t;
    }
    getEventAge(): number {
      return 5;
    }
  }

  it('age within decayTicks: visible', () => {
    const event = makeEvent('r1', { decayTicks: 10 });
    const char = makeCharacter('r1');
    const decay = new MockDecay();
    const decision = decayFilter(event, char, decay, 6);
    expect(decision.visible).toBe(true);
  });

  it('age exceeds decayTicks: not visible', () => {
    const event = makeEvent('r1', { decayTicks: 3 });
    const char = makeCharacter('r1');
    const decay = new MockDecay();
    const decision = decayFilter(event, char, decay, 6);
    expect(decision.visible).toBe(false);
    expect(decision.reason).toBe('decay');
  });

  it('no decayTicks configured: always visible', () => {
    const event = makeEvent('r1');
    const char = makeCharacter('r1');
    const decay = new MockDecay();
    const decision = decayFilter(event, char, decay, 1000);
    expect(decision.visible).toBe(true);
  });
});

describe('Filter - Pipeline', () => {
  it('runs all filters in order', () => {
    class TestKnowledge implements KnowledgeProvider {
      isKnownBy(): boolean {
        return true;
      }
      hasPlotFlag(characterId: string, flag: string): boolean {
        return flag === 'met-npc';
      }
    }
    const event = makeEvent('r1', { requiresFlags: ['met-npc'] });
    const char = makeCharacter('r1');
    const ctx: FilterContext = {
      topology,
      knowledge: new TestKnowledge(),
      decay: { getEventAge: () => 0 },
      currentTick: 1,
    };
    const decision = runVisibilityPipeline(event, char, ctx);
    expect(decision.visible).toBe(true);
  });

  it('blocks at first failing filter', () => {
    const event = makeEvent('r1', { requiresFlags: ['missing'] });
    const char = makeCharacter('r1');
    const ctx: FilterContext = {
      topology,
      knowledge: {
        isKnownBy: () => true, // passes knowledge check
        hasPlotFlag: () => false, // blocks at plot check
      },
      decay: { getEventAge: () => 0 },
      currentTick: 1,
    };
    const decision = runVisibilityPipeline(event, char, ctx);
    expect(decision.visible).toBe(false);
    expect(decision.reason).toBe('plot');
  });
});
