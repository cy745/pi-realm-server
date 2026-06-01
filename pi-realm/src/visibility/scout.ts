// Scout skill: one-time frozen information snapshot
// Snapshot doesn't update when target's state changes

import type { CharacterId, ScoutSnapshot } from '../types.ts';

let snapshotCounter = 0;

function generateSnapshotId(): string {
  snapshotCounter += 1;
  return `snap-${snapshotCounter}-${Date.now().toString(36)}`;
}

export interface ScoutAttemptOptions {
  scoutUserId: CharacterId;
  targetId: CharacterId;
  scoutLevel: number;
  targetLevel: number;
  skillLevel: number;       // 1-10
  proficiency: number;      // 0-1
  worldTime: number;
}

export interface ScoutResult {
  success: boolean;
  reason?: 'level_too_low' | 'target_higher_level';
  snapshot?: ScoutSnapshot;
}

/**
 * Determines what info fields the scout can see based on skill level + proficiency.
 * 1-2: name, level
 * 3-4: + hp
 * 5-6: + mp, equipment
 * 7-8: + skills
 * 9-10: + buffs, recent actions
 */
export function getVisibleFields(skillLevel: number, proficiency: number): string[] {
  const effectiveLevel = skillLevel * (0.5 + 0.5 * proficiency);
  const fields: string[] = ['name', 'level'];
  if (effectiveLevel >= 3) fields.push('hp');
  if (effectiveLevel >= 5) fields.push('mp', 'equipment');
  if (effectiveLevel >= 7) fields.push('skills');
  if (effectiveLevel >= 9) fields.push('buffs', 'recentActions');
  return fields;
}

export function attemptScout(options: ScoutAttemptOptions): ScoutResult {
  // Rule: scout user level must be >= target level
  if (options.scoutLevel < options.targetLevel) {
    return { success: false, reason: 'target_higher_level' };
  }

  const fields = getVisibleFields(options.skillLevel, options.proficiency);

  // Frozen snapshot: contains only the visible fields, captured at this moment
  const snapshot: ScoutSnapshot = {
    id: generateSnapshotId(),
    scoutUserId: options.scoutUserId,
    targetId: options.targetId,
    capturedAt: options.worldTime,
    visibleFields: fields,
    // data is intentionally not populated here
    // The caller should fill in actual values from current state
    data: {},
  };

  return { success: true, snapshot };
}

/**
 * Freeze a snapshot - this is the data captured at the moment of scout.
 * After this, the snapshot will not reflect any subsequent changes.
 */
export function freezeSnapshot(
  snapshot: ScoutSnapshot,
  currentData: Partial<ScoutSnapshot['data']>,
): ScoutSnapshot {
  // Object.freeze prevents later mutation
  const frozen = Object.freeze({
    ...snapshot,
    data: Object.freeze({ ...currentData }),
  }) as ScoutSnapshot;
  return frozen;
}
