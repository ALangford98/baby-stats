import type { ActivityType, CounterEntry, CounterLog, Day, TimerLog } from '../types';

export type NightTargets = Record<ActivityType, number>;

export function goToBed(day: Day, at: string): Day {
  return { ...day, bedAt: at };
}

export function cancelBed(day: Day): Day {
  return { ...day, bedAt: null };
}

function within(at: string, from: string, to: string): boolean {
  const ms = Date.parse(at);
  return ms >= Date.parse(from) && ms <= Date.parse(to);
}

/** Exact entry times logged during the night window, oldest first. */
export function nightEntryTimes(log: CounterLog, bedAt: string, wakeAt: string): string[] {
  return log.entries
    .flatMap((e) => (e.kind === 'exact' && within(e.at, bedAt, wakeAt) ? [e.at] : []))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}

export function nightSessionCount(log: TimerLog, bedAt: string, wakeAt: string): number {
  return log.sessions.filter((s) => within(s.start, bedAt, wakeAt)).length;
}

/**
 * Best guess for "when did you go to bed?" when Gone to Bed was never
 * tapped: the latest thing logged by 11pm on the day's date, else 10pm —
 * never before the day started. It leans early on purpose: a 3am diaper
 * tap must not be mistaken for bedtime, or the earlier night taps would
 * vanish from the check-in and get logged a second time.
 */
export function defaultBedtime(day: Day, now: string): string {
  const [y, m, d] = day.date.split('-').map(Number);
  const startMs = Date.parse(day.startedAt);
  const limit = Math.min(new Date(y, m - 1, d, 23, 0).getTime(), Date.parse(now));
  let latest = -Infinity;
  for (const log of Object.values(day.logs)) {
    const times =
      log.kind === 'counter'
        ? log.entries.flatMap((e) => (e.kind === 'exact' ? [e.at] : []))
        : log.sessions.flatMap((s) => (s.end ? [s.start, s.end] : [s.start]));
    for (const at of times) {
      const ms = Date.parse(at);
      if (ms <= limit && ms > latest) latest = ms;
    }
  }
  const guess = latest > -Infinity ? latest : new Date(y, m - 1, d, 22, 0).getTime();
  return new Date(Math.min(Math.max(guess, startMs), Date.parse(now))).toISOString();
}

export function validateBedtime(bedAt: string, day: Day, now: string): string | null {
  const ms = Date.parse(bedAt);
  if (Number.isNaN(ms)) return 'Enter a bedtime.';
  if (ms > Date.parse(now)) return "Bedtime can't be in the future.";
  if (ms < Date.parse(day.startedAt)) return "Bedtime can't be before the day started.";
  return null;
}

/**
 * Applies the parent's confirmed night totals. For each counter, with n =
 * exact taps logged overnight: a higher target adds "sometime overnight"
 * entries, and a lower one removes the most recent night taps (the likely
 * 3am double-log). Daytime and untimed entries are never touched.
 */
export function applyNightCheckIn(day: Day, bedAt: string, wakeAt: string, targets: NightTargets): Day {
  const logs = { ...day.logs };
  for (const [type, target] of Object.entries(targets)) {
    const log = logs[type];
    if (!log || log.kind !== 'counter') continue;
    const night = log.entries
      .map((entry, index) => ({ entry, index }))
      .filter((x): x is { entry: Extract<CounterEntry, { kind: 'exact' }>; index: number } =>
        x.entry.kind === 'exact' && within(x.entry.at, bedAt, wakeAt),
      )
      .sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at));
    const wanted = Math.max(0, Math.floor(target));
    let entries = log.entries;
    if (wanted > night.length) {
      const extra = Array.from({ length: wanted - night.length }, (): CounterEntry => ({ kind: 'overnight', from: bedAt, to: wakeAt }));
      entries = [...entries, ...extra];
    } else if (wanted < night.length) {
      const drop = new Set(night.slice(wanted).map((x) => x.index));
      entries = entries.filter((_, i) => !drop.has(i));
    }
    logs[type] = { ...log, count: entries.length, entries };
  }
  return { ...day, logs, bedAt };
}
