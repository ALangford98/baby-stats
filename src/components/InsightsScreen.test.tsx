import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InsightsScreen } from './InsightsScreen';
import { createEmptyDay, setCounterEntries } from '../domain/day';
import { ACTIVITIES } from '../activities';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function dayWith(d: number, feeds: number[], poops: number[]) {
  let day = createEmptyDay(iso(at(d, 6)), ACTIVITIES);
  day = setCounterEntries(day, 'feeding', feeds.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
  return setCounterEntries(day, 'lightDiaper', poops.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
}

describe('InsightsScreen', () => {
  it('renders every statistic as "not enough data" for a new user', () => {
    render(<InsightsScreen days={[createEmptyDay(new Date().toISOString(), ACTIVITIES)]} onClose={vi.fn()} />);
    const poops = screen.getByRole('region', { name: /poops/i });
    expect(within(poops).getByText(/last one/i).parentElement).toHaveTextContent(/none logged yet/i);
    expect(within(poops).getAllByText(/not enough data yet/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('region', { name: /feeding/i })).toBeInTheDocument();
  });

  it('shows the feed→poop range, the basis, and a 24-bar hotspot chart', () => {
    const days = [18, 19, 20, 21, 22, 23].map((d) => dayWith(d, [at(d, 8), at(d, 12)], [at(d, 8, 45), at(d, 12, 45)]));
    render(<InsightsScreen days={days} onClose={vi.fn()} />);
    const poops = screen.getByRole('region', { name: /poops/i });
    expect(within(poops).getByText(/after feeds/i).parentElement).toHaveTextContent(/usually 45m after a feed · based on 12 poops/i);
    expect(within(poops).getAllByTestId('hotspot-bar')).toHaveLength(24);
  });

  it('closes', async () => {
    const onClose = vi.fn();
    render(<InsightsScreen days={[]} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
