import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('always shows the recovery code', () => {
    render(<AppHeader recoveryCode="ABCD123456" onOpenHistory={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByText('ABCD123456')).toBeInTheDocument();
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
