import { describe, expect, it } from 'vitest';
import { computeInsights } from './insights';
import { createEmptyDay, setCounterEntries } from './day';
import { ACTIVITIES } from '../activities';
import type { CounterEntry, Day } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = at(24, 16);
const MIN = 60_000;

function dayWith(d: number, feeds: number[], poops: number[], extraPoops: CounterEntry[] = []): Day {
  let day = createEmptyDay(iso(at(d, 6)), ACTIVITIES);
  day = setCounterEntries(day, 'feeding', feeds.map((ms) => ({ kind: 'exact', at: iso(ms) })));
  day = setCounterEntries(day, 'heavyDiaper', [...poops.map((ms): CounterEntry => ({ kind: 'exact', at: iso(ms) })), ...extraPoops]);
  return day;
}

/** 6 days, feeds at 8 & 12, a poop 45 min after each feed. */
function steadyDays(): Day[] {
  return [18, 19, 20, 21, 22, 23].map((d) =>
    dayWith(d, [at(d, 8), at(d, 12)], [at(d, 8, 45), at(d, 12, 45)]),
  );
}

describe('computeInsights', () => {
  it('reports "not enough data" everywhere for a brand-new user, without NaN', () => {
    const insights = computeInsights([createEmptyDay(iso(at(24, 6)), ACTIVITIES)], iso(NOW));
    expect(insights.poop.last).toBeNull();
    expect(insights.poop.gap).toEqual({ status: 'insufficient', have: 0, need: 5 });
    expect(insights.poop.afterFeed).toEqual({ status: 'insufficient', have: 0, need: 5 });
    expect(insights.poop.hotspots).toEqual({ status: 'insufficient', have: 0, need: 10 });
    expect(insights.poop.nextByGap).toBeNull();
  });

  it('C: steady 45-minute feed→poop delays give a 45-minute typical delay', () => {
    const { afterFeed } = computeInsights(steadyDays(), iso(NOW)).poop;
    expect(afterFeed).toEqual({ status: 'ok', p25: 45 * MIN, median: 45 * MIN, p75: 45 * MIN, samples: 12 });
  });

  it('C: a feed pairs with only its first poop', () => {
    const days = [18, 19, 20, 21, 22].map((d) => dayWith(d, [at(d, 8)], [at(d, 8, 30), at(d, 9, 30)]));
    const { afterFeed } = computeInsights(days, iso(NOW)).poop;
    expect(afterFeed).toMatchObject({ status: 'ok', samples: 5, median: 30 * MIN });
  });

  it('B: gaps over 12h (nights) are ignored', () => {
    const { gap, last, nextByGap } = computeInsights(steadyDays(), iso(NOW)).poop;
    // Within-day gaps are 4h; the overnight gaps (20h) are dropped.
    expect(gap).toMatchObject({ status: 'ok', median: 4 * 60 * MIN, samples: 6 });
    expect(last).toEqual({ at: at(23, 12, 45), agoMs: NOW - at(23, 12, 45) });
    expect(nextByGap).toBe(at(23, 16, 45));
  });

  it('overnight entries count toward hotspots but not gaps or delays', () => {
    const overnight: CounterEntry = { kind: 'overnight', from: iso(at(23, 22)), to: iso(at(24, 2)) };
    const days = [dayWith(23, [], [], Array(10).fill(overnight))];
    const insights = computeInsights(days, iso(NOW));
    expect(insights.poop.gap).toMatchObject({ status: 'insufficient', have: 0 });
    expect(insights.poop.hotspots).toMatchObject({ status: 'ok', total: 10 });
    const buckets = (insights.poop.hotspots as { buckets: number[] }).buckets;
    expect(buckets[22] + buckets[23] + buckets[0] + buckets[1]).toBeCloseTo(10);
  });

  it('E: finds the two busiest non-overlapping 2-hour spans', () => {
    const { hotspots } = computeInsights(steadyDays(), iso(NOW)).poop;
    expect(hotspots).toMatchObject({ status: 'ok', total: 12 });
    const starts = (hotspots as { busiest: { startHour: number }[] }).busiest.map((b) => b.startHour).sort((a, b) => a - b);
    // Poops at 8:45 and 12:45 → spans starting at 7 or 8, and 11 or 12.
    expect(starts[0] === 7 || starts[0] === 8).toBe(true);
    expect(starts[1] === 11 || starts[1] === 12).toBe(true);
  });

  it('D: lists yesterday\'s events within an hour of the current clock time', () => {
    const days = [dayWith(23, [at(23, 15, 30)], [at(23, 16, 20), at(23, 18)])];
    const { poop, feed } = computeInsights(days, iso(NOW));
    expect(poop.yesterday).toEqual([at(23, 16, 20)]);
    expect(feed.yesterday).toEqual([at(23, 15, 30)]);
  });

  it('ignores events older than 14 days and events in the future', () => {
    const days = [dayWith(5, [], [at(5, 9)]), dayWith(24, [], [at(24, 20)])];
    expect(computeInsights(days, iso(NOW)).poop.last).toBeNull();
  });

  it('ignores untimed entries for timing but never crashes on them', () => {
    const days = [dayWith(23, [], [], [{ kind: 'untimed' }])];
    expect(computeInsights(days, iso(NOW)).poop.hotspots).toMatchObject({ status: 'insufficient', have: 0 });
  });
});
