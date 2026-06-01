// Sidebar navigation - shows categories and modules

import {
  Activity,
  Brain,
  Database,
  Eye,
  Flame,
  LayoutGrid,
  Network,
  Radio,
  Radar,
  ScanSearch,
  ScrollText,
  Users,
} from 'lucide-react';
import { MODULES, CATEGORIES } from '../../data/modules.ts';
import type { ModuleCategory } from '../../types/module.ts';
import clsx from 'clsx';

interface SidebarProps {
  activeModuleId: string | null;
  onSelect: (id: string | null) => void;
}

const ICON_MAP = {
  Database,
  Activity,
  Flame,
  Radar,
  Eye,
  ScanSearch,
  Brain,
  Network,
  Users,
  ScrollText,
  Radio,
} as const;

export function Sidebar({ activeModuleId, onSelect }: SidebarProps) {
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    modules: MODULES.filter((m) => m.category === cat.id),
  }));

  return (
    <aside className="w-60 shrink-0 border-r border-ink-200 bg-white flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-ink-200">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-ink-900 text-ink-50 flex items-center justify-center rounded-sm font-mono text-xs font-bold">
            π
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-900 leading-tight">Pi Realm</div>
            <div className="text-[10px] text-ink-500 font-mono uppercase tracking-wider">
              Dashboard
            </div>
          </div>
        </div>
      </div>

      {/* Overview link */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={clsx('nav-item w-full', activeModuleId === null && 'nav-item-active')}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Overview</span>
        </button>
      </div>

      {/* Categories */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {grouped.map((cat) => (
          <div key={cat.id}>
            <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-ink-400 font-mono font-medium">
              {cat.label}
            </div>
            <div className="space-y-0.5">
              {cat.modules.map((m) => {
                const Icon = ICON_MAP[m.icon.name as keyof typeof ICON_MAP] ?? Database;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className={clsx(
                      'nav-item w-full',
                      activeModuleId === m.id && 'nav-item-active',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1 text-left">{m.name}</span>
                    <span
                      className={clsx(
                        'w-1.5 h-1.5 rounded-full',
                        m.status === 'online' && 'bg-status-online',
                        m.status === 'idle' && 'bg-status-idle',
                        m.status === 'error' && 'bg-status-error',
                        m.status === 'offline' && 'bg-ink-400',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-ink-200 text-[11px] font-mono text-ink-500">
        <div>v0.1.0 · dev</div>
        <div className="text-ink-400 mt-0.5">SESSION-004</div>
      </div>
    </aside>
  );
}

export type { ModuleCategory };
