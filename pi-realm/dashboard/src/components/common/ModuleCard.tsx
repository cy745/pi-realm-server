// Module card - compact module display for the overview grid

import { ChevronRight } from 'lucide-react';
import type { ModuleMeta } from '../../types/module.ts';
import { StatusBadge } from './StatusBadge.tsx';
import { StatCard } from './StatCard.tsx';

interface ModuleCardProps {
  module: ModuleMeta;
  onClick?: () => void;
}

export function ModuleCard({ module, onClick }: ModuleCardProps) {
  const Icon = module.icon;
  const showMetrics = module.metrics.slice(0, 3);

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

      {showMetrics.length > 0 && (
        <div className="px-5 py-3 border-t border-ink-100 grid grid-cols-3 gap-4">
          {showMetrics.map((metric) => (
            <StatCard key={metric.label} metric={metric} />
          ))}
        </div>
      )}

      <div className="px-5 py-2 border-t border-ink-100 flex items-center justify-between bg-ink-50/50">
        <span className="text-xs font-mono text-ink-500">
          {module.source.type === 'built-in'
            ? `${module.source.tests} tests`
            : module.source.type === 'in-progress'
              ? 'in progress'
              : 'planned'}
        </span>
        <ChevronRight className="w-4 h-4 text-ink-400 group-hover:text-ink-700 transition-colors" />
      </div>
    </button>
  );
}
