import { describe, expect, it } from 'vitest';
import { buildPromptText, buildStatsSummary, generateOfflineReport, STYLE_INSTRUCTION } from './reportText';
import { createEmptyDay } from './day';
import { incrementCounter, setTimerSessions } from './day';

const START = '2026-09-23T08:00:00.000Z';

function sampleDay() {
  let day = createEmptyDay(START);
  day = incrementCounter(day, 'lightDiaper');
  day = incrementCounter(day, 'lightDiaper');
  day = incrementCounter(day, 'heavyDiaper');
  day = setTimerSessions(day, 'nap', [
    { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T10:30:00.000Z' },
  ]);
  day = { ...day, endedAt: '2026-09-23T20:00:00.000Z' };
  return day;
}

describe('buildStatsSummary', () => {
  it('includes a line per activity with counts or session totals', () => {
    const summary = buildStatsSummary(sampleDay());
    expect(summary).toContain('Light Diaper: 2');
    expect(summary).toContain('Heavy Diaper: 1');
    expect(summary).toContain('Medium Diaper: 0');
    expect(summary).toContain('Nap: 1 session(s), 1h 30m total');
    expect(summary).toContain('Tummy Time: 0 session(s), 0m total');
  });

  it('does not throw and reports zeros for a completely empty day', () => {
    const day = createEmptyDay(START);
    expect(() => buildStatsSummary(day)).not.toThrow();
    expect(buildStatsSummary(day)).toContain('Nap: 0 session(s), 0m total');
  });
});

describe('buildPromptText', () => {
  it('combines the style instruction with the stats summary', () => {
    const text = buildPromptText(sampleDay());
    expect(text).toContain(STYLE_INSTRUCTION);
    expect(text).toContain(buildStatsSummary(sampleDay()));
  });
});

describe('generateOfflineReport', () => {
  it('produces non-empty text for a fully populated day', () => {
    const report = generateOfflineReport(sampleDay());
    expect(report.length).toBeGreaterThan(0);
  });

  it('does not throw for a completely empty day and still returns text', () => {
    const day = createEmptyDay(START);
    expect(() => generateOfflineReport(day)).not.toThrow();
    expect(generateOfflineReport(day).length).toBeGreaterThan(0);
  });

  it('picks a different line as a counter crosses bucket thresholds', () => {
    let day = createEmptyDay(START);
    const zero = generateOfflineReport(day);
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    const four = generateOfflineReport(day);
    expect(four).not.toBe(zero);
  });
});
