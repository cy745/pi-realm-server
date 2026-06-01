// Module detail page - shows a single module's metrics, recent events, configuration

import { Code2, FileCode, GitBranch, History, Settings, Terminal } from 'lucide-react';
import type { ModuleMeta } from '../types/module.ts';
import { StatCard } from '../components/common/StatCard.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';

interface ModulePageProps {
  module: ModuleMeta;
}

export function ModulePage({ module }: ModulePageProps) {
  const Icon = module.icon;
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 flex items-center justify-center border border-ink-200 rounded-sm text-ink-700 bg-white">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-semibold text-ink-900">{module.name}</h2>
              <StatusBadge status={module.status} />
              <span className="badge badge-offline font-mono">{module.category}</span>
            </div>
            <p className="text-sm text-ink-600 max-w-2xl">{module.description}</p>
            <div className="mt-2 font-mono text-xs text-ink-400">/modules/{module.id}</div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <section className="mb-6">
        <div className="panel">
          <div className="panel-header">
            <div className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
              Metrics
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-x divide-ink-100">
            {module.metrics.map((metric, i) => (
              <div
                key={metric.label}
                className={`px-5 py-5 ${i === module.metrics.length - 1 ? '' : ''}`}
              >
                <StatCard metric={metric} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two columns: source code + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-ink-500" />
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
                Source
              </span>
            </div>
            <span className="text-xs text-ink-400 font-mono">
              {module.source.type === 'built-in'
                ? 'implemented'
                : module.source.type === 'in-progress'
                  ? 'WIP'
                  : 'planned'}
            </span>
          </div>
          <div className="panel-body">
            <SourcePanel module={module} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-ink-500" />
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
                Origin
              </span>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <div>
              <div className="text-xs text-ink-500 font-mono uppercase tracking-wider mb-1">
                Since
              </div>
              <div className="text-sm text-ink-900 font-mono">
                {module.source.since ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-500 font-mono uppercase tracking-wider mb-1">
                Test Coverage
              </div>
              <div className="text-sm text-ink-900 font-mono">
                {module.source.tests ?? '—'} tests
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-500 font-mono uppercase tracking-wider mb-1">
                Layer
              </div>
              <div className="text-sm text-ink-900 font-mono">{module.category}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity placeholder */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-ink-500" />
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
              Recent Activity
            </span>
          </div>
        </div>
        <div className="px-5 py-12 text-center text-ink-400">
          <Terminal className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No recent activity</p>
          <p className="text-xs font-mono mt-1">
            Waiting for server connection to display live events
          </p>
        </div>
      </div>
    </div>
  );
}

function SourcePanel({ module }: { module: ModuleMeta }) {
  const paths: Record<string, { src: string; test: string }> = {
    'map-state': { src: 'src/game/room-state.ts', test: 'test/room-state.test.ts' },
    memory: { src: 'src/game/memory.ts', test: 'test/memory.test.ts' },
    perception: { src: 'src/visibility/perception.ts', test: 'test/perception.test.ts' },
    filter: { src: 'src/visibility/filter.ts', test: 'test/filter.test.ts' },
    scout: { src: 'src/visibility/scout.ts', test: 'test/scout.test.ts' },
    'tick-loop': { src: 'src/tick/tick-loop.ts', test: 'test/tick.test.ts' },
    'world-sim': { src: 'src/sim/world-sim.ts', test: 'test/world-sim.test.ts' },
    events: { src: '—', test: '—' },
    'npc-agents': { src: '—', test: '—' },
    players: { src: '—', test: '—' },
    transport: { src: '—', test: '—' },
  };

  const p = paths[module.id] ?? { src: '—', test: '—' };

  return (
    <div className="font-mono text-xs space-y-3">
      <div>
        <div className="flex items-center gap-2 text-ink-500 mb-1">
          <Code2 className="w-3 h-3" />
          <span>implementation</span>
        </div>
        <div className="px-3 py-2 bg-ink-50 border border-ink-100 rounded-sm text-ink-700">
          {p.src}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 text-ink-500 mb-1">
          <FileCode className="w-3 h-3" />
          <span>tests</span>
        </div>
        <div className="px-3 py-2 bg-ink-50 border border-ink-100 rounded-sm text-ink-700">
          {p.test}
        </div>
      </div>
      {module.source.type === 'planned' && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-accent-50 border border-accent-200 rounded-sm text-accent-800">
          <Settings className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-accent-900">Module not yet implemented</div>
            <div className="text-accent-700 mt-0.5">
              Architecture defined in docs/ARCHITECTURE.md. Will be added here once the
              corresponding subsystem ships.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
