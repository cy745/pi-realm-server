// Tests for Scout Skill
// Verifies: level requirement, field visibility by skill level, frozen snapshot

import { describe, expect, it } from 'vitest';
import {
  attemptScout,
  freezeSnapshot,
  getVisibleFields,
} from '../src/visibility/scout.ts';

describe('Scout - Level Requirement', () => {
  it('scout level >= target level: allowed', () => {
    const result = attemptScout({
      scoutUserId: 'c1',
      targetId: 'c2',
      scoutLevel: 10,
      targetLevel: 8,
      skillLevel: 5,
      proficiency: 0.5,
      worldTime: 100,
    });
    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
  });

  it('scout level < target level: blocked', () => {
    const result = attemptScout({
      scoutUserId: 'c1',
      targetId: 'c2',
      scoutLevel: 5,
      targetLevel: 10,
      skillLevel: 5,
      proficiency: 0.5,
      worldTime: 100,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('target_higher_level');
    expect(result.snapshot).toBeUndefined();
  });

  it('equal levels: allowed', () => {
    const result = attemptScout({
      scoutUserId: 'c1',
      targetId: 'c2',
      scoutLevel: 5,
      targetLevel: 5,
      skillLevel: 5,
      proficiency: 0.5,
      worldTime: 100,
    });
    expect(result.success).toBe(true);
  });
});

describe('Scout - Field Visibility by Skill Level', () => {
  it('level 1-2: only name and level', () => {
    expect(getVisibleFields(1, 1.0)).toEqual(['name', 'level']);
    expect(getVisibleFields(2, 1.0)).toEqual(['name', 'level']);
  });

  it('level 3-4: adds hp', () => {
    const fields = getVisibleFields(3, 1.0);
    expect(fields).toContain('hp');
    expect(fields).not.toContain('mp');
  });

  it('level 5-6: adds mp and equipment', () => {
    const fields = getVisibleFields(5, 1.0);
    expect(fields).toContain('mp');
    expect(fields).toContain('equipment');
  });

  it('level 7-8: adds skills', () => {
    const fields = getVisibleFields(7, 1.0);
    expect(fields).toContain('skills');
  });

  it('level 9-10: adds buffs and recentActions', () => {
    const fields = getVisibleFields(9, 1.0);
    expect(fields).toContain('buffs');
    expect(fields).toContain('recentActions');
  });
});

describe('Scout - Proficiency Modifies Effective Level', () => {
  it('low proficiency reduces effective level', () => {
    const lowProf = getVisibleFields(5, 0.1);
    const highProf = getVisibleFields(5, 1.0);
    // Low proficiency at skill 5: effective = 5 * (0.5 + 0.05) = 2.75
    // High proficiency at skill 5: effective = 5 * 1.0 = 5.0
    expect(lowProf.length).toBeLessThan(highProf.length);
    expect(lowProf).not.toContain('equipment');
  });

  it('high proficiency unlocks more fields', () => {
    const fields = getVisibleFields(8, 1.0);
    expect(fields).toContain('skills');
  });
});

describe('Scout - Frozen Snapshot', () => {
  it('snapshot is immutable after freeze', () => {
    const result = attemptScout({
      scoutUserId: 'c1',
      targetId: 'c2',
      scoutLevel: 10,
      targetLevel: 5,
      skillLevel: 5,
      proficiency: 1.0,
      worldTime: 100,
    });
    expect(result.snapshot).toBeDefined();

    const frozen = freezeSnapshot(result.snapshot!, {
      name: 'Target',
      level: 5,
      hp: { current: 100, max: 100 },
    });

    expect(frozen.data.name).toBe('Target');
    expect(frozen.data.hp?.current).toBe(100);
    expect(frozen.visibleFields).toContain('name');
  });

  it('snapshot does not track target state changes', () => {
    const result = attemptScout({
      scoutUserId: 'c1',
      targetId: 'c2',
      scoutLevel: 10,
      targetLevel: 5,
      skillLevel: 5,
      proficiency: 1.0,
      worldTime: 100,
    });

    // Initial state captured
    const frozen = freezeSnapshot(result.snapshot!, {
      name: 'Target',
      hp: { current: 100, max: 100 },
    });

    // Simulate target state change (in the real system)
    // The frozen snapshot should remain at the captured values
    // (The caller shouldn't be able to modify the frozen snapshot)
    expect(() => {
      (frozen as { data: { name?: string } }).data.name = 'Changed';
    }).toThrow();
  });

  it('snapshot only includes visible fields', () => {
    const result = attemptScout({
      scoutUserId: 'c1',
      targetId: 'c2',
      scoutLevel: 10,
      targetLevel: 5,
      skillLevel: 2, // only name + level
      proficiency: 1.0,
      worldTime: 100,
    });

    expect(result.snapshot!.visibleFields).toEqual(['name', 'level']);
    expect(result.snapshot!.visibleFields).not.toContain('hp');
  });
});
