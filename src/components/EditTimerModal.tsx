import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { TimerLog, TimerSession } from '../types';
import { fromLocalInputValue, toLocalInputValue } from '../utils/time';
import { Dialog } from './Dialog';

type EditTimerModalProps = {
  config: ActivityConfig;
  log: TimerLog;
  onSave: (sessions: TimerSession[], useTimer: boolean) => void;
  onClose: () => void;
  onDelete?: () => void;
};

export function EditTimerModal({ config, log, onSave, onClose, onDelete }: EditTimerModalProps) {
  const [sessions, setSessions] = useState<TimerSession[]>(log.sessions);
  const [useTimer, setUseTimer] = useState(!config.countOnly);
  const [countValue, setCountValue] = useState(String(log.sessions.length));

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

  // Count-only mode edits a number, not sessions: keep the earliest sessions
  // up to the new count and pad with instant ones, so the recorded times
  // survive a round trip back to timer mode. A session left running would
  // tick forever with no timer to stop it, so it is closed on the way out.
  function sessionsToSave(): TimerSession[] {
    if (useTimer) return sessions;
    const now = new Date().toISOString();
    const count = Math.max(0, Math.floor(Number(countValue) || 0));
    const kept = sessions.slice(0, count).map((s) => (s.end === null ? { ...s, end: now } : s));
    while (kept.length < count) kept.push({ start: now, end: now });
    return kept;
  }

  function handleUseTimerChange(checked: boolean) {
    setUseTimer(checked);
    // Carry any count edit over so switching modes never discards typing.
    if (!checked) setCountValue(String(sessions.length));
    else setSessions(sessionsToSave());
  }

  return (
    <Dialog label={`Edit ${config.label}`} onClose={onClose}>
      <label className="timer-mode-toggle">
        <input type="checkbox" checked={useTimer} onChange={(e) => handleUseTimerChange(e.target.checked)} />
        Use timer
      </label>
      {!useTimer && (
        <>
          <label htmlFor="timer-count-input">{config.label} count</label>
          <input
            id="timer-count-input"
            type="number"
            min={0}
            value={countValue}
            onChange={(e) => setCountValue(e.target.value)}
          />
        </>
      )}
      {useTimer && sessions.map((session, index) => (
        <div key={index} className="timer-session-row">
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
      {useTimer && (
        <button type="button" onClick={addSession}>
          Add session
        </button>
      )}
      <button type="button" onClick={() => onSave(sessionsToSave(), useTimer)}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete the "${config.label}" button? This does not delete anything already logged.`)) {
              onDelete();
            }
          }}
        >
          Delete this button
        </button>
      )}
    </Dialog>
  );
}
