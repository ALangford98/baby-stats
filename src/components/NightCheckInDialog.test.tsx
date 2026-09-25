import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NightCheckInDialog } from './NightCheckInDialog';
import { createEmptyDay, incrementCounter } from '../domain/day';
import { goToBed } from '../domain/night';
import { ACTIVITIES } from '../activities';
import { formatClockTime, toLocalInputValue } from '../utils/time';

const t = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString();
const NOW = t(24, 6, 40);

function nightDay() {
  let day = createEmptyDay(t(23, 7), ACTIVITIES);
  day = incrementCounter(day, 'heavyDiaper', t(24, 1, 10));
  day = incrementCounter(day, 'heavyDiaper', t(24, 3, 45));
  return goToBed(day, t(23, 22, 30));
}

describe('NightCheckInDialog', () => {
  it('pre-fills each counter with what was tapped overnight and shows when', () => {
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(new RegExp(`you logged 2 \\(${formatClockTime(t(24, 1, 10))}, ${formatClockTime(t(24, 3, 45))}\\)`, 'i'))).toBeInTheDocument();
    expect(screen.getByTestId('night-count-heavyDiaper')).toHaveTextContent('2');
    expect(screen.getByTestId('night-count-feeding')).toHaveTextContent('0');
  });

  it('confirms adjusted totals with the bedtime', async () => {
    const onConfirm = vi.fn();
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={onConfirm} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /fewer heavy diaper/i }));
    await userEvent.click(screen.getByRole('button', { name: /more feeding/i }));
    await userEvent.click(screen.getByRole('button', { name: /looks right/i }));

    expect(onConfirm).toHaveBeenCalledWith(t(23, 22, 30), expect.objectContaining({ heavyDiaper: 1, feeding: 1 }));
  });

  it('never goes below zero', async () => {
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /fewer feeding/i }));
    expect(screen.getByTestId('night-count-feeding')).toHaveTextContent('0');
  });

  it('asks for a bedtime when Gone to Bed was never tapped, and validates it', async () => {
    const onConfirm = vi.fn();
    const day = createEmptyDay(t(23, 7), ACTIVITIES);
    render(<NightCheckInDialog day={day} activities={ACTIVITIES} now={NOW} onConfirm={onConfirm} onCancel={vi.fn()} />);

    const input = screen.getByLabelText(/when did you go to bed/i);
    await userEvent.clear(input);
    await userEvent.type(input, toLocalInputValue(t(24, 9)));
    expect(screen.getByRole('alert')).toHaveTextContent(/future/i);
    expect(screen.getByRole('button', { name: /looks right/i })).toBeDisabled();
  });

  it('shows timers as a read-only overnight summary', () => {
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/nap: 0 sessions overnight/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more nap/i })).not.toBeInTheDocument();
  });
});
