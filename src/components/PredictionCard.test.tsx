import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PredictionCard } from './PredictionCard';
import { createEmptyDay, setCounterEntries } from '../domain/day';
import { ACTIVITIES } from '../activities';
import { formatClockTime } from '../utils/time';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function dayWith(d: number, feeds: number[], poops: number[]) {
  let day = createEmptyDay(iso(at(d, 6)), ACTIVITIES);
  day = setCounterEntries(day, 'feeding', feeds.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
  return setCounterEntries(day, 'mediumDiaper', poops.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(24, 15, 40));
});
afterEach(() => vi.useRealTimers());

describe('PredictionCard', () => {
  it('shows a learning message with progress when data is thin', () => {
    render(<PredictionCard days={[dayWith(24, [], [])]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/learning your baby's pattern — 0 of 5/i);
  });

  it('shows the likely window after the last feed', () => {
    const history = [18, 19, 20, 21, 22, 23].map((d) => dayWith(d, [at(d, 8), at(d, 12)], [at(d, 8, 45), at(d, 12, 45)]));
    render(<PredictionCard days={[dayWith(24, [at(24, 15, 30)], []), ...history]} />);
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`poop likely ${formatClockTime(at(24, 16, 15))}`, 'i'));
    expect(screen.getByRole('status')).toHaveTextContent(/45m after the .* feed/i);
  });
});
