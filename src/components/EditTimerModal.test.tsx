/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditTimerModal } from './EditTimerModal';
import { ACTIVITIES } from '../activities';
import type { TimerLog } from '../types';

const config = ACTIVITIES.find((a) => a.type === 'nap')!;

describe('EditTimerModal', () => {
  it('lists existing sessions and saves an added session', async () => {
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [{ start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' }],
    };
    const onSave = vi.fn();
    render(<EditTimerModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getAllByLabelText(/start/i)).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /add session/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(2);
  });

  it('allows deleting a session, including one that is still running (end is empty)', async () => {
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [
        { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' },
        { start: '2026-09-23T10:00:00.000Z', end: null },
      ],
    };
    const onSave = vi.fn();
    render(<EditTimerModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete session/i });
    expect(deleteButtons).toHaveLength(2);
    await userEvent.click(deleteButtons[1]);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].end).toBe('2026-09-23T09:30:00.000Z');
  });

  it('shows no delete action when onDelete is not provided (built-in activity)', () => {
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [] };
    render(<EditTimerModal config={config} log={log} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
  });

  it('deletes after confirmation when onDelete is provided (custom activity)', async () => {
    const log: TimerLog = { kind: 'timer', type: 'custom-def67890', sessions: [] };
    const customConfig = { type: 'custom-def67890', label: 'Screen time', kind: 'timer' as const, icon: 'Star' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditTimerModal config={customConfig} log={log} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
