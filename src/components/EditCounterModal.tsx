import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { CounterEntry, CounterLog } from '../types';
import { resizeEntries } from '../domain/entries';
import { formatClockTime, fromLocalInputValue, toLocalInputValue } from '../utils/time';
import { Dialog } from './Dialog';

type EditCounterModalProps = {
  config: ActivityConfig;
  log: CounterLog;
  onSave: (entries: CounterEntry[]) => void;
  onClose: () => void;
  onDelete?: () => void;
};

// Times are optional: the count box alone still works, and the list below it
// is there for anyone who wants to fill in or fix when things happened (e.g.
// logging an outing's diapers after getting home).
export function EditCounterModal({ config, log, onSave, onClose, onDelete }: EditCounterModalProps) {
  const [entries, setEntries] = useState<CounterEntry[]>(log.entries);
  const [countValue, setCountValue] = useState(String(log.entries.length));

  function changeCount(value: string) {
    setCountValue(value);
    const n = Number(value);
    if (value !== '' && Number.isFinite(n) && n >= 0) setEntries((prev) => resizeEntries(prev, Math.floor(n)));
  }

  function replaceEntry(index: number, entry: CounterEntry) {
    setEntries((prev) => prev.map((e, i) => (i === index ? entry : e)));
  }

  function setTime(index: number, value: string) {
    replaceEntry(index, value ? { kind: 'exact', at: fromLocalInputValue(value) } : { kind: 'untimed' });
  }

  function deleteEntry(index: number) {
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    setCountValue(String(next.length));
  }

  return (
    <Dialog label={`Edit ${config.label}`} onClose={onClose}>
      <label htmlFor="counter-input">{config.label} count</label>
      <input id="counter-input" type="number" min={0} value={countValue} onChange={(e) => changeCount(e.target.value)} />

      {entries.length > 0 && <p>Times (optional)</p>}
      <ol className="counter-entries">
        {entries.map((entry, index) => {
          const n = index + 1;
          return (
            <li key={index} className="counter-entry">
              {entry.kind === 'untimed' && <span>Time not set</span>}
              {entry.kind === 'overnight' && (
                <span>
                  Overnight, {formatClockTime(entry.from)}–{formatClockTime(entry.to)}
                </span>
              )}
              <input
                aria-label={`Time for entry ${n}`}
                type="datetime-local"
                value={entry.kind === 'exact' ? toLocalInputValue(entry.at) : ''}
                onChange={(e) => {
                  // Clearing an overnight entry's (empty) input must not wipe its window.
                  if (!e.target.value && entry.kind === 'overnight') return;
                  setTime(index, e.target.value);
                }}
              />
              {entry.kind === 'exact' && (
                <button type="button" aria-label={`Clear time for entry ${n}`} onClick={() => replaceEntry(index, { kind: 'untimed' })}>
                  Clear time
                </button>
              )}
              <button type="button" aria-label={`Delete entry ${n}`} onClick={() => deleteEntry(index)}>
                Delete
              </button>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={() => onSave(entries)}>
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
