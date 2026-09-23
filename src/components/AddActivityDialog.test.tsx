import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddActivityDialog } from './AddActivityDialog';

describe('AddActivityDialog', () => {
  it('has a counter kind and a first icon selected by default, both submittable once a label is entered', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Tummy medicine');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [added] = onAdd.mock.calls[0];
    expect(added.label).toBe('Tummy medicine');
    expect(added.kind).toBe('counter');
    expect(added.type).toMatch(/^custom-[a-z0-9]{8}$/);
    expect(typeof added.icon).toBe('string');
  });

  it('does not submit with an empty or whitespace-only label', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), '   ');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it('lets the user switch the kind to timer', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Screen time');
    await userEvent.click(screen.getByRole('radio', { name: /timer/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd.mock.calls[0][0].kind).toBe('timer');
  });

  it('lets the user pick a different icon', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Bath time');
    await userEvent.click(screen.getByRole('button', { name: 'Bath' }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd.mock.calls[0][0].icon).toBe('Bath');
  });

  it('accepts a label containing an apostrophe without throwing', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), "Baby's medicine");
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd.mock.calls[0][0].label).toBe("Baby's medicine");
  });

  it('calls onClose when cancelled', async () => {
    const onClose = vi.fn();
    render(<AddActivityDialog onAdd={vi.fn()} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
