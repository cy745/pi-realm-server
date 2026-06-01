// Visibility filter pipeline: spatial -> knowledge -> plot -> decay

import type { Character, WorldEvent } from '../types.ts';
import type { WorldTopology } from './perception.ts';

export interface VisibilityDecision {
  visible: boolean;
  reason?: 'spatial' | 'knowledge' | 'plot' | 'decay';
}

export function spatialFilter(
  event: WorldEvent,
  character: Character,
  topology: WorldTopology,
): VisibilityDecision {
  // Same room is always visible
  if (event.location === character.roomId) {
    return { visible: true };
  }
  // Within any propagation radius and obstacle checks would be in perception
  // For hard rule: adjacent rooms are visible
  const distance = topology.pathDistance(event.location, character.roomId);
  if (distance <= 1) {
    return { visible: true };
  }
  return { visible: false, reason: 'spatial' };
}

export interface KnowledgeProvider {
  isKnownBy(characterId: string, eventId: string): boolean;
  hasPlotFlag(characterId: string, flag: string): boolean;
}

export function knowledgeFilter(
  event: WorldEvent,
  character: Character,
  knowledge: KnowledgeProvider,
): VisibilityDecision {
  // Check explicit knownBy
  const knownBy = (event.payload['knownBy'] as string[] | undefined) ?? [];
  if (knownBy.includes(character.id)) {
    return { visible: true };
  }
  // Check if character knows through knowledge provider
  if (knowledge.isKnownBy(character.id, event.id)) {
    return { visible: true };
  }
  return { visible: false, reason: 'knowledge' };
}

export function plotFilter(
  event: WorldEvent,
  character: Character,
  knowledge: KnowledgeProvider,
): VisibilityDecision {
  const requiresFlags = (event.payload['requiresFlags'] as string[] | undefined) ?? [];
  for (const flag of requiresFlags) {
    if (!knowledge.hasPlotFlag(character.id, flag)) {
      return { visible: false, reason: 'plot' };
    }
  }
  return { visible: true };
}

export interface DecayProvider {
  getEventAge(eventId: string, currentTick: number): number | null;
}

export function decayFilter(
  event: WorldEvent,
  _character: Character,
  decay: DecayProvider,
  currentTick: number,
): VisibilityDecision {
  const decayTicks = (event.payload['decayTicks'] as number | undefined) ?? -1;
  if (decayTicks < 0) return { visible: true }; // no decay configured
  const age = decay.getEventAge(event.id, currentTick);
  if (age === null) return { visible: true };
  if (age > decayTicks) {
    return { visible: false, reason: 'decay' };
  }
  return { visible: true };
}

export interface FilterContext {
  topology: WorldTopology;
  knowledge: KnowledgeProvider;
  decay: DecayProvider;
  currentTick: number;
}

export function runVisibilityPipeline(
  event: WorldEvent,
  character: Character,
  ctx: FilterContext,
): VisibilityDecision {
  const spatial = spatialFilter(event, character, ctx.topology);
  if (!spatial.visible) return spatial;

  const knowledge = knowledgeFilter(event, character, ctx.knowledge);
  if (!knowledge.visible) return knowledge;

  const plot = plotFilter(event, character, ctx.knowledge);
  if (!plot.visible) return plot;

  const decay = decayFilter(event, character, ctx.decay, ctx.currentTick);
  if (!decay.visible) return decay;

  return { visible: true };
}
