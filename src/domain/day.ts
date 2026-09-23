import type { ActivityLog, ActivityType, Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';
import { toLocalDateString } from '../utils/time';

export function createEmptyDay(startedAt: string): Day {
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const activity of ACTIVITIES) {
    logs[activity.type] =
      activity.kind === 'counter'
        ? { kind: 'counter', type: activity.type, count: 0 }
        : { kind: 'timer', type: activity.type, sessions: [] };
  }
  return {
    // The local calendar date the day was started on — slicing the ISO string
    // would give the UTC date, mislabelling days started near midnight.
    date: toLocalDateString(startedAt),
    startedAt,
    endedAt: null,
    logs,
    report: null,
    reportSource: null,
  };
}

function updateLog(day: Day, type: ActivityType, update: (log: ActivityLog) => ActivityLog): Day {
  return { ...day, logs: { ...day.logs, [type]: update(day.logs[type]) } };
}

export function incrementCounter(day: Day, type: ActivityType): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count: log.count + 1 };
  });
}

export function setCounterCount(day: Day, type: ActivityType, count: number): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count };
  });
}

export function isSessionRunning(log: TimerLog): boolean {
  const last = log.sessions[log.sessions.length - 1];
  return last !== undefined && last.end === null;
}

export function isTimerRunning(day: Day, type: ActivityType): boolean {
  const log = day.logs[type];
  return log.kind === 'timer' && isSessionRunning(log);
}

export function toggleTimer(day: Day, type: ActivityType, now: string): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'timer') throw new Error(`${type} is not a timer activity`);
    const last = log.sessions[log.sessions.length - 1];
    if (last && last.end === null) {
      const sessions = [...log.sessions];
      sessions[sessions.length - 1] = { ...last, end: now };
      return { ...log, sessions };
    }
    return { ...log, sessions: [...log.sessions, { start: now, end: null }] };
  });
}

export function setTimerSessions(day: Day, type: ActivityType, sessions: TimerSession[]): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'timer') throw new Error(`${type} is not a timer activity`);
    return { ...log, sessions: [...sessions] };
  });
}

// `isTimerRunning` only looks at the most recent session, which is the right
// question for the button's active/pulsing state. Ending the day is a different
// question: sessions can be reopened out of order through the edit modal, so
// every open session has to be swept, not just the last one — an earlier one
// left open would otherwise keep accruing duration forever.
export function endDay(day: Day, now: string): Day {
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const type of Object.keys(day.logs) as ActivityType[]) {
    const log = day.logs[type];
    logs[type] =
      log.kind === 'timer'
        ? { ...log, sessions: log.sessions.map((s) => (s.end === null ? { ...s, end: now } : s)) }
        : log;
  }
  return { ...day, logs, endedAt: now };
}
