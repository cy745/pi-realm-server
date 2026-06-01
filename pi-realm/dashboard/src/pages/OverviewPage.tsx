// Overview page - shows all modules as a grid, plus system stats

import { Box, Cpu, Layers, TrendingUp } from 'lucide-react';
import { MODULES, CATEGORIES } from '../data/modules.ts';
import { ModuleCard } from '../components/common/ModuleCard.tsx';
import { StatCard } from '../components/common/StatCard.tsx';

interface OverviewPageProps {
  onSelectModule: (id: string) => void;
}

export function OverviewPage({ onSelectModule }: OverviewPageProps) {
  const builtIn = MODULES.filter((m) => m.source.type === 'built-in');
  const inProgress = MODULES.filter((m) => m.source.type === 'in-progress');
  const planned = MODULES.filter((m) => m.source.type === 'planned');
  const onlineCount = builtIn.filter((m) => m.status === 'online').length;
  const totalTests = builtIn.reduce((sum, m) => sum + (m.source.tests ?? 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Hero stats */}
      <section className="mb-10">
        <div className="panel">
          <div className="px-5 py-4 border-b border-ink-100">
            <div className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
              System Status
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-ink-100">
            <div className="px-5 py-5">
              <StatCard
                metric={{
                  label: 'Modules Online',
                  value: `${onlineCount}/${builtIn.length}`,
                  trend: 'up',
                  trendValue: `${builtIn.length - onlineCount} idle`,
                }}
              />
            </div>
            <div className="px-5 py-5">
              <StatCard
                metric={{
                  label: 'Total Modules',
                  value: MODULES.length,
                  trend: 'flat',
                }}
              />
            </div>
            <div className="px-5 py-5">
              <StatCard
                metric={{
                  label: 'Tests Passing',
                  value: totalTests,
                  unit: 'tests',
                  trend: 'up',
                  trendValue: '100%',
                }}
              />
            </div>
            <div className="px-5 py-5">
              <StatCard
                metric={{
                  label: 'Uptime',
                  value: '—',
                  unit: 'since server start',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Built-in modules */}
      {builtIn.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            icon={Cpu}
            title="Built-in Subsystems"
            description="已实现并通过测试的核心子系统"
            count={builtIn.length}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {builtIn.map((m) => (
              <ModuleCard key={m.id} module={m} onClick={() => onSelectModule(m.id)} />
            ))}
          </div>
        </section>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            icon={Layers}
            title="In Progress"
            description="实现中，尚未完整"
            count={inProgress.length}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inProgress.map((m) => (
              <ModuleCard key={m.id} module={m} onClick={() => onSelectModule(m.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Planned */}
      {planned.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            icon={Box}
            title="Planned"
            description="架构中规划但尚未开始"
            count={planned.length}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {planned.map((m) => (
              <ModuleCard key={m.id} module={m} onClick={() => onSelectModule(m.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Categories summary */}
      <section className="mb-10">
        <SectionHeader
          icon={TrendingUp}
          title="By Category"
          description="按职责分组"
          count={CATEGORIES.length}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => {
            const mods = MODULES.filter((m) => m.category === cat.id);
            return (
              <div key={cat.id} className="panel p-5">
                <div className="text-xs uppercase tracking-wider text-ink-500 font-mono mb-3">
                  {cat.label}
                </div>
                <div className="text-2xl font-mono font-semibold text-ink-900 mb-2">
                  {mods.length}
                </div>
                <div className="text-xs text-ink-500">
                  {mods.filter((m) => m.source.type === 'built-in').length} built-in ·{' '}
                  {mods.filter((m) => m.source.type === 'planned').length} planned
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count: number;
}

function SectionHeader({ icon: Icon, title, description, count }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-4 pb-2 border-b border-ink-200">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-ink-700" />
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <p className="text-xs text-ink-500">{description}</p>
        </div>
      </div>
      <div className="font-mono text-xs text-ink-400">{count}</div>
    </div>
  );
}
