import type { ActivityConfig, ActivityType, IconName } from './types';

export type { ActivityConfig, ActivityKind } from './types';

export const ACTIVITIES: ActivityConfig[] = [
  { type: 'lightDiaper', label: 'Light Diaper', kind: 'counter', icon: 'Droplet' },
  { type: 'mediumDiaper', label: 'Medium Diaper', kind: 'counter', icon: 'Droplets' },
  { type: 'heavyDiaper', label: 'Heavy Diaper', kind: 'counter', icon: 'CloudRain' },
  { type: 'feeding', label: 'Feeding', kind: 'counter', icon: 'Milk' },
  { type: 'spitUp', label: 'Spit Up', kind: 'counter', icon: 'Waves' },
  { type: 'nap', label: 'Nap', kind: 'timer', icon: 'Moon' },
  { type: 'tummyTime', label: 'Tummy Time', kind: 'timer', icon: 'Baby' },
  { type: 'cryingFit', label: 'Crying Fit', kind: 'timer', icon: 'AlertTriangle' },
];

export const ICON_OPTIONS: IconName[] = [
  'Utensils',
  'Pill',
  'Bath',
  'Smile',
  'Heart',
  'Star',
  'Clock',
  'Thermometer',
  'Stethoscope',
  'BookOpen',
  'Music',
];

export function combineActivities(customActivities: ActivityConfig[], countOnlyTimers: ActivityType[] = []): ActivityConfig[] {
  return [...ACTIVITIES, ...customActivities].map((activity) =>
    activity.kind === 'timer' && countOnlyTimers.includes(activity.type) ? { ...activity, countOnly: true } : activity,
  );
}
