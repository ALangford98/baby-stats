import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from './activities';
import type { ActivityType } from './types';

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
