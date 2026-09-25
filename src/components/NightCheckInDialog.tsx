import { useState } from 'react';
import type { ActivityConfig, Day } from '../types';
import { defaultBedtime, nightEntryTimes, nightSessionCount, validateBedtime, type NightTargets } from '../domain/night';
import { formatClockTime, fromLocalInputValue, toLocalInputValue } from '../utils/time';
import { Dialog } from './Dialog';

type NightCheckInDialogProps = {
  day: Day;
  activities: ActivityConfig[];
  now: string; // the wake-up time
  onConfirm: (bedAt: string, targets: NightTargets) => void;
  onCancel: () => void;
};

function loggedCounts(day: Day, activities: ActivityConfig[], bedAt: string, now: string): NightTargets {
  const targets: NightTargets = {};
  for (const a of activities) {
    const log = day.logs[a.type];
    if (log?.kind === 'counter') targets[a.type] = nightEntryTimes(log, bedAt, now).length;
  }
  return targets;
}

// Shows what was actually tapped overnight before anything is added, so a
// half-asleep 3am diaper change isn't logged twice in the morning.
export function NightCheckInDialog({ day, activities, now, onConfirm, onCancel }: NightCheckInDialogProps) {
  const [bedInput, setBedInput] = useState(() => toLocalInputValue(day.bedAt ?? defaultBedtime(day, now)));
  const bedAt = bedInput ? fromLocalInputValue(bedInput) : '';
  const error = bedAt ? validateBedtime(bedAt, day, now) : 'Enter a bedtime.';
  const [targets, setTargets] = useState<NightTargets>(() => loggedCounts(day, activities, day.bedAt ?? defaultBedtime(day, now), now));

  function changeBedtime(value: string) {
    setBedInput(value);
    // A different bedtime changes which taps count as "overnight".
    if (value) setTargets(loggedCounts(day, activities, fromLocalInputValue(value), now));
  }

  function adjust(type: string, delta: number) {
    setTargets((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] ?? 0) + delta) }));
  }

  return (
    <Dialog label="Good morning">
      {day.bedAt === null && (
        <>
          <label htmlFor="bedtime-input">When did you go to bed?</label>
          <input id="bedtime-input" type="datetime-local" value={bedInput} onChange={(e) => changeBedtime(e.target.value)} />
        </>
      )}
      {error && bedInput !== '' && <p role="alert">{error}</p>}
      {!error && <p>Since you went to bed at {formatClockTime(bedAt)}:</p>}

      <ul className="night-check-in">
        {activities.map((a) => {
          const log = day.logs[a.type];
          if (!log) return null;
          if (log.kind === 'timer') {
            const sessions = error ? 0 : nightSessionCount(log, bedAt, now);
            return <li key={a.type}>{a.label}: {sessions} sessions overnight</li>;
          }
          const times = error ? [] : nightEntryTimes(log, bedAt, now);
          return (
            <li key={a.type} className="night-check-in__row">
              <span>{a.label}</span>
              <span>{times.length === 0 ? 'nothing logged' : `you logged ${times.length} (${times.map(formatClockTime).join(', ')})`}</span>
              <button type="button" aria-label={`Fewer ${a.label}`} onClick={() => adjust(a.type, -1)}>−</button>
              <span data-testid={`night-count-${a.type}`}>{targets[a.type] ?? 0}</span>
              <button type="button" aria-label={`More ${a.label}`} onClick={() => adjust(a.type, 1)}>+</button>
            </li>
          );
        })}
      </ul>

      <button type="button" disabled={error !== null} onClick={() => onConfirm(bedAt, targets)}>
        Looks right — start the day
      </button>
      <button type="button" onClick={onCancel}>
        Not yet
      </button>
    </Dialog>
  );
}
