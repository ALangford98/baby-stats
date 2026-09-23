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
});
