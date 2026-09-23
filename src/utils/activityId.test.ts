import { describe, expect, it } from 'vitest';
import { generateActivityId } from './activityId';

describe('generateActivityId', () => {
  it('always starts with the custom- prefix followed by 8 lowercase alphanumeric characters', () => {
    expect(generateActivityId()).toMatch(/^custom-[a-z0-9]{8}$/);
  });

  it('generates different ids across calls', () => {
    const a = generateActivityId();
    const b = generateActivityId();
    expect(a).not.toBe(b);
  });
});
