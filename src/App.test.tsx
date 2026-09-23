import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./storage/firebaseSync', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue(undefined),
  fetchSyncedData: vi.fn().mockResolvedValue(null),
  pushSyncedData: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('App: consent decline (Review Focus)', () => {
  it('stores nothing in localStorage if the user declines consent', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /no|decline/i }));

    expect(screen.getByText(/not tracking/i)).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});

describe('App: full day flow', () => {
  it('goes from consent through tracking to a saved history entry', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // recovery code step, start fresh
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i })); // start time, accept default

    await userEvent.click(screen.getByRole('button', { name: /^light diaper$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^light diaper$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^nap$/i }));

    expect(screen.getByRole('button', { name: /^nap$/i })).toHaveClass('activity-button__main--active');

    await userEvent.click(screen.getByRole('button', { name: /^nap$/i })); // stop the nap timer

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));

    expect(screen.getByText(/here's how today went/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await userEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
