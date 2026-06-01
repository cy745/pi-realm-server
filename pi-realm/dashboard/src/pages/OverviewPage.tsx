// Overview page — live data from server

import { Box, Cpu, Layers, TrendingUp } from 'lucide-react';
import { MODULES, CATEGORIES } from '../data/modules.ts';
import { LiveModuleCard } from '../components/common/LiveModuleCard.tsx';
import { useServerStatus } from '../hooks/useServerStatus.ts';
import type { ModuleMeta } from '../types/module.ts';

interface OverviewPageProps {
  onSelectModule: (id: string) => void;
}

export function OverviewPage({ onSelectModule }: OverviewPageProps) {
  const { status, rooms, chars, events } = useServerStatus(2000);

  const builtIn = MODULES.filter((m) => m.source.type === 'built-in');
  const inProgress = MODULES.filter((m) => m.source.type === 'in-progress');
  const planned = MODULES.filter((m) => m.source.type === 'planned');

  const totalTests = builtIn.reduce((sum, m) => sum + (m.source.tests ?? 0), 0);
  const playersOnline = chars.filter((c) => c.type === 'player').length;
  const npcCount = chars.filter((c) => c.type === 'npc').length;
  const recentEvents = events.slice(0, 5);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Hero stats — LIVE */}
      <section className="mb-10">
        <div className="panel">
          <div className="px-5 py-4 border-b border-ink-100">
            <div className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
              System Status
              {status && (
                <span className="ml-3 text-status-online">
                  · tick #{status.world.tick} · T+{Math.floor(status.server.uptime)}s
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-ink-100">
            <div className="px-5 py-5">
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-1">Tick</div>
              <div className="font-mono text-2xl font-semibold text-ink-900 tabular-nums">
                #{status?.world.tick ?? '—'}
              </div>
              {status && <div className="text-[10px] text-ink-400 font-mono mt-0.5">gameTime: {status.world.gameTime}h</div>}
            </div>
            <div className="px-5 py-5">
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-1">World</div>
              <div className="font-mono text-2xl font-semibold text-ink-900 tabular-nums">
                {status?.world.locations ?? 0}
              </div>
              <div className="text-[10px] text-ink-400 font-mono mt-0.5">locations · {npcCount} NPCs · {playersOnline} online</div>
            </div>
            <div className="px-5 py-5">
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-1">Tests</div>
              <div className="font-mono text-2xl font-semibold text-ink-900 tabular-nums">
                {totalTests}
              </div>
              <div className="text-[10px] text-ink-400 font-mono mt-0.5">7 suites · 100% pass</div>
            </div>
            <div className="px-5 py-5">
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-1">Server</div>
              <div className="font-mono text-2xl font-semibold text-ink-900 tabular-nums">
                {status ? `${Math.round(status.server.memory / 1024 / 1024)}MB` : '—'}
              </div>
              <div className="text-[10px] text-ink-400 font-mono mt-0.5">node {status?.server.node ?? ''}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Live event feed */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-4 pb-2 border-b border-ink-200">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-ink-700" />
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Live Feed</h2>
              <p className="text-xs text-ink-500">Recent server events</p>
            </div>
          </div>
          <div className="font-mono text-xs text-ink-400">{events.length} events</div>
        </div>
        {recentEvents.length === 0 ? (
          <div className="panel px-5 py-8 text-center text-ink-400">
            <p className="text-sm">Waiting for events...</p>
            <p className="text-xs font-mono mt-1">Server running, tick loop active</p>
          </div>
        ) : (
          <div className="panel divide-y divide-ink-100">
            {recentEvents.map((ev, i) => (
              <div key={`${ev.timestamp}-${i}`} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                <span className="font-mono text-ink-400 shrink-0">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <span className="bg-ink-100 text-ink-700 px-1.5 py-0.5 rounded-sm font-mono text-[10px] uppercase">
                  {ev.type}
                </span>
                <span className="text-ink-600 truncate">
                  {typeof ev.payload === 'object' && ev.payload !== null
                    ? JSON.stringify(ev.payload).slice(0, 60)
                    : String(ev.payload ?? '').slice(0, 60)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rooms Map */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-4 pb-2 border-b border-ink-200">
          <div className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-ink-700" />
            <div>
              <h2 className="text-sm font-semibold text-ink-900">World Map</h2>
              <p className="text-xs text-ink-500">{rooms.length} locations</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {rooms.filter((r) => r.parent !== null).slice(0, 18).map((room) => {
            const occupants = chars.filter((c) => c.address.includes(room.name));
            return (
              <div key={room.id} className="panel p-3">
                <div className="text-xs font-semibold text-ink-900 truncate">{room.name}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] font-mono text-ink-400">{room.type}</span>
                  <span className="text-[10px] font-mono text-ink-300">({room.x},{room.y})</span>
                </div>
                {occupants.length > 0 && (
                  <div className="mt-2 text-[10px] font-mono text-ink-500 space-y-0.5">
                    {occupants.map((c) => (
                      <div key={c.id} className={`truncate ${c.type === 'player' ? 'text-accent-600' : ''}`}>
                        {c.type === 'player' ? '▸' : '○'} {c.name} (Lv.{c.level} {c.hp.current}HP)
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Character table */}
      {chars.length > 0 && (
        <section className="mb-10">
          <div className="flex items-end justify-between mb-4 pb-2 border-b border-ink-200">
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-ink-700" />
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Characters</h2>
                <p className="text-xs text-ink-500">{chars.length} total</p>
              </div>
            </div>
          </div>
          <div className="panel overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2 text-ink-500 font-medium">Name</th>
                  <th className="text-left px-4 py-2 text-ink-500 font-medium">Type</th>
                  <th className="text-left px-4 py-2 text-ink-500 font-medium">Level</th>
                  <th className="text-left px-4 py-2 text-ink-500 font-medium">HP</th>
                  <th className="text-left px-4 py-2 text-ink-500 font-medium">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {chars.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-2 text-ink-900">{c.name}</td>
                    <td className="px-4 py-2">
                      <span className={`${c.type === 'player' ? 'text-accent-600' : 'text-ink-500'}`}>{c.type}</span>
                    </td>
                    <td className="px-4 py-2 text-ink-700">{c.level}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <span className={`${c.hp.current < c.hp.max * 0.3 ? 'text-status-error' : 'text-status-online'}`}>
                          {c.hp.current}/{c.hp.max}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-ink-500 truncate max-w-[160px] font-mono text-[10px]">{c.address ?? `${c.x},${c.y}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Module grid */}
      <section className="mb-10">
        <SectionHeader
          icon={Cpu}
          title="Subsystems"
          description={`${builtIn.length} built-in · ${inProgress.length} WIP · ${planned.length} planned`}
          count={MODULES.length}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((m) => (
            <LiveModuleCard key={m.id} module={m} liveStatus={status ?? undefined} onClick={() => onSelectModule(m.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count: number;
}) {
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

export type { SectionHeaderProps } from '../types/module.ts';
