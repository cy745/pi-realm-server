// Live module card — shows real-time data from server

import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import type { ModuleMeta } from '../../types/module.ts';
import { StatusBadge } from './StatusBadge.tsx';
import type { ServerStatus } from '../../hooks/useServerStatus.ts';

interface LiveModuleCardProps {
  module: ModuleMeta;
  liveStatus?: ServerStatus;
  onClick?: () => void;
}

function fmtMem(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

export function LiveModuleCard({ module, liveStatus, onClick }: LiveModuleCardProps) {
  const Icon = module.icon;

  // Override hardcoded metrics with live data
  const getLiveMetrics = () => {
    if (!liveStatus) return module.metrics.slice(0, 3);

    switch (module.id) {
      case 'tick-loop':
        return [
          { label: 'Current Tick', value: liveStatus.world.tick, trend: 'up' as const, trendValue: 'running' },
          { label: 'Game Time', value: liveStatus.world.gameTime, unit: 'h' as const },
          { label: 'Uptime', value: `${Math.floor(liveStatus.server.uptime / 60)}m` },
        ];
      case 'map-state':
        return [
          { label: 'Rooms', value: liveStatus.world.rooms, trend: 'flat' as const },
          { label: 'Characters', value: liveStatus.world.characters },
          { label: 'Memory', value: '—' },
        ];
      case 'transport':
        return [
          { label: 'Connections', value: 0 },
          { label: 'Msg/s', value: 0 },
          { label: 'Memory', value: fmtMem(liveStatus.server.memory) },
        ];
      default:
        return module.metrics.slice(0, 3).map((m) => {
          if (m.label === 'Total' && module.id === 'events') {
            return { ...m, value: liveStatus.world.tick };
          }
          return m;
        });
    }
  };

  const metrics = getLiveMetrics();

  return (
    <button
      type="button"
      onClick={onClick}
      className="panel text-left w-full p-0 transition-all duration-200 hover:border-ink-300 hover:shadow-sm cursor-pointer group"
    >
      <div className="px-5 pt-4 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center border border-ink-200 rounded-sm text-ink-700 group-hover:border-accent-500 group-hover:text-accent-600 transition-colors">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-900">{module.name}</div>
            <div className="text-xs text-ink-500 font-mono">/modules/{module.id}</div>
          </div>
        </div>
        <StatusBadge status={module.status} />
      </div>

      <div className="px-5 pb-4">
        <p className="text-xs text-ink-600 leading-relaxed line-clamp-2 min-h-[2.5rem]">
          {module.description}
        </p>
      </div>

      {metrics.length > 0 && (
        <div className="px-5 py-3 border-t border-ink-100 grid grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium">
                {m.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-semibold text-ink-900 tabular-nums">
                  {m.value}
                </span>
                {m.unit && <span className="text-xs text-ink-500 font-mono">{m.unit}</span>}
              </div>
              {m.trend && (
                <div className="flex items-center gap-1 text-xs font-mono text-status-online">
                  {m.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{m.trendValue ?? '—'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-2 border-t border-ink-100 flex items-center justify-between bg-ink-50/50">
        <span className="text-xs font-mono text-ink-500">
          {module.source.type === 'built-in' ? `${module.source.tests} tests` : module.source.type}
        </span>
        <ChevronRight className="w-4 h-4 text-ink-400 group-hover:text-ink-700 transition-colors" />
      </div>
    </button>
  );
}
