// Types for the dashboard module system
// Each subsystem in the pi-realm backend registers as a module here

import type { LucideIcon } from 'lucide-react';

export type ModuleStatus = 'online' | 'idle' | 'error' | 'offline' | 'planned';

export type ModuleCategory = 'core' | 'simulation' | 'agent' | 'observability';

export interface ModuleMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
}

export interface ModuleMeta {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  icon: LucideIcon;
  status: ModuleStatus;
  metrics: ModuleMetric[];
  source: {
    type: 'built-in' | 'in-progress' | 'planned';
    since?: string;
    tests?: number;
  };
}

export interface ModuleEvent {
  id: string;
  timestamp: number;
  moduleId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}
