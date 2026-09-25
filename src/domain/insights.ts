import type { Day } from '../types';
import { toLocalDateString } from '../utils/time';

export const PATTERN_GROUPS = {
  poop: ['lightDiaper', 'mediumDiaper', 'heavyDiaper'],
  feed: ['feeding'],
} as const;

type GroupName = keyof typeof PATTERN_GROUPS;

const HOUR = 3_600_000;
export const LOOKBACK_MS = 14 * 24 * HOUR;
export const MIN_GAPS = 5;
export const MIN_PAIRS = 5;
export const MIN_HOTSPOT_EVENTS = 10;
const MAX_GAP_MS = 12 * HOUR;
const MAX_FEED_TO_POOP_MS = 4 * HOUR;
const YESTERDAY_WINDOW_MS = HOUR;

export type Insufficient = { status: 'insufficient'; have: number; need: number };
export type RangeStat = { status: 'ok'; p25: number; median: number; p75: number; samples: number };
export type LastEvent = { at: number; agoMs: number } | null;
export type Hotspots =
  | { status: 'ok'; buckets: number[]; total: number; busiest: { startHour: number; weight: number }[] }
  | Insufficient;
export type GroupInsights = {
  last: LastEvent;
  gap: RangeStat | Insufficient;
  nextByGap: number | null;
  yesterday: number[];
  hotspots: Hotspots;
};
export type Insights = { now: number; poop: GroupInsights & { afterFeed: RangeStat | Insufficient }; feed: GroupInsights };

type Events = { exact: number[]; overnight: { from: number; to: number }[] };

function collect(days: Day[], group: GroupName, now: number): Events {
  const types = PATTERN_GROUPS[group] as readonly string[];
  const cutoff = now - LOOKBACK_MS;
  const exact: number[] = [];
  const overnight: { from: number; to: number }[] = [];
  for (const day of days) {
    for (const type of types) {
      const log = day.logs[type];
      if (!log || log.kind !== 'counter') continue;
      for (const entry of log.entries) {
        if (entry.kind === 'exact') {
          const ms = Date.parse(entry.at);
          if (ms >= cutoff && ms <= now) exact.push(ms);
        } else if (entry.kind === 'overnight') {
          const from = Date.parse(entry.from);
          const to = Date.parse(entry.to);
          if (to >= cutoff && from <= now && to > from) overnight.push({ from, to });
        }
      }
    }
  }
  exact.sort((a, b) => a - b);
  return { exact, overnight };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function rangeOf(values: number[], need: number): RangeStat | Insufficient {
  if (values.length < need) return { status: 'insufficient', have: values.length, need };
  const sorted = [...values].sort((a, b) => a - b);
  return { status: 'ok', p25: percentile(sorted, 0.25), median: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), samples: sorted.length };
}

function gaps(exact: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < exact.length; i++) {
    const gap = exact[i] - exact[i - 1];
    if (gap > 0 && gap <= MAX_GAP_MS) out.push(gap);
  }
  return out;
}

/** Each poop pairs with the latest feed before it (within 4h); a feed pairs at most once. */
function feedToPoopDelays(poops: number[], feeds: number[]): number[] {
  const used = new Set<number>();
  const delays: number[] = [];
  for (const poop of poops) {
    let best = -1;
    for (let i = 0; i < feeds.length && feeds[i] <= poop; i++) best = i;
    if (best < 0 || used.has(best)) continue;
    const delay = poop - feeds[best];
    if (delay > 0 && delay <= MAX_FEED_TO_POOP_MS) {
      used.add(best);
      delays.push(delay);
    }
  }
  return delays;
}

function yesterdayAround(exact: number[], now: number): number[] {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const target = y.getTime();
  const date = toLocalDateString(y.toISOString());
  return exact.filter((ms) => Math.abs(ms - target) <= YESTERDAY_WINDOW_MS && toLocalDateString(new Date(ms).toISOString()) === date);
}

function hotspots(events: Events): Hotspots {
  const total = events.exact.length + events.overnight.length;
  if (total < MIN_HOTSPOT_EVENTS) return { status: 'insufficient', have: total, need: MIN_HOTSPOT_EVENTS };
  const buckets = Array<number>(24).fill(0);
  for (const ms of events.exact) buckets[new Date(ms).getHours()] += 1;
  for (const { from, to } of events.overnight) {
    // Spread one event evenly over each local hour the window touches.
    const hours: number[] = [];
    const cursor = new Date(from);
    cursor.setMinutes(0, 0, 0);
    while (cursor.getTime() < to) {
      hours.push(cursor.getHours());
      cursor.setHours(cursor.getHours() + 1);
    }
    for (const h of hours) buckets[h] += 1 / hours.length;
  }
  const spans = buckets.map((_, h) => ({ startHour: h, weight: buckets[h] + buckets[(h + 1) % 24] }));
  spans.sort((a, b) => b.weight - a.weight);
  const busiest: { startHour: number; weight: number }[] = [];
  for (const span of spans) {
    const overlaps = busiest.some((b) => {
      const d = Math.abs(b.startHour - span.startHour);
      return Math.min(d, 24 - d) < 2;
    });
    if (!overlaps && span.weight > 0) busiest.push(span);
    if (busiest.length === 2) break;
  }
  return { status: 'ok', buckets, total, busiest };
}

function groupInsights(events: Events, now: number): GroupInsights {
  const lastAt = events.exact.at(-1);
  const last = lastAt === undefined ? null : { at: lastAt, agoMs: now - lastAt };
  const gap = rangeOf(gaps(events.exact), MIN_GAPS);
  return {
    last,
    gap,
    nextByGap: gap.status === 'ok' && last ? last.at + gap.median : null,
    yesterday: yesterdayAround(events.exact, now),
    hotspots: hotspots(events),
  };
}

export function computeInsights(days: Day[], nowIso: string): Insights {
  const now = Date.parse(nowIso);
  const poops = collect(days, 'poop', now);
  const feeds = collect(days, 'feed', now);
  return {
    now,
    poop: { ...groupInsights(poops, now), afterFeed: rangeOf(feedToPoopDelays(poops.exact, feeds.exact), MIN_PAIRS) },
    feed: groupInsights(feeds, now),
  };
}

export type Prediction =
  | { state: 'learning'; have: number; need: number }
  | { state: 'done'; poopAt: number; feedAt: number }
  | { state: 'upcoming' | 'now'; from: number; to: number; feedAt: number; p25: number; p75: number }
  | { state: 'gap'; at: number; median: number }
  | { state: 'none' };

export function predictNextPoop(insights: Insights): Prediction {
  const { poop, feed, now } = insights;
  if (poop.afterFeed.status === 'insufficient') return { state: 'learning', have: poop.afterFeed.have, need: poop.afterFeed.need };
  const lastFeed = feed.last;
  if (lastFeed && poop.last && poop.last.at >= lastFeed.at) return { state: 'done', poopAt: poop.last.at, feedAt: lastFeed.at };
  if (lastFeed) {
    const { p25, p75 } = poop.afterFeed;
    const from = lastFeed.at + p25;
    const to = lastFeed.at + p75;
    if (now < from) return { state: 'upcoming', from, to, feedAt: lastFeed.at, p25, p75 };
    if (now <= to) return { state: 'now', from, to, feedAt: lastFeed.at, p25, p75 };
  }
  if (poop.nextByGap !== null && poop.gap.status === 'ok') return { state: 'gap', at: poop.nextByGap, median: poop.gap.median };
  return { state: 'none' };
}
