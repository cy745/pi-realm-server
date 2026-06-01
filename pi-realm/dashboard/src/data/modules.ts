// Module registry: each subsystem in the backend is a module on the dashboard.
// Add new modules here as subsystems are built.

import {
  Activity,
  Brain,
  Database,
  Eye,
  Flame,
  Network,
  Radio,
  Radar,
  ScanSearch,
  ScrollText,
  Users,
} from 'lucide-react';
import type { ModuleMeta } from '../types/module.ts';

export const MODULES: ModuleMeta[] = [
  // ============ Core ============
  {
    id: 'map-state',
    name: 'Map State',
    description: '客观世界状态：房间、地图、动态变化。固化、单源真相。',
    category: 'core',
    icon: Database,
    status: 'online',
    metrics: [
      { label: 'Rooms', value: 0, trend: 'flat' },
      { label: 'State Changes', value: 0 },
      { label: 'Active Fires', value: 0, trend: 'flat' },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 6 },
  },
  {
    id: 'tick-loop',
    name: 'Tick Loop',
    description: '世界 Tick 调度。固定 5min 现实 = 1h 游戏，超时跳过下一 tick。',
    category: 'core',
    icon: Activity,
    status: 'online',
    metrics: [
      { label: 'Current Tick', value: 0 },
      { label: 'Game Time', value: '00:00' },
      { label: 'Status', value: 'idle' },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 9 },
  },
  {
    id: 'world-sim',
    name: 'World Simulation',
    description: '背景全模拟：时间循环、天气演化、火灾蔓延、结构老化。',
    category: 'simulation',
    icon: Flame,
    status: 'online',
    metrics: [
      { label: 'Active Fires', value: 0 },
      { label: 'Time of Day', value: 'day' },
      { label: 'Weather', value: 'clear' },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 15 },
  },

  // ============ Visibility ============
  {
    id: 'perception',
    name: 'Perception',
    description: '跨场景感知：damage/light/sound/vibration 四通道传播。',
    category: 'core',
    icon: Radar,
    status: 'online',
    metrics: [
      { label: 'Channels', value: 4 },
      { label: 'Events/s', value: 0 },
      { label: 'Avg Range', value: '8m' },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 18 },
  },
  {
    id: 'filter',
    name: 'Visibility Filter',
    description: '可见性过滤管线：spatial → knowledge → plot → decay。',
    category: 'core',
    icon: Eye,
    status: 'online',
    metrics: [
      { label: 'Filters', value: 4 },
      { label: 'Filtered/s', value: 0 },
      { label: 'Pass Rate', value: '—' },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 14 },
  },
  {
    id: 'scout',
    name: 'Scout',
    description: '探查技能：等级门槛 + 技能裁剪 + 冻结快照。',
    category: 'core',
    icon: ScanSearch,
    status: 'online',
    metrics: [
      { label: 'Snapshots', value: 0 },
      { label: 'Skill Levels', value: 10 },
      { label: 'Blocked', value: 0 },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 13 },
  },

  // ============ Memory ============
  {
    id: 'memory',
    name: 'Memory',
    description: '角色记忆：主观、衰减、永久、强化。带 Map State 引用。',
    category: 'core',
    icon: Brain,
    status: 'online',
    metrics: [
      { label: 'Total', value: 0 },
      { label: 'Active', value: 0 },
      { label: 'Decayed', value: 0 },
    ],
    source: { type: 'built-in', since: 'SESSION-004', tests: 13 },
  },

  // ============ Agent ============
  {
    id: 'npc-agents',
    name: 'NPC Agents',
    description: 'NPC AI 调度池（多 Agent 并行）。由 pi-agent-core 驱动。',
    category: 'agent',
    icon: Network,
    status: 'planned',
    metrics: [
      { label: 'Active Agents', value: 0 },
      { label: 'Queue Depth', value: 0 },
      { label: 'Decisions/s', value: 0 },
    ],
    source: { type: 'planned' },
  },
  {
    id: 'players',
    name: 'Players',
    description: '在线玩家、连接会话、客户端版本。',
    category: 'agent',
    icon: Users,
    status: 'planned',
    metrics: [
      { label: 'Online', value: 0 },
      { label: 'Sessions', value: 0 },
      { label: 'Avg Latency', value: '—' },
    ],
    source: { type: 'planned' },
  },

  // ============ Observability ============
  {
    id: 'events',
    name: 'Event Log',
    description: '世界事件流：WorldEvent、StateChange、Combat、NPC 行为。',
    category: 'observability',
    icon: ScrollText,
    status: 'online',
    metrics: [
      { label: 'Total', value: 0 },
      { label: 'Last 1h', value: 0 },
      { label: 'Errors', value: 0 },
    ],
    source: { type: 'in-progress' },
  },
  {
    id: 'transport',
    name: 'WebSocket Transport',
    description: '客户端连接管理：WebSocket、心跳、消息分发。',
    category: 'observability',
    icon: Radio,
    status: 'planned',
    metrics: [
      { label: 'Connections', value: 0 },
      { label: 'Msg/s', value: 0 },
      { label: 'Avg Latency', value: '—' },
    ],
    source: { type: 'planned' },
  },
];

export const CATEGORIES: Array<{ id: ModuleMeta['category']; label: string }> = [
  { id: 'core', label: 'Core' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'agent', label: 'Agent' },
  { id: 'observability', label: 'Observability' },
];

export function getModuleById(id: string): ModuleMeta | undefined {
  return MODULES.find((m) => m.id === id);
}
