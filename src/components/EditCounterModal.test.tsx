/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditCounterModal } from './EditCounterModal';
import { ACTIVITIES } from '../activities';
import type { CounterLog } from '../types';

const config = ACTIVITIES.find((a) => a.type === 'spitUp')!;

describe('EditCounterModal', () => {
  it('prefills the current count and saves an edited value', async () => {
    const log: CounterLog = { kind: 'counter', type: 'spitUp', count: 2 };
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    const input = screen.getByLabelText<HTMLInputElement>(/spit up count/i);
    expect(input.value).toBe('2');

    await userEvent.clear(input);
    await userEvent.type(input, '7');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(7);
  });

  it('calls onClose when cancel is clicked', async () => {
    const log: CounterLog = { kind: 'counter', type: 'spitUp', count: 2 };
    const onClose = vi.fn();
    render(<EditCounterModal config={config} log={log} onSave={vi.fn()} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no delete action when onDelete is not provided (built-in activity)', () => {
    const log: CounterLog = { kind: 'counter', type: 'spitUp', count: 2 };
    render(<EditCounterModal config={config} log={log} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
  });

  it('deletes after confirmation when onDelete is provided (custom activity)', async () => {
    const log: CounterLog = { kind: 'counter', type: 'custom-abc12345', count: 2 };
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditCounterModal config={customConfig} log={log} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const log: CounterLog = { kind: 'counter', type: 'custom-abc12345', count: 2 };
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EditCounterModal config={customConfig} log={log} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDelete).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
