import { describe, expect, it } from 'vitest';
import { generateRecoveryCode } from './recoveryCode';

describe('generateRecoveryCode', () => {
  it('generates a 10-character code by default', () => {
    expect(generateRecoveryCode()).toHaveLength(10);
  });

  it('only uses unambiguous uppercase letters and digits', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('generates different codes across calls (extremely unlikely to collide)', () => {
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(a).not.toBe(b);
  });
});
