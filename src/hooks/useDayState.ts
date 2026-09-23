import { useCallback, useState } from 'react';
import type { ActivityType, Day, TimerSession } from '../types';
import {
  createEmptyDay,
  endDay,
  incrementCounter as incrementCounterDomain,
  setCounterCount as setCounterCountDomain,
  setTimerSessions as setTimerSessionsDomain,
  toggleTimer as toggleTimerDomain,
} from '../domain/day';
import { loadCurrentDay, saveCurrentDay } from '../storage/localStorage';

export function useDayState() {
  const [day, setDayState] = useState<Day | null>(() => loadCurrentDay());

  const persist = useCallback((next: Day | null) => {
    setDayState(next);
    saveCurrentDay(next);
  }, []);

  const startDay = useCallback((startedAt: string) => persist(createEmptyDay(startedAt)), [persist]);

  const incrementCounter = useCallback(
    (type: ActivityType) => {
      if (!day) return;
      persist(incrementCounterDomain(day, type));
    },
    [day, persist],
  );

  const setCounterCount = useCallback(
    (type: ActivityType, count: number) => {
      if (!day) return;
      persist(setCounterCountDomain(day, type, count));
    },
    [day, persist],
  );

  const toggleTimer = useCallback(
    (type: ActivityType) => {
      if (!day) return;
      persist(toggleTimerDomain(day, type, new Date().toISOString()));
    },
    [day, persist],
  );

  const setTimerSessions = useCallback(
    (type: ActivityType, sessions: TimerSession[]) => {
      if (!day) return;
      persist(setTimerSessionsDomain(day, type, sessions));
    },
    [day, persist],
  );

  const finishDay = useCallback((): Day => {
    if (!day) throw new Error('No active day to finish');
    const ended = endDay(day, new Date().toISOString());
    persist(ended);
    return ended;
  }, [day, persist]);

  const setDayReport = useCallback(
    (report: string, source: 'offline' | 'ai') => {
      if (!day) return;
      persist({ ...day, report, reportSource: source });
    },
    [day, persist],
  );

  const clearDay = useCallback(() => persist(null), [persist]);

  const replaceDay = useCallback((next: Day | null) => persist(next), [persist]);

  return {
    day,
    startDay,
    incrementCounter,
    setCounterCount,
    toggleTimer,
    setTimerSessions,
    finishDay,
    setDayReport,
    clearDay,
    replaceDay,
  };
}
