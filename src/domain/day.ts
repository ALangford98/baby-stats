import type { ActivityLog, ActivityType, Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';

export function createEmptyDay(startedAt: string): Day {
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const activity of ACTIVITIES) {
    logs[activity.type] =
      activity.kind === 'counter'
        ? { kind: 'counter', type: activity.type, count: 0 }
        : { kind: 'timer', type: activity.type, sessions: [] };
  }
  return {
    date: startedAt.slice(0, 10),
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
    return { ...log, sessions };
  });
}

export function endDay(day: Day, now: string): Day {
  let result = day;
  for (const activity of ACTIVITIES) {
    if (activity.kind === 'timer' && isTimerRunning(result, activity.type)) {
      result = toggleTimer(result, activity.type, now);
    }
  }
  return { ...result, endedAt: now };
}
