import { describe, expect, it } from 'vitest';
import { formatElapsed, fromLocalInputValue, toLocalDateString, toLocalInputValue } from './time';

describe('formatElapsed', () => {
  it('formats sub-minute durations as 0:ss', () => {
    expect(formatElapsed(5000)).toBe('0:05');
  });

  it('formats multi-minute durations as m:ss', () => {
    expect(formatElapsed(65000)).toBe('1:05');
  });

  it('pads seconds under 10', () => {
    expect(formatElapsed(3 * 60_000 + 2000)).toBe('3:02');
  });
});

describe('datetime-local conversion', () => {
  // The round trip is what matters: a value shown in the input and then read
  // back out must land on the same instant. Slicing the ISO string displayed
  // UTC but `new Date(value)` parsed local, so any edit shifted the timestamp
  // by the local UTC offset. Both directions now use local time, so this holds
  // in any timezone the test runner happens to use.
  it('round-trips an ISO timestamp through the input representation', () => {
    const iso = '2026-09-23T08:00:00.000Z';
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
  });

  it('round-trips a timestamp that falls on a different UTC date than local', () => {
    const iso = '2026-09-23T23:30:00.000Z';
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
  });

  it('formats the input value as local wall-clock, not UTC', () => {
    const iso = '2026-09-23T08:00:00.000Z';
    const d = new Date(iso);
    expect(toLocalInputValue(iso)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    );
  });
});

describe('toLocalDateString', () => {
  it('uses the local calendar date, not the UTC one', () => {
    const iso = '2026-09-23T23:30:00.000Z';
    const d = new Date(iso);
    expect(toLocalDateString(iso)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  });

  it('agrees with the ISO prefix when local time is UTC-equivalent for that instant', () => {
    const iso = '2026-09-23T12:00:00.000Z';
    const d = new Date(iso);
    if (d.getUTCDate() === d.getDate()) {
      expect(toLocalDateString(iso)).toBe('2026-09-23');
    }
    expect(toLocalDateString(iso)).toHaveLength(10);
  });
});
