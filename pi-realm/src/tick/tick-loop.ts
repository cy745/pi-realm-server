// World Tick Loop
// Fixed interval scheduling with overflow handling:
// If a tick's end time exceeds the next tick's start time,
// skip the next tick and pass the correct world time to AI Agents.

export interface TickConfig {
  tickIntervalMs: number;          // real-world interval between ticks
  gameTimePerTick: number;         // game time units advanced per tick
}

export const DEFAULT_TICK_CONFIG: TickConfig = {
  tickIntervalMs: 5 * 60 * 1000,   // 5 min
  gameTimePerTick: 1,              // 1 game hour
};

export type TickStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'overrun';

export interface TickRecord {
  id: number;
  scheduledAt: number;             // ms (real)
  startedAt: number | null;
  endedAt: number | null;
  gameTimeStart: number;
  gameTimeEnd: number;
  status: TickStatus;
  skippedBecause?: number;         // tick id that overran
}

/**
 * Decides the next tick's status given the previous tick and current real time.
 * If previous tick is still running and would have ended past now,
 * the next tick is skipped.
 */
export function decideNextTickStatus(
  previous: TickRecord | null,
  now: number,
  config: TickConfig,
): { scheduledAt: number; status: 'pending' | 'skipped'; skippedBecause?: number } {
  // First tick: schedule for now + interval
  if (previous === null) {
    return { scheduledAt: now + config.tickIntervalMs, status: 'pending' };
  }

  const nextScheduled = previous.scheduledAt + config.tickIntervalMs;

  // Previous tick is still running and has not ended
  if (previous.status === 'running') {
    // Check if its projected end time exceeds the next scheduled time
    // We need a way to estimate end time. Use startedAt + a "max expected duration"
    // For simplicity, if previous is still running past its scheduled next time, skip next.
    if (now >= nextScheduled) {
      return { scheduledAt: nextScheduled, status: 'skipped', skippedBecause: previous.id };
    }
  }

  // Previous tick overran
  if (previous.status === 'overrun') {
    if (previous.endedAt !== null && previous.endedAt > nextScheduled) {
      return { scheduledAt: nextScheduled, status: 'skipped', skippedBecause: previous.id };
    }
  }

  return { scheduledAt: nextScheduled, status: 'pending' };
}

/**
 * Calculate game time delta accounting for skipped ticks.
 * The AI Agent should perceive game time advancing as if no tick was skipped,
 * even though only every other tick actually ran.
 */
export function calculateGameTimeAdvance(
  currentGameTime: number,
  tick: TickRecord,
  config: TickConfig,
  skippedTickCount: number,
): number {
  // Each tick advances gameTimePerTick, regardless of whether it actually ran
  // (Skipped ticks just don't generate events, but time passes)
  return currentGameTime + config.gameTimePerTick * (1 + skippedTickCount);
}

export class TickScheduler {
  private config: TickConfig;
  private ticks: TickRecord[] = [];
  private currentGameTime = 0;

  constructor(config: TickConfig = DEFAULT_TICK_CONFIG) {
    this.config = config;
  }

  getCurrentGameTime(): number {
    return this.currentGameTime;
  }

  getConfig(): TickConfig {
    return this.config;
  }

  getHistory(): TickRecord[] {
    return [...this.ticks];
  }

  /**
   * Schedule a tick. Returns the tick record.
   * Caller should run the tick body and call completeTick() or failTick().
   */
  schedule(now: number): TickRecord {
    const previous = this.ticks[this.ticks.length - 1] ?? null;
    const decision = decideNextTickStatus(previous, now, this.config);

    const tick: TickRecord = {
      id: this.ticks.length + 1,
      scheduledAt: decision.scheduledAt,
      startedAt: null,
      endedAt: null,
      gameTimeStart: this.currentGameTime,
      gameTimeEnd: this.currentGameTime,
      status: decision.status,
    };
    if (decision.skippedBecause !== undefined) {
      tick.skippedBecause = decision.skippedBecause;
    }
    this.ticks.push(tick);
    return tick;
  }

  /**
   * Mark a pending tick as running.
   */
  startTick(tickId: number, now: number): void {
    const tick = this.ticks.find((t) => t.id === tickId);
    if (!tick) throw new Error(`Tick ${tickId} not found`);
    if (tick.status !== 'pending') {
      throw new Error(`Tick ${tickId} is ${tick.status}, cannot start`);
    }
    tick.status = 'running';
    tick.startedAt = now;
  }

  /**
   * Mark a running tick as completed. Advances game time.
   * Returns the game time that should be perceived by AI Agents.
   */
  completeTick(tickId: number, now: number): number {
    const tick = this.ticks.find((t) => t.id === tickId);
    if (!tick) throw new Error(`Tick ${tickId} not found`);
    if (tick.status !== 'running') {
      throw new Error(`Tick ${tickId} is ${tick.status}, cannot complete`);
    }
    tick.endedAt = now;
    tick.gameTimeEnd = tick.gameTimeStart + this.config.gameTimePerTick;
    this.currentGameTime = tick.gameTimeEnd;
    tick.status = 'completed';
    return tick.gameTimeEnd;
  }

  /**
   * Mark a running tick as overrun.
   * Future ticks will be skipped until scheduler recovers.
   */
  markOverrun(tickId: number, now: number): void {
    const tick = this.ticks.find((t) => t.id === tickId);
    if (!tick) throw new Error(`Tick ${tickId} not found`);
    if (tick.status !== 'running') {
      throw new Error(`Tick ${tickId} is ${tick.status}, cannot mark overrun`);
    }
    tick.endedAt = now;
    tick.status = 'overrun';
  }

  /**
   * Get the perceived game time for AI Agents at the given real time.
   * Even if a tick was skipped, the game time advances as if it ran.
   */
  getPerceivedGameTime(realTime: number): number {
    // Find the most recent scheduled tick at or before realTime
    const eligible = this.ticks.filter(
      (t) => t.scheduledAt <= realTime,
    );
    if (eligible.length === 0) return this.currentGameTime;
    const last = eligible[eligible.length - 1]!;
    // Game time has advanced by (gameTimePerTick * ticks since start)
    const ticksElapsed = last.id;
    return last.gameTimeStart + this.config.gameTimePerTick;
  }
}
