import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditCounterModal } from './EditCounterModal';
import { ACTIVITIES } from '../activities';
import type { CounterEntry, CounterLog } from '../types';
import { toLocalInputValue } from '../utils/time';

const config = ACTIVITIES.find((a) => a.type === 'spitUp')!;
const AT = new Date(2026, 8, 24, 14, 5).toISOString();

function log(entries: CounterEntry[]): CounterLog {
  return { kind: 'counter', type: 'spitUp', count: entries.length, entries };
}

describe('EditCounterModal', () => {
  it('saves a plain count change without touching times (raising adds untimed rows)', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'exact', at: AT }])} onSave={onSave} onClose={vi.fn()} />);

    const input = screen.getByLabelText<HTMLInputElement>(/spit up count/i);
    expect(input.value).toBe('1');
    await userEvent.clear(input);
    await userEvent.type(input, '3');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ kind: 'exact', at: AT }, { kind: 'untimed' }, { kind: 'untimed' }]);
  });

  it('lists each entry and lets an untimed one be given a time', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'untimed' }])} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByText(/time not set/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/time for entry 1/i), toLocalInputValue(AT));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ kind: 'exact', at: AT }]);
  });

  it('can clear a time back to "not set"', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'exact', at: AT }])} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /clear time for entry 1/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ kind: 'untimed' }]);
  });

  it('shows overnight entries with their window and lets them be pinned', async () => {
    const from = new Date(2026, 8, 23, 22, 30).toISOString();
    const to = new Date(2026, 8, 24, 6, 40).toISOString();
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'overnight', from, to }])} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByText(/overnight/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith([{ kind: 'overnight', from, to }]);
  });

  it('deleting a row lowers the count', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'untimed' }, { kind: 'exact', at: AT }])} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /delete entry 1/i }));
    expect(screen.getByLabelText<HTMLInputElement>(/spit up count/i).value).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith([{ kind: 'exact', at: AT }]);
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<EditCounterModal config={config} log={log([])} onSave={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no delete action when onDelete is not provided (built-in activity)', () => {
    render(<EditCounterModal config={config} log={log([])} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
  });

  it('deletes after confirmation when onDelete is provided (custom activity)', async () => {
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditCounterModal config={customConfig} log={{ ...log([]), type: 'custom-abc12345' }} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EditCounterModal config={customConfig} log={{ ...log([]), type: 'custom-abc12345' }} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
