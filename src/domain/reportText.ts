import type { Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';

export const STYLE_INSTRUCTION =
  "Write a short, funny, affectionate 3-5 sentence summary of this baby's day using the stats below. Keep it lighthearted, not clinical.";

function sessionDurationMs(session: TimerSession, now: string): number {
  const end = session.end ?? now;
  return new Date(end).getTime() - new Date(session.start).getTime();
}

function totalTimerMs(log: TimerLog, now: string): number {
  return log.sessions.reduce((sum, s) => sum + sessionDurationMs(s, now), 0);
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function buildStatsSummary(day: Day): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = ACTIVITIES.map((activity) => {
    const log = day.logs[activity.type];
    if (log.kind === 'counter') {
      return `${activity.label}: ${log.count}`;
    }
    const totalMs = totalTimerMs(log, now);
    return `${activity.label}: ${log.sessions.length} session(s), ${formatDuration(totalMs)} total`;
  });
  return lines.join('\n');
}

export function buildPromptText(day: Day): string {
  return `${STYLE_INSTRUCTION}\n\n${buildStatsSummary(day)}`;
}

function bucketIndex(value: number, thresholds: number[]): number {
  let idx = 0;
  for (const t of thresholds) {
    if (value >= t) idx++;
  }
  return idx;
}

type CounterActivityType = 'lightDiaper' | 'mediumDiaper' | 'heavyDiaper' | 'spitUp';
type TimerActivityType = 'nap' | 'tummyTime' | 'cryingFit';

const COUNTER_TEMPLATES: Record<CounterActivityType, string[]> = {
  lightDiaper: [
    'Not a single light diaper today\n- skipped the easy ones entirely.',
    'A couple of light diapers\n- nice and breezy.',
    'Several light diapers today\n- a steady drizzle.',
    '6+ light diapers\n- basically a subscription service at this point.',
  ],
  mediumDiaper: [
    'Zero medium diapers\n- living the dream.',
    'A light rotation of medium diapers today.',
    'A solid handful of medium diapers\n- business as usual.',
    '6+ medium diapers\n- the diaper genie earned its keep.',
  ],
  heavyDiaper: [
    'No heavy diapers today\n- count your blessings.',
    'A couple of heavy diapers snuck in there.',
    'Several heavy diapers\n- bring out the good wipes.',
    '6+ heavy diapers\n- someone should get hazard pay.',
  ],
  spitUp: [
    'No spit up today\n- the shirt survives another day.',
    'A little spit up here and there\n- cosmetic damage only.',
    'A fair amount of spit up\n- you\'ve basically got a second job.',
    '6+ spit ups\n- you may want to invest in a poncho.',
  ],
};

const TIMER_TEMPLATES: Record<TimerActivityType, string[]> = {
  nap: [
    'No naps today\n- everyone is running on fumes.',
    'A short nap snuck in there\n- better than nothing.',
    'A solid chunk of nap time today\n- a small miracle.',
    '90+ minutes of napping\n- truly professional-grade sleeping.',
  ],
  tummyTime: [
    'No tummy time today\n- the floor stayed lonely.',
    'A quick bit of tummy time\n- baby tolerated it, barely.',
    'A good stretch of tummy time\n- those neck muscles are working.',
    '90+ minutes of tummy time\n- basically training for a marathon.',
  ],
  cryingFit: [
    'No crying fits today\n- is this baby broken? (Kidding. Great job.)',
    'A brief crying fit\n- a small storm, quickly passed.',
    'A fair bit of crying today\n- everyone needed a hug after.',
    '90+ minutes of crying\n- you deserve a medal and a nap of your own.',
  ],
};

export function generateOfflineReport(day: Day): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = ACTIVITIES.map((activity) => {
    const log = day.logs[activity.type];
    if (log.kind === 'counter') {
      const idx = bucketIndex(log.count, [1, 3, 6]);
      return COUNTER_TEMPLATES[activity.type as CounterActivityType][idx];
    }
    const totalMinutes = totalTimerMs(log, now) / 60000;
    const idx = bucketIndex(totalMinutes, [1, 30, 90]);
    return TIMER_TEMPLATES[activity.type as TimerActivityType][idx];
  });
  return ["Here's how today went:", ...lines].join('\n\n');
}
