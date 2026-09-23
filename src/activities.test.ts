import { describe, expect, it } from 'vitest';
import { ACTIVITIES, combineActivities, ICON_OPTIONS } from './activities';
import type { ActivityConfig, ActivityType } from './types';

describe('ACTIVITIES', () => {
  it('covers exactly the seven expected activity types, each once', () => {
    const expected: ActivityType[] = [
      'lightDiaper',
      'mediumDiaper',
      'heavyDiaper',
      'spitUp',
      'nap',
      'tummyTime',
      'cryingFit',
    ];
    expect(ACTIVITIES.map((a) => a.type).sort()).toEqual([...expected].sort());
  });

  it('marks diapers and spit up as counters, and nap/tummyTime/cryingFit as timers', () => {
    const kindOf = (t: ActivityType) => ACTIVITIES.find((a) => a.type === t)?.kind;
    expect(kindOf('lightDiaper')).toBe('counter');
    expect(kindOf('mediumDiaper')).toBe('counter');
    expect(kindOf('heavyDiaper')).toBe('counter');
    expect(kindOf('spitUp')).toBe('counter');
    expect(kindOf('nap')).toBe('timer');
    expect(kindOf('tummyTime')).toBe('timer');
    expect(kindOf('cryingFit')).toBe('timer');
  });
});

describe('combineActivities', () => {
  it('returns the built-ins unchanged when there are no custom activities', () => {
    expect(combineActivities([])).toEqual(ACTIVITIES);
  });

  it('appends custom activities after the built-ins', () => {
    const custom: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
    const result = combineActivities([custom]);
    expect(result).toHaveLength(ACTIVITIES.length + 1);
    expect(result[result.length - 1]).toEqual(custom);
  });
});

describe('ICON_OPTIONS', () => {
  it('is a non-empty list of distinct icon names, disjoint from what built-ins already use', () => {
    expect(ICON_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(ICON_OPTIONS).size).toBe(ICON_OPTIONS.length);
    const builtInIcons = new Set(ACTIVITIES.map((a) => a.icon));
    for (const icon of ICON_OPTIONS) {
      expect(builtInIcons.has(icon)).toBe(false);
    }
  });
});
