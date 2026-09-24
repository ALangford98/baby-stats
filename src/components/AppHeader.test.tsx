import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';

afterEach(() => {
  // jsdom has no Web Share API; tests that add one must not leak it.
  delete (navigator as { share?: unknown }).share;
});

describe('AppHeader', () => {
  it('no longer displays the session code itself', () => {
    render(<AppHeader recoveryCode="ABCD123456" onOpenHistory={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.queryByText('ABCD123456')).not.toBeInTheDocument();
  });

  it('opens the native share sheet with a join link when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<AppHeader recoveryCode="ABCD123456" onOpenHistory={vi.fn()} onOpenSettings={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /share session/i }));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].url).toContain('join=ABCD123456');
  });

  it('copies the join link to the clipboard when native sharing is unavailable', async () => {
    const user = userEvent.setup();
    render(<AppHeader recoveryCode="ABCD123456" onOpenHistory={vi.fn()} onOpenSettings={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /share session/i }));

    expect(await navigator.clipboard.readText()).toContain('join=ABCD123456');
    expect(screen.getByRole('status')).toHaveTextContent(/link copied/i);
  });

  it('calls onOpenHistory when the History button is tapped', async () => {
    const onOpenHistory = vi.fn();
    render(<AppHeader recoveryCode="ABCD123456" onOpenHistory={onOpenHistory} onOpenSettings={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSettings when the Settings button is tapped', async () => {
    const onOpenSettings = vi.fn();
    render(<AppHeader recoveryCode="ABCD123456" onOpenHistory={vi.fn()} onOpenSettings={onOpenSettings} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
