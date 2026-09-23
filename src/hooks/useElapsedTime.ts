import { useEffect, useState } from 'react';

export function useElapsedTime(startIso: string | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startIso) {
      setElapsed(0);
      return;
    }
    const start = new Date(startIso).getTime();
    setElapsed(Date.now() - start);
    const interval = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(interval);
  }, [startIso]);

  return elapsed;
}
