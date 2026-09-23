import { describe, expect, it } from 'vitest';
import { formatElapsed } from './time';

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
