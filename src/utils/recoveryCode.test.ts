import { describe, expect, it } from 'vitest';
import { buildShareLink, generateRecoveryCode, normalizeRecoveryCode, readJoinCode } from './recoveryCode';

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

describe('normalizeRecoveryCode', () => {
  it('uppercases and strips whitespace and separators', () => {
    expect(normalizeRecoveryCode(' abcd-efgh 23 ')).toBe('ABCDEFGH23');
  });
});

describe('share links', () => {
  it('round-trips a code through a share link', () => {
    const link = buildShareLink('ABCD234567', 'https://example.com/app/?foo=1#x');
    expect(link).toBe('https://example.com/app/?join=ABCD234567');
    expect(readJoinCode(new URL(link).search)).toBe('ABCD234567');
  });

  it('normalizes the code read from a link and ignores links without one', () => {
    expect(readJoinCode('?join=abcd234567')).toBe('ABCD234567');
    expect(readJoinCode('?other=1')).toBeNull();
    expect(readJoinCode('?join=--')).toBeNull();
  });
});
