/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivityButton } from './ActivityButton';
import { ACTIVITIES } from '../activities';
import type { CounterLog, TimerLog } from '../types';

const diaperConfig = ACTIVITIES.find((a) => a.type === 'lightDiaper')!;
const napConfig = ACTIVITIES.find((a) => a.type === 'nap')!;

describe('ActivityButton', () => {
  it('shows the count badge for a counter activity and calls onTap when tapped', async () => {
    const log: CounterLog = { kind: 'counter', type: 'lightDiaper', count: 3 };
    const onTap = vi.fn();
    render(<ActivityButton config={diaperConfig} log={log} onTap={onTap} onEdit={vi.fn()} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^light diaper$/i }));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('shows an active state and elapsed readout while a timer is running', () => {
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [{ start: new Date().toISOString(), end: null }] };
    render(<ActivityButton config={napConfig} log={log} onTap={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^nap$/i })).toHaveClass('activity-button__main--active');
  });

  it('shows the timer\'s running total (sessions and time) under the label', () => {
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [
        { start: '2026-09-23T08:00:00.000Z', end: '2026-09-23T09:00:00.000Z' },
        { start: '2026-09-23T12:00:00.000Z', end: '2026-09-23T12:25:00.000Z' },
      ],
    };
    render(<ActivityButton config={napConfig} log={log} onTap={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByText('2X - 01H:25M')).toBeInTheDocument();
  });

  it('includes the running session in the total', () => {
    const start = new Date(Date.now() - 30 * 60_000).toISOString();
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [
        { start: '2026-09-23T08:00:00.000Z', end: '2026-09-23T09:00:00.000Z' },
        { start, end: null },
      ],
    };
    render(<ActivityButton config={napConfig} log={log} onTap={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByText('2X - 01H:30M')).toBeInTheDocument();
  });

  it('shows a plain count, and never an active state, for a count-only timer', () => {
    const instant = { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:00:00.000Z' };
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [instant, instant] };
    render(<ActivityButton config={{ ...napConfig, countOnly: true }} log={log} onTap={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText(/X - /)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^nap$/i })).not.toHaveClass('activity-button__main--active');
  });

  it('calls onEdit when the edit icon is tapped, without triggering onTap', async () => {
    const log: CounterLog = { kind: 'counter', type: 'lightDiaper', count: 0 };
    const onTap = vi.fn();
    const onEdit = vi.fn();
    render(<ActivityButton config={diaperConfig} log={log} onTap={onTap} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole('button', { name: /edit light diaper/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });
});
