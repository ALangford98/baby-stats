import { useCallback, useState } from 'react';
import type { Day } from '../types';
import { loadHistory, saveHistory } from '../storage/localStorage';

export function useHistory() {
  const [history, setHistoryState] = useState<Day[]>(() => loadHistory());

  const replaceHistory = useCallback((next: Day[]) => {
    setHistoryState(next);
    saveHistory(next);
  }, []);

  const addToHistory = useCallback(
    (day: Day) => {
      setHistoryState((prev) => {
        const next = [day, ...prev];
        saveHistory(next);
        return next;
      });
    },
    [],
  );

  const removeFromHistory = useCallback((startedAt: string) => {
    setHistoryState((prev) => {
      const next = prev.filter((day) => day.startedAt !== startedAt);
      saveHistory(next);
      return next;
    });
  }, []);

  return { history, addToHistory, replaceHistory, removeFromHistory };
}
