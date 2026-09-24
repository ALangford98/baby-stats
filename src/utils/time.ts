export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Running total for a timer tile: session count, then total time — `3X - 01H:25M`. */
export function formatTimerTotal(sessionCount: number, totalMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(totalMs / 60_000));
  return `${sessionCount}X - ${pad(Math.floor(totalMinutes / 60))}H:${pad(totalMinutes % 60)}M`;
}

// `<input type="datetime-local">` speaks local wall-clock time, while every
// timestamp we store is an ISO (UTC) string. Slicing the ISO string shows the
// UTC wall-clock but `new Date(value)` parses it back as local, so displaying
// and re-parsing had to go through the same local-time lens to stay lossless.

/** ISO timestamp -> `YYYY-MM-DDTHH:mm` in the viewer's local time. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` in local time -> ISO timestamp. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

/** Local calendar date (`YYYY-MM-DD`) an ISO timestamp falls on. */
export function toLocalDateString(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
