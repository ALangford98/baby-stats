import { describe, expect, it } from 'vitest';
import { applyNightCheckIn, cancelBed, defaultBedtime, goToBed, nightEntryTimes, nightSessionCount, validateBedtime } from './night';
import { createEmptyDay, incrementCounter, setCounterEntries, toggleTimer } from './day';
import { ACTIVITIES } from '../activities';
import type { CounterLog, TimerLog } from '../types';

const t = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString();
const START = t(23, 7);
const BED = t(23, 22, 30);
const WAKE = t(24, 6, 40);

function dayWithNightTaps() {
  let day = createEmptyDay(START, ACTIVITIES);
  day = incrementCounter(day, 'heavyDiaper', t(23, 15)); // daytime
  day = incrementCounter(day, 'heavyDiaper', t(24, 1, 10));
  day = incrementCounter(day, 'heavyDiaper', t(24, 3, 45));
  return goToBed(day, BED);
}

describe('bedtime', () => {
  it('goToBed/cancelBed set and clear bedAt', () => {
    const day = goToBed(createEmptyDay(START, ACTIVITIES), BED);
    expect(day.bedAt).toBe(BED);
    expect(cancelBed(day).bedAt).toBeNull();
  });

  it('defaultBedtime is the latest logged time before now, else 10pm on the day', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    expect(defaultBedtime(day, t(24, 7))).toBe(t(23, 22));
    day = incrementCounter(day, 'feeding', t(23, 21, 15));
    day = toggleTimer(day, 'nap', t(23, 20));
    expect(defaultBedtime(day, t(24, 7))).toBe(t(23, 21, 15));
  });

  it('rejects a bedtime in the future or before the day started', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(validateBedtime(t(24, 8), day, t(24, 7))).toMatch(/future/i);
    expect(validateBedtime(t(23, 6), day, t(24, 7))).toMatch(/before the day started/i);
    expect(validateBedtime(BED, day, t(24, 7))).toBeNull();
  });
});

describe('night entries', () => {
  it('lists only exact entries inside the night, in time order', () => {
    const day = dayWithNightTaps();
    expect(nightEntryTimes(day.logs.heavyDiaper as CounterLog, BED, WAKE)).toEqual([t(24, 1, 10), t(24, 3, 45)]);
  });

  it('counts timer sessions that started overnight', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = toggleTimer(day, 'nap', t(24, 2));
    day = toggleTimer(day, 'nap', t(24, 3));
    expect(nightSessionCount(day.logs.nap as TimerLog, BED, WAKE)).toBe(1);
  });
});

describe('applyNightCheckIn', () => {
  it('keeps logged taps when confirmed unchanged', () => {
    const day = applyNightCheckIn(dayWithNightTaps(), BED, WAKE, { heavyDiaper: 2 });
    expect(day.logs.heavyDiaper).toMatchObject({ count: 3 });
  });

  it('adds overnight entries for anything beyond what was tapped', () => {
    const day = applyNightCheckIn(dayWithNightTaps(), BED, WAKE, { heavyDiaper: 3, feeding: 2 });
    const diapers = day.logs.heavyDiaper as CounterLog;
    expect(diapers.count).toBe(4);
    expect(diapers.entries.at(-1)).toEqual({ kind: 'overnight', from: BED, to: WAKE });
    expect((day.logs.feeding as CounterLog).entries).toEqual([
      { kind: 'overnight', from: BED, to: WAKE },
      { kind: 'overnight', from: BED, to: WAKE },
    ]);
  });

  it('removes the most recent night taps when the total is lowered (double-logging)', () => {
    const day = applyNightCheckIn(dayWithNightTaps(), BED, WAKE, { heavyDiaper: 1 });
    const diapers = day.logs.heavyDiaper as CounterLog;
    expect(diapers.count).toBe(2);
    expect(diapers.entries).toEqual([{ kind: 'exact', at: t(23, 15) }, { kind: 'exact', at: t(24, 1, 10) }]);
  });

  it('sets bedAt when bed was never tapped (forgot case)', () => {
    const day = applyNightCheckIn(createEmptyDay(START, ACTIVITIES), BED, WAKE, {});
    expect(day.bedAt).toBe(BED);
  });

  it('never touches daytime or untimed entries', () => {
    let day = setCounterEntries(createEmptyDay(START, ACTIVITIES), 'feeding', [{ kind: 'untimed' }, { kind: 'exact', at: t(23, 12) }]);
    day = applyNightCheckIn(day, BED, WAKE, { feeding: 0 });
    expect((day.logs.feeding as CounterLog).entries).toEqual([{ kind: 'untimed' }, { kind: 'exact', at: t(23, 12) }]);
  });
});
