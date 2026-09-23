import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryDetail } from './HistoryDetail';
import { createEmptyDay, incrementCounter } from '../domain/day';
import { ACTIVITIES } from '../activities';

describe('HistoryDetail', () => {
  it('shows the saved report and stats summary for that day', () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    day = incrementCounter(day, 'lightDiaper');
    day = { ...day, endedAt: '2026-09-23T20:00:00.000Z', report: 'A very funny report.', reportSource: 'offline' };

    render(<HistoryDetail day={day} activities={ACTIVITIES} onBack={vi.fn()} />);

    expect(screen.getByText('A very funny report.')).toBeInTheDocument();
    expect(screen.getByText(/light diaper: 1/i)).toBeInTheDocument();
  });

  it('shows the stats summary before the report text', () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    day = { ...day, endedAt: '2026-09-23T20:00:00.000Z', report: 'A very funny report.', reportSource: 'offline' };

    render(<HistoryDetail day={day} activities={ACTIVITIES} onBack={vi.fn()} />);

    const statsText = screen.getByText(/light diaper: 0/i);
    const reportText = screen.getByText('A very funny report.');
    expect(statsText.compareDocumentPosition(reportText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('calls onBack when the back button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    const onBack = vi.fn();
    render(<HistoryDetail day={day} activities={ACTIVITIES} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
