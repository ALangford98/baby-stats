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
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.queryByText('ABCD123456')).not.toBeInTheDocument();
  });

  it('opens the native share sheet with a join link when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /share session/i }));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].url).toContain('join=ABCD123456');
  });

  it('copies the join link to the clipboard when native sharing is unavailable', async () => {
    const user = userEvent.setup();
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /share session/i }));

    expect(await navigator.clipboard.readText()).toContain('join=ABCD123456');
    expect(screen.getByRole('status')).toHaveTextContent(/link copied/i);
  });

  it('has the Sync button immediately left of Share', () => {
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);
    const labels = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(labels.indexOf('Share session') - labels.indexOf('Sync now')).toBe(1);
  });

  it('runs a manual sync and reports success', async () => {
    const onSync = vi.fn().mockResolvedValue({ ok: true });
    render(<AppHeader recoveryCode="ABCD123456" onSync={onSync} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    expect(onSync).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(/^synced$/i);
  });

  it('says when a manual sync failed', async () => {
    const onSync = vi.fn().mockResolvedValue({ ok: false, message: 'permission-denied' });
    render(<AppHeader recoveryCode="ABCD123456" onSync={onSync} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/sync failed/i);
  });

  it('calls onOpenHistory when the History button is tapped', async () => {
    const onOpenHistory = vi.fn();
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={onOpenHistory} onOpenInsights={vi.fn()} onOpenSettings={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSettings when the Settings button is tapped', async () => {
    const onOpenSettings = vi.fn();
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={vi.fn()} onOpenSettings={onOpenSettings} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenInsights when the Insights button is tapped', async () => {
    const onOpenInsights = vi.fn();
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={onOpenInsights} onOpenSettings={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /insights/i }));
    expect(onOpenInsights).toHaveBeenCalledTimes(1);
  });
});
