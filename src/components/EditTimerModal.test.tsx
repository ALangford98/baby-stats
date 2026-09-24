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

  it('has "Use timer" ticked by default and saves with the timer still on', async () => {
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [] };
    const onSave = vi.fn();
    render(<EditTimerModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /use timer/i })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith([], true);
  });

  it('switches to a plain count, keeping the earliest sessions and closing a running one', async () => {
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [
        { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' },
        { start: '2026-09-23T10:00:00.000Z', end: null },
        { start: '2026-09-23T11:00:00.000Z', end: '2026-09-23T11:10:00.000Z' },
      ],
    };
    const onSave = vi.fn();
    render(<EditTimerModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /use timer/i }));
    expect(screen.queryAllByLabelText(/start/i)).toHaveLength(0);
    const countInput = screen.getByLabelText(/nap count/i);
    expect(countInput).toHaveValue(3);
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '2');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const [saved, useTimer] = onSave.mock.calls[0];
    expect(useTimer).toBe(false);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(log.sessions[0]);
    expect(saved[1].start).toBe('2026-09-23T10:00:00.000Z');
    expect(saved[1].end).not.toBeNull();
  });

  it('pads a raised count with instant sessions', async () => {
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [] };
    const onSave = vi.fn();
    render(<EditTimerModal config={{ ...config, countOnly: true }} log={log} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /use timer/i })).not.toBeChecked();
    await userEvent.clear(screen.getByLabelText(/nap count/i));
    await userEvent.type(screen.getByLabelText(/nap count/i), '3');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const [saved, useTimer] = onSave.mock.calls[0];
    expect(useTimer).toBe(false);
    expect(saved).toHaveLength(3);
    expect(saved.every((s: { start: string; end: string | null }) => s.end === s.start)).toBe(true);
  });
});
