import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StartTimeModal } from './StartTimeModal';
import { toLocalInputValue } from '../utils/time';

describe('StartTimeModal', () => {
  it('defaults the input to the given time and confirms with it unchanged', async () => {
    const onConfirm = vi.fn();
    render(<StartTimeModal defaultTime="2026-09-23T08:00:00.000Z" onConfirm={onConfirm} />);

    const input = screen.getByLabelText<HTMLInputElement>(/start time/i);
    // `datetime-local` shows local wall-clock, not the ISO string's UTC one.
    expect(input.value).toBe(toLocalInputValue('2026-09-23T08:00:00.000Z'));
    // ...and what is shown re-parses to the same instant, in any timezone.
    expect(new Date(input.value).toISOString()).toBe('2026-09-23T08:00:00.000Z');

    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));
    expect(onConfirm).toHaveBeenCalledWith('2026-09-23T08:00:00.000Z');
  });

  it('confirms with an edited time converted back to ISO', async () => {
    const onConfirm = vi.fn();
    render(<StartTimeModal defaultTime="2026-09-23T08:00:00.000Z" onConfirm={onConfirm} />);

    const input = screen.getByLabelText<HTMLInputElement>(/start time/i);
    await userEvent.clear(input);
    await userEvent.type(input, '2026-09-23T07:30');
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));

    expect(onConfirm).toHaveBeenCalledWith(new Date('2026-09-23T07:30').toISOString());
  });
});
