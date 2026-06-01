// Top bar — shows live server status with tick counter

import { Search, Server, Activity } from 'lucide-react';
import { useServerStatus } from '../../hooks/useServerStatus.ts';

interface TopBarProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export function TopBar({ title, subtitle, rightSlot }: TopBarProps) {
  const { status, events } = useServerStatus(3000);

  return (
    <header className="h-16 border-b border-ink-200 bg-white px-8 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-base font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="text-xs text-ink-500 font-mono mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        {rightSlot}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            type="search"
            placeholder="Search modules..."
            aria-label="Search modules"
            className="pl-8 pr-3 py-1.5 text-sm bg-ink-50 border border-ink-200 rounded-sm w-56 placeholder:text-ink-400 focus:bg-white focus:border-accent-500 transition-colors"
          />
        </div>

        {/* Live tick badge */}
        {status && (
          <div className="flex items-center gap-2 px-3 py-1.5 border border-ink-200 rounded-sm text-xs font-mono">
            <Activity className="w-3.5 h-3.5 text-ink-500" />
            <span className="text-ink-700">tick #{status.world.tick}</span>
            <span className="text-ink-400">· {status.world.gameTime}h</span>
          </div>
        )}

        {/* Server connection */}
        <div className="flex items-center gap-2 px-3 py-1.5 border border-ink-200 rounded-sm text-xs font-mono">
          <Server className="w-3.5 h-3.5 text-ink-500" />
          <span className="text-ink-700">localhost:3001</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${status ? 'bg-status-online' : 'bg-status-error'}`}
          />
        </div>
      </div>
    </header>
  );
}
