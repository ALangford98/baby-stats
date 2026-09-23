import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { TimerLog, TimerSession } from '../types';
import { fromLocalInputValue, toLocalInputValue } from '../utils/time';

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
            value={toLocalInputValue(session.start)}
            onChange={(e) => updateSession(index, { start: fromLocalInputValue(e.target.value) })}
          />
          <label htmlFor={`end-${index}`}>End {index + 1}</label>
          <input
            id={`end-${index}`}
            type="datetime-local"
            value={session.end ? toLocalInputValue(session.end) : ''}
            onChange={(e) =>
              updateSession(index, { end: e.target.value ? fromLocalInputValue(e.target.value) : null })
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
