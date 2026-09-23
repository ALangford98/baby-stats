import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryScreen } from './HistoryScreen';
import { createEmptyDay } from '../domain/day';

describe('HistoryScreen', () => {
  it('shows a message when there is no history yet', () => {
    render(<HistoryScreen history={[]} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/no days tracked yet/i)).toBeInTheDocument();
  });

  it('lists each past day and calls onSelect when tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onSelect = vi.fn();
    render(<HistoryScreen history={[day]} onSelect={onSelect} onClose={vi.fn()} />);

    await userEvent.click(screen.getByText('2026-09-23'));
    expect(onSelect).toHaveBeenCalledWith(day);
  });
});
