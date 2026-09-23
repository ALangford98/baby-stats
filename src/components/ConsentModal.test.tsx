import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentModal } from './ConsentModal';

describe('ConsentModal', () => {
  it('calls onAccept when the user agrees', async () => {
    const onAccept = vi.fn();
    render(<ConsentModal onAccept={onAccept} onDecline={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when the user declines', async () => {
    const onDecline = vi.fn();
    render(<ConsentModal onAccept={vi.fn()} onDecline={onDecline} />);
    await userEvent.click(screen.getByRole('button', { name: /no|decline/i }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
