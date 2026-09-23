import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryDetail } from './HistoryDetail';
import { createEmptyDay, incrementCounter } from '../domain/day';

describe('HistoryDetail', () => {
  it('shows the saved report and stats summary for that day', () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z');
    day = incrementCounter(day, 'lightDiaper');
    day = { ...day, endedAt: '2026-09-23T20:00:00.000Z', report: 'A very funny report.', reportSource: 'offline' };

    render(<HistoryDetail day={day} onBack={vi.fn()} />);

    expect(screen.getByText('A very funny report.')).toBeInTheDocument();
    expect(screen.getByText(/light diaper: 1/i)).toBeInTheDocument();
  });

  it('calls onBack when the back button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onBack = vi.fn();
    render(<HistoryDetail day={day} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
