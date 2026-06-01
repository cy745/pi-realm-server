// Character movement system — speed, stamina, terrain

import { terrainSpeedFactor, terrainStaminaCost, isTraversable } from '../map/terrain.ts';
import type { Character, MovementStats } from '../types.ts';

export interface MoveResult {
  success: boolean;
  x: number;
  y: number;
  staminaUsed: number;
  timeSeconds: number;
  reason?: string;
  terrainType?: string;
}

/** Calculate move cost and return resulting position */
export function calculateMove(
  char: Character,
  targetX: number,
  targetY: number,
  terrainSampler: { sample: (x: number, y: number) => { type: string; slope: number } },
): MoveResult {
  const dx = targetX - char.x;
  const dy = targetY - char.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) {
    return { success: true, x: char.x, y: char.y, staminaUsed: 0, timeSeconds: 0 };
  }

  // Sample terrain at start and end, average
  const startTerrain = terrainSampler.sample(char.x, char.y);
  const endTerrain = terrainSampler.sample(targetX, targetY);
  const avgSpeedFactor = (terrainSpeedFactor(startTerrain.type as never) + terrainSpeedFactor(endTerrain.type as never)) / 2;
  const avgStaminaCost = (terrainStaminaCost(startTerrain.type as never) + terrainStaminaCost(endTerrain.type as never)) / 2;

  if (avgSpeedFactor === 0) {
    return { success: false, x: char.x, y: char.y, staminaUsed: 0, timeSeconds: 0, reason: 'Cannot traverse this terrain' };
  }

  // Apply vehicle bonus
  let speedMult = avgSpeedFactor;
  let staminaMult = avgStaminaCost;
  if (char.movement.vehicle === 'horse') { speedMult *= 2.5; staminaMult *= 0.3; }
  if (char.movement.vehicle === 'cart') { speedMult *= 1.5; staminaMult *= 0.5; }
  if (char.movement.vehicle === 'boat' && endTerrain.type === 'water') { speedMult = 2.0; staminaMult = 0.2; }

  const effectiveSpeed = char.movement.speed * speedMult;
  const staminaCost = Math.ceil(distance * 0.1 * staminaMult); // 10m per stamina point
  const timeSeconds = distance / effectiveSpeed;

  if (staminaCost > char.movement.currentStamina) {
    return {
      success: false,
      x: char.x, y: char.y,
      staminaUsed: 0, timeSeconds: 0,
      reason: 'Too exhausted to move that far',
      terrainType: endTerrain.type,
    };
  }

  return {
    success: true,
    x: targetX, y: targetY,
    staminaUsed: staminaCost,
    timeSeconds,
    terrainType: endTerrain.type,
  };
}

/** Move character to new position (mutates char) */
export function applyMove(char: Character, result: MoveResult): void {
  char.x = result.x;
  char.y = result.y;
  char.movement.currentStamina = Math.max(0, char.movement.currentStamina - result.staminaUsed);
}

/** Rest stamina over time */
export function restTick(char: Character, ticks: number, isSleeping = false): void {
  const perTick = isSleeping ? char.movement.maxStamina * 0.05 : char.movement.maxStamina * 0.02;
  char.movement.currentStamina = Math.min(char.movement.maxStamina, char.movement.currentStamina + perTick * ticks);
}

/** Eat to recover some stamina */
export function eat(char: Character, amount: number): void {
  char.movement.currentStamina = Math.min(char.movement.maxStamina, char.movement.currentStamina + amount);
}
