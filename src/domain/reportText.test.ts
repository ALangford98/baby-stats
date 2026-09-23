import { describe, expect, it } from 'vitest';
import { buildPromptText, buildStatsSummary, generateOfflineReport, STYLE_INSTRUCTION } from './reportText';
import { createEmptyDay } from './day';
import { incrementCounter, setTimerSessions } from './day';
import { ACTIVITIES, combineActivities } from '../activities';
import type { ActivityConfig } from '../types';

const START = '2026-09-23T08:00:00.000Z';

function sampleDay() {
  let day = createEmptyDay(START, ACTIVITIES);
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
    const summary = buildStatsSummary(sampleDay(), ACTIVITIES);
    expect(summary).toContain('Light Diaper: 2');
    expect(summary).toContain('Heavy Diaper: 1');
    expect(summary).toContain('Medium Diaper: 0');
    expect(summary).toContain('Nap: 1 session(s), 1h 30m total');
    expect(summary).toContain('Tummy Time: 0 session(s), 0m total');
  });

  it('does not throw and reports zeros for a completely empty day', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(() => buildStatsSummary(day, ACTIVITIES)).not.toThrow();
    expect(buildStatsSummary(day, ACTIVITIES)).toContain('Nap: 0 session(s), 0m total');
  });
});

describe('buildPromptText', () => {
  it('combines the style instruction with the stats summary', () => {
    const text = buildPromptText(sampleDay(), ACTIVITIES);
    expect(text).toContain(STYLE_INSTRUCTION);
    expect(text).toContain(buildStatsSummary(sampleDay(), ACTIVITIES));
  });
});

describe('generateOfflineReport', () => {
  it('produces non-empty text for a fully populated day', () => {
    const report = generateOfflineReport(sampleDay(), ACTIVITIES);
    expect(report.length).toBeGreaterThan(0);
  });

  it('does not throw for a completely empty day and still returns text', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(() => generateOfflineReport(day, ACTIVITIES)).not.toThrow();
    expect(generateOfflineReport(day, ACTIVITIES).length).toBeGreaterThan(0);
  });

  it('never uses an em dash — newlines and regular dashes only', () => {
    const report = generateOfflineReport(sampleDay(), ACTIVITIES);
    expect(report).not.toContain('—');
  });

  it('picks a different line as a counter crosses bucket thresholds', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    const zero = generateOfflineReport(day, ACTIVITIES);
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    const four = generateOfflineReport(day, ACTIVITIES);
    expect(four).not.toBe(zero);
  });
});

describe('custom activities in reports', () => {
  const customCounter: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
  const customTimer: ActivityConfig = { type: 'custom-def67890', label: 'Screen time', kind: 'timer', icon: 'Star' };
  const activitiesWithCustom = combineActivities([customCounter, customTimer]);

  function dayWithCustomLogged() {
    let day = createEmptyDay(START, activitiesWithCustom);
    day = incrementCounter(day, 'custom-abc12345');
    day = incrementCounter(day, 'custom-abc12345');
    day = setTimerSessions(day, 'custom-def67890', [
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:20:00.000Z' },
    ]);
    day = { ...day, endedAt: '2026-09-23T20:00:00.000Z' };
    return day;
  }

  it('buildStatsSummary shows the custom activity label and count/duration', () => {
    const summary = buildStatsSummary(dayWithCustomLogged(), activitiesWithCustom);
    expect(summary).toContain('Tummy medicine: 2');
    expect(summary).toContain('Screen time: 1 session(s), 20m total');
  });

  it('generateOfflineReport includes a generic line for a custom counter and a custom timer', () => {
    const report = generateOfflineReport(dayWithCustomLogged(), activitiesWithCustom);
    expect(report).toMatch(/tummy medicine/i);
    expect(report).toMatch(/screen time/i);
  });

  it('a day that never had the custom activity added does not mention it at all', () => {
    // Built with the ORIGINAL activities list (no custom ones) — the log key
    // for the custom activity was never created on this day.
    const day = createEmptyDay(START, ACTIVITIES);
    const summary = buildStatsSummary(day, activitiesWithCustom);
    expect(summary).not.toContain('Tummy medicine');
  });

  it('falls back to the raw activity id as the label when the config is gone (e.g. deleted)', () => {
    const loggedDay = dayWithCustomLogged();
    // Simulate deletion: look the day up with only the built-ins, as if
    // `customActivities` in Settings no longer includes this one.
    const summary = buildStatsSummary(loggedDay, ACTIVITIES);
    expect(summary).toContain('custom-abc12345: 2');
    expect(() => generateOfflineReport(loggedDay, ACTIVITIES)).not.toThrow();
    expect(generateOfflineReport(loggedDay, ACTIVITIES)).toMatch(/custom-abc12345/);
  });

  it('omits a deleted custom activity that was never logged, instead of showing a zero-value line for its raw id', () => {
    // Added mid-day (so it has a log entry) but never tapped, then deleted —
    // the spec's own way to "rename" an activity is delete-and-re-add, so a
    // stray zero-count entry for the old raw id would otherwise show up on
    // every End Day right after.
    const day = createEmptyDay(START, activitiesWithCustom);
    const summary = buildStatsSummary(day, ACTIVITIES);
    const report = generateOfflineReport(day, ACTIVITIES);
    expect(summary).not.toContain('custom-abc12345');
    expect(summary).not.toContain('custom-def67890');
    expect(report).not.toMatch(/custom-abc12345/);
    expect(report).not.toMatch(/custom-def67890/);
  });

  // The label is free text the user typed — an apostrophe (or any other
  // character) must not break the generic template's string interpolation.
  it('handles a label containing an apostrophe without throwing or mangling the text', () => {
    const activityWithApostrophe: ActivityConfig = { type: 'custom-ghi11111', label: "Baby's medicine", kind: 'counter', icon: 'Pill' };
    const activitiesList = combineActivities([activityWithApostrophe]);
    let day = createEmptyDay(START, activitiesList);
    day = incrementCounter(day, 'custom-ghi11111');

    expect(() => buildStatsSummary(day, activitiesList)).not.toThrow();
    expect(buildStatsSummary(day, activitiesList)).toContain("Baby's medicine: 1");
    expect(() => generateOfflineReport(day, activitiesList)).not.toThrow();
    expect(generateOfflineReport(day, activitiesList)).toContain("Baby's medicine");
  });
});
