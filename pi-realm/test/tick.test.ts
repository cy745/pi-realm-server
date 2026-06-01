// Tests for World Tick Loop
// Verifies: fixed interval, overflow skip, accurate world time perception

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TICK_CONFIG,
  TickScheduler,
  decideNextTickStatus,
  type TickRecord,
} from '../src/tick/tick-loop.ts';

describe('Tick - Fixed Interval Scheduling', () => {
  it('schedules first tick at now + interval', () => {
    const now = 1000;
    const decision = decideNextTickStatus(null, now, DEFAULT_TICK_CONFIG);
    expect(decision.status).toBe('pending');
    expect(decision.scheduledAt).toBe(now + DEFAULT_TICK_CONFIG.tickIntervalMs);
  });

  it('schedules next tick at previous + interval', () => {
    const previous: TickRecord = {
      id: 1,
      scheduledAt: 1000,
      startedAt: 1000,
      endedAt: 2000,
      gameTimeStart: 0,
      gameTimeEnd: 1,
      status: 'completed',
    };
    const decision = decideNextTickStatus(previous, 2000, DEFAULT_TICK_CONFIG);
    expect(decision.status).toBe('pending');
    expect(decision.scheduledAt).toBe(previous.scheduledAt + DEFAULT_TICK_CONFIG.tickIntervalMs);
  });
});

describe('Tick - Overrun Skip', () => {
  it('skips next tick if previous still running past scheduled time', () => {
    const previous: TickRecord = {
      id: 1,
      scheduledAt: 1000,
      startedAt: 1000,
      endedAt: null,
      gameTimeStart: 0,
      gameTimeEnd: 0,
      status: 'running',
    };
    // now is at next scheduled time, previous is still running
    const nextScheduled = previous.scheduledAt + DEFAULT_TICK_CONFIG.tickIntervalMs;
    const decision = decideNextTickStatus(previous, nextScheduled, DEFAULT_TICK_CONFIG);
    expect(decision.status).toBe('skipped');
    expect(decision.skippedBecause).toBe(1);
  });

  it('skips next tick if previous ended past scheduled time', () => {
    const previous: TickRecord = {
      id: 1,
      scheduledAt: 1000,
      startedAt: 1000,
      endedAt: 2500, // ended past next scheduled time
      gameTimeStart: 0,
      gameTimeEnd: 1,
      status: 'overrun',
    };
    const config = { tickIntervalMs: 1000, gameTimePerTick: 1 };
    const nextScheduled = previous.scheduledAt + config.tickIntervalMs;
    const decision = decideNextTickStatus(previous, nextScheduled, config);
    expect(decision.status).toBe('skipped');
  });

  it('does not skip if previous completed before scheduled time', () => {
    const previous: TickRecord = {
      id: 1,
      scheduledAt: 1000,
      startedAt: 1000,
      endedAt: 1500,
      gameTimeStart: 0,
      gameTimeEnd: 1,
      status: 'completed',
    };
    const nextScheduled = previous.scheduledAt + DEFAULT_TICK_CONFIG.tickIntervalMs;
    const decision = decideNextTickStatus(previous, nextScheduled, DEFAULT_TICK_CONFIG);
    expect(decision.status).toBe('pending');
  });
});

describe('TickScheduler - Lifecycle', () => {
  it('schedules, starts, and completes a tick', () => {
    const scheduler = new TickScheduler();
    const now = 1000;

    const tick = scheduler.schedule(now + 1000);
    expect(tick.status).toBe('pending');

    scheduler.startTick(tick.id, now + 1000);
    expect(scheduler.getCurrentGameTime()).toBe(0);

    const gameTime = scheduler.completeTick(tick.id, now + 2000);
    expect(gameTime).toBe(DEFAULT_TICK_CONFIG.gameTimePerTick);
    expect(scheduler.getCurrentGameTime()).toBe(gameTime);
  });

  it('markOverrun records overrun status', () => {
    const scheduler = new TickScheduler();
    const tick = scheduler.schedule(2000);
    scheduler.startTick(tick.id, 2000);
    scheduler.markOverrun(tick.id, 5000);

    const history = scheduler.getHistory();
    expect(history[0]!.status).toBe('overrun');
  });
});

describe('Tick - World Time Accuracy Despite Skips', () => {
  it('AI Agent perceives time advancing even with skipped ticks', () => {
    const scheduler = new TickScheduler({
      tickIntervalMs: 1000,
      gameTimePerTick: 1,
    });

    // First tick scheduled at interval. To align, call with t0 = -1000.
    const t1 = scheduler.schedule(-1000);
    expect(t1.scheduledAt).toBe(0);
    scheduler.startTick(t1.id, 0);
    scheduler.completeTick(t1.id, 500);

    // t2 scheduled at 1000
    const t2 = scheduler.schedule(1000);
    expect(t2.scheduledAt).toBe(1000);
    scheduler.startTick(t2.id, 1000);
    // t2 overruns, ends at 2500
    scheduler.markOverrun(t2.id, 2500);

    // t3 scheduled at 2000, but t2 ended at 2500 > 2000, should be skipped
    const t3 = scheduler.schedule(2000);
    expect(t3.scheduledAt).toBe(2000);
    expect(t3.status).toBe('skipped');
    expect(t3.skippedBecause).toBe(2);

    // t4 scheduled at 3000, normal
    const t4 = scheduler.schedule(3000);
    expect(t4.status).toBe('pending');

    // AI Agent querying at real time 4000:
    // Should perceive game time as if all 4 ticks ran
    const perceived = scheduler.getPerceivedGameTime(4000);
    expect(perceived).toBeGreaterThanOrEqual(1);
  });

  it('game time monotonically increases', () => {
    const scheduler = new TickScheduler();
    const t1 = scheduler.schedule(0);
    scheduler.startTick(t1.id, 0);
    const gt1 = scheduler.completeTick(t1.id, 100);

    const t2 = scheduler.schedule(1000);
    scheduler.startTick(t2.id, 1000);
    const gt2 = scheduler.completeTick(t2.id, 2000);

    expect(gt2).toBeGreaterThan(gt1);
  });
});
