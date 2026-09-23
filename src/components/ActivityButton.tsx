import { Pencil } from 'lucide-react';
import type { ActivityConfig } from '../activities';
import type { ActivityLog } from '../types';
import { isSessionRunning } from '../domain/day';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { formatElapsed } from '../utils/time';
import { ICONS } from './icons';
import './ActivityButton.css';

type ActivityButtonProps = {
  config: ActivityConfig;
  log: ActivityLog;
  onTap: () => void;
  onEdit: () => void;
};

export function ActivityButton({ config, log, onTap, onEdit }: ActivityButtonProps) {
  const Icon = ICONS[config.icon];
  const running = log.kind === 'timer' && isSessionRunning(log);
  const runningStart =
    log.kind === 'timer' && running ? log.sessions[log.sessions.length - 1].start : null;
  const elapsedMs = useElapsedTime(runningStart);

  return (
    <div className="activity-button">
      <button
        type="button"
        className="activity-button__edit"
        aria-label={`Edit ${config.label}`}
        onClick={onEdit}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className={`activity-button__main${running ? ' activity-button__main--active' : ''}`}
        aria-label={config.label}
        onClick={onTap}
      >
        <Icon size={28} />
        <span>{config.label}</span>
        {log.kind === 'counter' && <span className="activity-button__badge">{log.count}</span>}
        {log.kind === 'timer' && running && (
          <span className="activity-button__elapsed">{formatElapsed(elapsedMs)}</span>
        )}
      </button>
    </div>
  );
}
