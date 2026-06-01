// Module detail page — shows live metrics, live events

import { Code2, FileCode, GitBranch, History, Settings, Terminal } from 'lucide-react';
import type { ModuleMeta } from '../types/module.ts';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { useServerStatus, type ServerStatus, type CharInfo, type RoomInfo } from '../hooks/useServerStatus.ts';

interface ModulePageProps {
  module: ModuleMeta;
}

export function ModulePage({ module }: ModulePageProps) {
  const Icon = module.icon;
  const { status, rooms, chars, events } = useServerStatus(2000);
  const moduleEvents = events.filter((e) => {
    if (module.id === 'events' || module.id === 'tick-loop') return true;
    return false;
  });
  const liveMetrics = getLiveMetrics(module.id, status);

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

      {/* Live metrics */}
      {liveMetrics.length > 0 && (
        <section className="mb-6">
          <div className="panel">
            <div className="panel-header">
              <div className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
                Live Metrics
                {status && <span className="ml-3 text-ink-400 font-normal">tick #{status.world.tick}</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-ink-100">
              {liveMetrics.map((m) => (
                <div key={m.label} className="px-5 py-5">
                  <div className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-1">{m.label}</div>
                  <div className="font-mono text-2xl font-semibold text-ink-900 tabular-nums">{m.value}</div>
                  <div className="text-[10px] text-ink-400 font-mono mt-0.5">{m.unit ?? ''}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* World-specific detail panels */}
      {module.id === 'map-state' && rooms.length > 0 && <RoomDetail rooms={rooms} chars={chars} />}
      {module.id === 'tick-loop' && status && <TickDetail status={status} />}

      {/* Source + origin */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-ink-500" />
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">Source</span>
            </div>
          </div>
          <div className="panel-body">
            <SourcePanel module={module} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-ink-500" />
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">Origin</span>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <div>
              <div className="text-xs text-ink-500 font-mono uppercase tracking-wider mb-1">Since</div>
              <div className="text-sm text-ink-900 font-mono">{module.source.since ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 font-mono uppercase tracking-wider mb-1">Tests</div>
              <div className="text-sm text-ink-900 font-mono">{module.source.tests ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 font-mono uppercase tracking-wider mb-1">Layer</div>
              <div className="text-sm text-ink-900 font-mono">{module.category}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live activity feed */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-ink-500" />
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">Activity</span>
          </div>
          <span className="text-xs font-mono text-ink-400">{moduleEvents.length} events</span>
        </div>
        {moduleEvents.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-400">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Waiting for events...</p>
            <p className="text-xs font-mono mt-1">Events appear here as the game loop runs</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100 max-h-96 overflow-y-auto">
            {moduleEvents.slice(0, 30).map((ev, i) => (
              <div key={`${ev.timestamp}-${i}`} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                <span className="font-mono text-ink-400 shrink-0 w-20 tabular-nums">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <span className="bg-ink-100 text-ink-700 px-1.5 py-0.5 rounded-sm font-mono text-[10px] uppercase shrink-0">
                  {ev.type}
                </span>
                <span className="text-ink-600 truncate font-mono text-[10px]">
                  {JSON.stringify(ev.payload).slice(0, 80)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live Metrics ────────────────────────────────────

function getLiveMetrics(moduleId: string, status?: ServerStatus | null) {
  if (!status) return [];
  switch (moduleId) {
    case 'tick-loop':
      return [
        { label: 'Current Tick', value: `#${status.world.tick}`, unit: `gameTime ${status.world.gameTime}h` },
        { label: 'Uptime', value: `${Math.floor(status.server.uptime / 60)}m`, unit: `${Math.floor(status.server.uptime % 60)}s` },
        { label: 'Memory', value: `${Math.round(status.server.memory / 1024 / 1024)}`, unit: 'MB' },
      ];
    case 'map-state':
      return [
        { label: 'Rooms', value: status.world.rooms },
        { label: 'Characters', value: status.world.characters },
        { label: 'Memory', value: `${Math.round(status.server.memory / 1024 / 1024)}`, unit: 'MB' },
      ];
    case 'transport':
      return [
        { label: 'Memory', value: `${Math.round(status.server.memory / 1024 / 1024)}`, unit: 'MB' },
      ];
    default:
      return [];
  }
}

// ── Room Detail ────────────────────────────────────

function RoomDetail({ rooms, chars }: { rooms: RoomInfo[]; chars: CharInfo[] }) {
  const roots = rooms.filter((r) => r.parent === null);
  return (
    <section className="mb-6">
      <div className="panel">
        <div className="panel-header">
          <div className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
            Locations · {rooms.length}
          </div>
        </div>
        <div className="p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
          {roots.map((root) => (
            <LocationTree key={root.id} node={root} rooms={rooms} chars={chars} depth={0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LocationTree({ node, rooms, chars, depth }: { node: RoomInfo; rooms: RoomInfo[]; chars: CharInfo[]; depth: number }) {
  const children = rooms.filter((r) => r.parent === node.id);
  const occupants = chars.filter((c) => c.address && c.address.includes(node.name));
  const indent = depth * 16;
  return (
    <div>
      <div className="flex items-center gap-2 py-0.5 hover:bg-ink-50 rounded-sm" style={{ marginLeft: indent }}>
        <span className="text-ink-400 w-4 shrink-0">{depth === 0 ? '▼' : '▸'}</span>
        <span className="text-ink-900 font-semibold">{node.name}</span>
        <span className="text-ink-400 text-[10px]">({node.x},{node.y})</span>
        <span className="text-ink-400 bg-ink-50 px-1 rounded-sm text-[10px]">{node.type}</span>
        {node.w * node.h < 10000 && (
          <span className="text-ink-400 bg-ink-50 px-1 rounded-sm text-[10px]">{node.w}×{node.h}m</span>
        )}
      </div>
      {occupants.length > 0 && (
        <div className="flex items-center gap-2 py-0.5 text-status-online text-[10px]" style={{ marginLeft: indent + 16 }}>
          {occupants.map((c) => (
            <span key={c.id}>{c.type === 'player' ? '▸' : '○'} {c.name}</span>
          ))}
        </div>
      )}
      {children.map((child) => (
        <LocationTree key={child.id} node={child} rooms={rooms} chars={chars} depth={depth + 1} />
      ))}
    </div>
  );
}

// ── Tick Detail ────────────────────────────────────

function TickDetail({ status }: { status: ServerStatus }) {
  return (
    <section className="mb-6">
      <div className="panel">
        <div className="panel-header">
          <div className="text-xs uppercase tracking-wider text-ink-500 font-mono font-medium">
            Tick Status
          </div>
        </div>
        <div className="p-5">
          <div className="bg-ink-900 text-ink-100 font-mono text-xs p-4 rounded-sm space-y-1">
            <div>$ pi-realm server --status</div>
            <div>tick={status.world.tick} gameTime={status.world.gameTime}h</div>
            <div>uptime={Math.floor(status.server.uptime)}s</div>
            <div>memory={Math.round(status.server.memory / 1024 / 1024)}MB</div>
            <div>rooms={status.world.rooms} chars={status.world.characters}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Source Panel ────────────────────────────────────

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
        <div className="px-3 py-2 bg-ink-50 border border-ink-100 rounded-sm text-ink-700">{p.src}</div>
      </div>
      <div>
        <div className="flex items-center gap-2 text-ink-500 mb-1">
          <FileCode className="w-3 h-3" />
          <span>tests</span>
        </div>
        <div className="px-3 py-2 bg-ink-50 border border-ink-100 rounded-sm text-ink-700">{p.test}</div>
      </div>
      {module.source.type === 'planned' && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-accent-50 border border-accent-200 rounded-sm text-accent-800">
          <Settings className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-accent-900">Module not yet implemented</div>
            <div className="text-accent-700 mt-0.5">
              Architecture defined in docs/ARCHITECTURE.md. Will appear here once the subsystem ships.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
