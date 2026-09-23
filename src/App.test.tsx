import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { fetchSyncedData } from './storage/firebaseSync';
import { saveSettings } from './storage/localStorage';
import type { Day } from './types';

vi.mock('./storage/firebaseSync', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue(undefined),
  fetchSyncedData: vi.fn().mockResolvedValue(null),
  pushSyncedData: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchSyncedData).mockReset().mockResolvedValue(null);
});

function persistedCurrentDay(): Day | null {
  const raw = localStorage.getItem('babystats:currentDay');
  return raw ? (JSON.parse(raw) as Day) : null;
}

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

describe('App: End Day persistence', () => {
  // `finishDay()` then `setDayReport()` were two separate writes, and the
  // second closed over the pre-finishDay `day` — so what actually landed in
  // localStorage had endedAt: null and a still-open timer session, even though
  // the screen briefly looked right. Assert on what is on disk, not on screen.
  it('persists the ended day (endedAt and closed timer sessions) to localStorage', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));

    await userEvent.click(screen.getByRole('button', { name: /^nap$/i })); // start, leave running
    await userEvent.click(screen.getByRole('button', { name: /end day/i }));

    const stored = persistedCurrentDay()!;
    expect(stored).not.toBeNull();
    expect(stored.endedAt).not.toBeNull();

    const napSessions = (stored.logs.nap as { sessions: { end: string | null }[] }).sessions;
    expect(napSessions).toHaveLength(1);
    expect(napSessions[0].end).not.toBeNull();

    expect(stored.report).toBeTruthy();
    expect(stored.reportSource).toBe('offline');
    expect(screen.getByText(/here's how today went/i)).toBeInTheDocument();
  });

  it('carries endedAt and the closed session through into the history entry', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));
    await userEvent.click(screen.getByRole('button', { name: /^nap$/i }));
    await userEvent.click(screen.getByRole('button', { name: /end day/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    const history = JSON.parse(localStorage.getItem('babystats:history')!) as Day[];
    expect(history).toHaveLength(1);
    expect(history[0].endedAt).not.toBeNull();
    expect((history[0].logs.nap as { sessions: { end: string | null }[] }).sessions[0].end).not.toBeNull();
  });
});

describe('App: returning user', () => {
  it('skips both the consent modal and the recovery-code onboarding step', () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null });

    render(<App />);

    expect(screen.queryByRole('dialog', { name: /consent/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/is that ok\?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/save this to restore your data/i)).not.toBeInTheDocument();
    // Straight to the start-a-new-day screen.
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
  });

  it('still asks for consent when there are no saved settings', () => {
    render(<App />);
    expect(screen.getByRole('dialog', { name: /consent/i })).toBeInTheDocument();
  });
});

describe('App: recovery-code restore from Settings', () => {
  it('shows the failure on the Settings screen itself, without navigating away', async () => {
    vi.mocked(fetchSyncedData).mockRejectedValue(new Error('network error'));
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach that recovery code/i);
    // Still on Settings — the error is where the user triggered it.
    expect(screen.getByLabelText(/enter a different recovery code/i)).toBeInTheDocument();
  });
});
