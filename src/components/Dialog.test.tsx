import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders as an accessible modal dialog with its children', () => {
    render(
      <Dialog label="Example">
        <p>Hello</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: /example/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Dialog label="Example" onClose={onClose}>
        <p>Hello</p>
      </Dialog>,
    );

    await userEvent.click(screen.getByTestId('dialog-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the panel', async () => {
    const onClose = vi.fn();
    render(
      <Dialog label="Example" onClose={onClose}>
        <p>Hello</p>
      </Dialog>,
    );

    await userEvent.click(screen.getByText('Hello'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Dialog label="Example" onClose={onClose}>
        <p>Hello</p>
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing on backdrop click when onClose is omitted (forced choice)', async () => {
    render(
      <Dialog label="Example">
        <button type="button">Choose</button>
      </Dialog>,
    );

    await userEvent.click(screen.getByTestId('dialog-overlay'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
