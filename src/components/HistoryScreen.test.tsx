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

    await userEvent.click(screen.getByText(day.date));
    expect(onSelect).toHaveBeenCalledWith(day);
  });

  // Ending a day and starting another on the same calendar date is a normal,
  // supported flow, so `day.date` is not a unique React key — startedAt is.
  it('renders two days from the same calendar date without duplicate keys', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const morning = createEmptyDay('2026-09-23T08:00:00.000Z');
    const evening = createEmptyDay('2026-09-23T18:00:00.000Z');
    expect(morning.date).toBe(evening.date);

    const onSelect = vi.fn();
    render(<HistoryScreen history={[morning, evening]} onSelect={onSelect} onClose={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/same key|duplicate key/i);

    await userEvent.click(screen.getAllByRole('button', { name: morning.date })[1]);
    expect(onSelect).toHaveBeenCalledWith(evening);
    warn.mockRestore();
  });

  it('deletes a day after the user confirms, without selecting it', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HistoryScreen history={[day]} onSelect={onSelect} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(day);
    expect(onSelect).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('does not delete when the user cancels the confirmation', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<HistoryScreen history={[day]} onSelect={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
