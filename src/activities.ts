import type { ActivityType } from './types';

export type ActivityKind = 'counter' | 'timer';

export type ActivityConfig = {
  type: ActivityType;
  label: string;
  kind: ActivityKind;
  icon: 'Droplet' | 'Droplets' | 'CloudRain' | 'Waves' | 'Moon' | 'Baby' | 'AlertTriangle';
};

export const ACTIVITIES: ActivityConfig[] = [
  { type: 'lightDiaper', label: 'Light Diaper', kind: 'counter', icon: 'Droplet' },
  { type: 'mediumDiaper', label: 'Medium Diaper', kind: 'counter', icon: 'Droplets' },
  { type: 'heavyDiaper', label: 'Heavy Diaper', kind: 'counter', icon: 'CloudRain' },
  { type: 'spitUp', label: 'Spit Up', kind: 'counter', icon: 'Waves' },
  { type: 'nap', label: 'Nap', kind: 'timer', icon: 'Moon' },
  { type: 'tummyTime', label: 'Tummy Time', kind: 'timer', icon: 'Baby' },
  { type: 'cryingFit', label: 'Crying Fit', kind: 'timer', icon: 'AlertTriangle' },
];
