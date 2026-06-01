// Status badge - shows online/idle/error/offline

import type { ModuleStatus } from '../../types/module.ts';
import clsx from 'clsx';

const LABELS: Record<ModuleStatus, string> = {
  online: 'online',
  idle: 'idle',
  error: 'error',
  offline: 'offline',
  planned: 'planned',
};

const CLASSES: Record<ModuleStatus, string> = {
  online: 'badge-online',
  idle: 'badge-idle',
  error: 'badge-error',
  offline: 'badge-offline',
  planned: 'badge-offline',
};

interface StatusBadgeProps {
  status: ModuleStatus;
  withDot?: boolean;
  className?: string;
}

export function StatusBadge({ status, withDot = true, className }: StatusBadgeProps) {
  return (
    <span className={clsx('badge', CLASSES[status], className)}>
      {withDot && (
        <span
          className={clsx('w-1.5 h-1.5 rounded-full', {
            'bg-status-online': status === 'online',
            'bg-status-idle': status === 'idle',
            'bg-status-error': status === 'error',
            'bg-ink-400': status === 'offline',
          })}
        />
      )}
      {LABELS[status]}
    </span>
  );
}
