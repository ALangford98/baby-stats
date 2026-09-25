import { describe, expect, it } from 'vitest';
import { formatClockTime, formatDurationShort, formatElapsed, formatTimerTotal, fromLocalInputValue, toLocalDateString, toLocalInputValue } from './time';

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

describe('formatTimerTotal', () => {
  it('formats count, padded hours and padded minutes', () => {
    expect(formatTimerTotal(3, (60 + 25) * 60_000 + 59_000)).toBe('3X - 01H:25M');
  });

  it('shows zeros before any session has been recorded', () => {
    expect(formatTimerTotal(0, 0)).toBe('0X - 00H:00M');
  });

  it('keeps counting hours past 99 rather than wrapping', () => {
    expect(formatTimerTotal(1, 100 * 3_600_000)).toBe('1X - 100H:00M');
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

describe('formatDurationShort', () => {
  it('uses minutes under an hour and h+m above', () => {
    expect(formatDurationShort(45 * 60_000)).toBe('45m');
    expect(formatDurationShort((3 * 60 + 10) * 60_000)).toBe('3h 10m');
    expect(formatDurationShort(2 * 3_600_000)).toBe('2h');
  });
});

describe('formatClockTime', () => {
  it('formats a local clock time with minutes', () => {
    const at = new Date(2026, 8, 24, 14, 5).getTime();
    expect(formatClockTime(at)).toBe(new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  });
});
