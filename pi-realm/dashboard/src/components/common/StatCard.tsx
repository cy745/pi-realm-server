// Stat card - displays a single metric

import type { ModuleMetric } from '../../types/module.ts';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

interface StatCardProps {
  metric: ModuleMetric;
}

export function StatCard({ metric }: StatCardProps) {
  const TrendIcon =
    metric.trend === 'up' ? ArrowUp : metric.trend === 'down' ? ArrowDown : Minus;

  return (
    <div className="flex flex-col gap-1">
      <div className="stat-label">{metric.label}</div>
      <div className="flex items-baseline gap-2">
        <span className="stat-value">{metric.value}</span>
        {metric.unit && <span className="text-sm text-ink-500 font-mono">{metric.unit}</span>}
      </div>
      {metric.trend && (
        <div
          className={
            metric.trend === 'up'
              ? 'flex items-center gap-1 text-xs text-status-online font-mono'
              : metric.trend === 'down'
                ? 'flex items-center gap-1 text-xs text-status-error font-mono'
                : 'flex items-center gap-1 text-xs text-ink-400 font-mono'
          }
        >
          <TrendIcon className="w-3 h-3" />
          <span>{metric.trendValue ?? '—'}</span>
        </div>
      )}
    </div>
  );
}
