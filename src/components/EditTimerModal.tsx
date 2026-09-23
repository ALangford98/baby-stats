import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { TimerLog, TimerSession } from '../types';

type EditTimerModalProps = {
  config: ActivityConfig;
  log: TimerLog;
  onSave: (sessions: TimerSession[]) => void;
  onClose: () => void;
};

export function EditTimerModal({ config, log, onSave, onClose }: EditTimerModalProps) {
  const [sessions, setSessions] = useState<TimerSession[]>(log.sessions);

  function updateSession(index: number, patch: Partial<TimerSession>) {
    setSessions((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function deleteSession(index: number) {
    setSessions((prev) => prev.filter((_, i) => i !== index));
  }

  function addSession() {
    const now = new Date().toISOString();
    setSessions((prev) => [...prev, { start: now, end: now }]);
  }

  return (
    <div role="dialog" aria-label={`Edit ${config.label}`}>
      {sessions.map((session, index) => (
        <div key={index}>
          <label htmlFor={`start-${index}`}>Start {index + 1}</label>
          <input
            id={`start-${index}`}
            type="datetime-local"
            value={session.start.slice(0, 16)}
            onChange={(e) => updateSession(index, { start: new Date(e.target.value).toISOString() })}
          />
          <label htmlFor={`end-${index}`}>End {index + 1}</label>
          <input
            id={`end-${index}`}
            type="datetime-local"
            value={session.end ? session.end.slice(0, 16) : ''}
            onChange={(e) =>
              updateSession(index, { end: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
          <button type="button" aria-label={`Delete session ${index + 1}`} onClick={() => deleteSession(index)}>
            Delete session
          </button>
        </div>
      ))}
      <button type="button" onClick={addSession}>
        Add session
      </button>
      <button type="button" onClick={() => onSave(sessions)}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
