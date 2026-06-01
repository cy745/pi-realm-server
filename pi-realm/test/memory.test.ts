// Tests for Memory system (subjective per-character memory with decay)
// Verifies: creation, decay, threshold pruning, permanent memories, reinforcement

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DECAY_RATE,
  REINFORCEMENT_BOOST,
  RELEVANCE_THRESHOLD,
  createMemory,
  MemoryStore,
} from '../src/game/memory.ts';

describe('Memory - Creation', () => {
  it('creates a memory with full relevance', () => {
    const memory = createMemory({
      characterId: 'char-1',
      description: 'I saw a fire',
      mapStateReference: {
        roomId: 'r1',
        snapshotAt: 100,
        captured: { structural: 0.7 },
      },
      worldTime: 100,
    });
    expect(memory.relevance).toBe(1.0);
    expect(memory.permanent).toBe(false);
    expect(memory.reinforcedAt).toEqual([]);
  });

  it('supports permanent flag', () => {
    const memory = createMemory({
      characterId: 'char-1',
      description: 'I witnessed the king die',
      mapStateReference: {
        roomId: 'r1',
        snapshotAt: 100,
        captured: {},
      },
      permanent: true,
      worldTime: 100,
    });
    expect(memory.permanent).toBe(true);
  });

  it('can reference a state change for memory anchoring', () => {
    const memory = createMemory({
      characterId: 'char-1',
      description: 'I saw the wall collapse',
      relatedStateChangeId: 'sc-1',
      mapStateReference: {
        roomId: 'r1',
        stateChangeId: 'sc-1',
        snapshotAt: 100,
        captured: { structural: 0 },
      },
      worldTime: 100,
    });
    expect(memory.relatedStateChangeId).toBe('sc-1');
    expect(memory.mapStateReference.stateChangeId).toBe('sc-1');
  });
});

describe('Memory - Decay', () => {
  it('reduces relevance by decay rate each tick', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'd',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    store.add(memory);

    store.decay();
    expect(memory.relevance).toBeCloseTo(1.0 - DEFAULT_DECAY_RATE);

    store.decay();
    expect(memory.relevance).toBeCloseTo(1.0 - 2 * DEFAULT_DECAY_RATE);
  });

  it('relevance never goes below 0', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'd',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    store.add(memory);
    for (let i = 0; i < 100; i++) store.decay();
    expect(memory.relevance).toBe(0);
  });

  it('permanent memories never decay', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'critical',
      permanent: true,
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    store.add(memory);
    for (let i = 0; i < 100; i++) store.decay();
    expect(memory.relevance).toBe(1.0);
  });
});

describe('Memory - Threshold & Pruning', () => {
  it('prunes memories below threshold', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'trivial',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    memory.relevance = RELEVANCE_THRESHOLD - 0.01;
    store.add(memory);

    const removed = store.prune();
    expect(removed).toHaveLength(1);
    expect(store.size()).toBe(0);
  });

  it('keeps memories above threshold', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'important',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    memory.relevance = RELEVANCE_THRESHOLD + 0.01;
    store.add(memory);

    const removed = store.prune();
    expect(removed).toHaveLength(0);
    expect(store.size()).toBe(1);
  });

  it('never prunes permanent memories even at zero relevance', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'critical',
      permanent: true,
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    memory.relevance = 0;
    store.add(memory);

    const removed = store.prune();
    expect(removed).toHaveLength(0);
    expect(store.size()).toBe(1);
  });
});

describe('Memory - Reinforcement', () => {
  it('reinforcement boosts relevance', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'd',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    memory.relevance = 0.3;
    store.add(memory);

    store.reinforce(memory.id);
    expect(memory.relevance).toBeCloseTo(0.3 + REINFORCEMENT_BOOST);
    expect(memory.reinforcedAt).toHaveLength(1);
  });

  it('reinforcement capped at 1.0', () => {
    const store = new MemoryStore();
    const memory = createMemory({
      characterId: 'c1',
      description: 'd',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    memory.relevance = 0.9;
    store.add(memory);

    store.reinforce(memory.id);
    expect(memory.relevance).toBe(1.0);
  });
});

describe('Memory - Query', () => {
  it('getByCharacterAndRoom filters correctly', () => {
    const store = new MemoryStore();
    const m1 = createMemory({
      characterId: 'c1',
      description: 'in r1',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    const m2 = createMemory({
      characterId: 'c1',
      description: 'in r2',
      mapStateReference: { roomId: 'r2', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    const m3 = createMemory({
      characterId: 'c2',
      description: 'c2 in r1',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    store.add(m1);
    store.add(m2);
    store.add(m3);

    const result = store.getByCharacterAndRoom('c1', 'r1');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(m1.id);
  });

  it('getActiveMemories excludes forgotten ones', () => {
    const store = new MemoryStore();
    const forgotten = createMemory({
      characterId: 'c1',
      description: 'old',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    forgotten.relevance = RELEVANCE_THRESHOLD - 0.1;
    const fresh = createMemory({
      characterId: 'c1',
      description: 'recent',
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    const permanent = createMemory({
      characterId: 'c1',
      description: 'critical',
      permanent: true,
      mapStateReference: { roomId: 'r1', snapshotAt: 0, captured: {} },
      worldTime: 0,
    });
    permanent.relevance = 0;
    store.add(forgotten);
    store.add(fresh);
    store.add(permanent);

    const active = store.getActiveMemories('c1');
    expect(active).toHaveLength(2);
    expect(active.find((m) => m.id === forgotten.id)).toBeUndefined();
  });
});
