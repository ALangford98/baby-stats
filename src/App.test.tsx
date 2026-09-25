import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { fetchSyncedData, watchSyncedData } from './storage/firebaseSync';
import { createEmptyDay } from './domain/day';
import { saveSettings } from './storage/localStorage';
import { ACTIVITIES } from './activities';
import type { ActivityConfig, Day } from './types';

vi.mock('./storage/firebaseSync', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue(undefined),
  fetchSyncedData: vi.fn().mockResolvedValue(null),
  pushSyncedData: vi.fn().mockResolvedValue(undefined),
  // Real watchSyncedData returns an unsubscribe function; no test here
  // exercises a remote update arriving, so a no-op subscription is enough.
  watchSyncedData: vi.fn().mockReturnValue(() => {}),
  isCloudSyncConfigured: vi.fn().mockReturnValue(true),
  fetchRemoteSnapshot: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchSyncedData).mockReset().mockResolvedValue(null);
  window.history.replaceState(null, '', '/');
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
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });

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

describe('App: multi-device sync', () => {
  it('applies a change reported by the live listener, e.g. from the other parent\'s phone', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />);

    // Confirm the default start time to land on the main tracking screen,
    // where the live listener from useCloudSync is active.
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));
    expect(screen.getByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();

    // Simulate another device finishing a day and it syncing back down —
    // the mocked watchSyncedData captured the onChange callback App passed in.
    const onRemoteChange = vi.mocked(watchSyncedData).mock.calls[0][1];
    const remoteDay = createEmptyDay('2026-09-22T08:00:00.000Z', ACTIVITIES);
    act(() => onRemoteChange({ data: { currentDay: null, history: [remoteDay], customActivities: [], countOnlyTimers: [] }, updatedAt: Date.now() }));

    await userEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText(remoteDay.date)).toBeInTheDocument();
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

describe('App: joining a partner\'s session by code', () => {
  it('normalizes a lowercase, spaced code before looking it up', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    vi.mocked(fetchSyncedData).mockResolvedValue({ currentDay: null, history: [], customActivities: [], countOnlyTimers: [] });
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), ' zzzz-999999 ');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    expect(fetchSyncedData).toHaveBeenCalledWith('ZZZZ999999');
  });

  it('refuses to switch to a code that has no session behind it', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />); // fetchSyncedData resolves null: no such session

    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no shared session found/i);
    expect(JSON.parse(localStorage.getItem('babystats:settings')!).recoveryCode).toBe('ABCD123456');
  });

  it('explains a permission-denied failure instead of blaming the connection', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    vi.mocked(fetchSyncedData).mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/refused access/i);
  });
});

describe('App: share links', () => {
  it('asks before joining the session in a share link, then switches to it', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    const remoteDay = createEmptyDay('2026-09-22T08:00:00.000Z', ACTIVITIES);
    vi.mocked(fetchSyncedData).mockResolvedValue({ currentDay: remoteDay, history: [], customActivities: [], countOnlyTimers: [] });
    window.history.replaceState(null, '', '/?join=PARTNER234');
    render(<App />);

    expect(screen.getByRole('dialog', { name: /join shared session/i })).toBeInTheDocument();
    expect(fetchSyncedData).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^join$/i }));

    expect(await screen.findByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();
    expect(fetchSyncedData).toHaveBeenCalledWith('PARTNER234');
    expect(JSON.parse(localStorage.getItem('babystats:settings')!).recoveryCode).toBe('PARTNER234');
    expect(window.location.search).toBe('');
  });

  it('leaves this device\'s session alone when the invite is declined', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    window.history.replaceState(null, '', '/?join=PARTNER234');
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
    expect(fetchSyncedData).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('shows the confirmation after consent for a brand-new device, skipping recovery-code onboarding on join', async () => {
    vi.mocked(fetchSyncedData).mockResolvedValue({ currentDay: null, history: [], customActivities: [], countOnlyTimers: [] });
    window.history.replaceState(null, '', '/?join=PARTNER234');
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /^join$/i }));

    expect(await screen.findByLabelText(/start time/i)).toBeInTheDocument();
    expect(screen.queryByText(/save this to restore your data/i)).not.toBeInTheDocument();
  });

  it('keeps the confirmation open with an error when the linked session does not exist', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    window.history.replaceState(null, '', '/?join=PARTNER234');
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /^join$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no shared session found/i);
    expect(screen.getByRole('dialog', { name: /join shared session/i })).toBeInTheDocument();
  });

  it('ignores a link to the session this device is already in', () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    window.history.replaceState(null, '', '/?join=ABCD123456');
    render(<App />);

    expect(screen.queryByRole('dialog', { name: /join shared session/i })).not.toBeInTheDocument();
  });
});

describe('App: recovery-code restore applies the remote device\'s custom activities', () => {
  it('restoring by code does not crash when the local device has a custom activity the remote day has no log for', async () => {
    const localCustom: ActivityConfig = { type: 'custom-local001', kind: 'counter', label: 'Local Custom', icon: 'Droplet' };
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [localCustom], countOnlyTimers: [] });
    // The remote device has never heard of the local custom activity, so its
    // day has no log entry for it and its own customActivities list is empty.
    const remoteDay = createEmptyDay('2026-09-22T08:00:00.000Z', ACTIVITIES);
    vi.mocked(fetchSyncedData).mockResolvedValue({ currentDay: remoteDay, history: [], customActivities: [], countOnlyTimers: [] });

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), 'EXISTING123');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    // Lands back on the main tracking screen without throwing, showing only
    // the activities the restored settings now actually have logs for.
    expect(await screen.findByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^local custom$/i })).not.toBeInTheDocument();
  });
});

describe('App: built-in activities added after a day started', () => {
  it('backfills a missing built-in (Feeding) into the running day so its button appears right away', () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    const oldDay = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES.filter((a) => a.type !== 'feeding'));
    localStorage.setItem('babystats:currentDay', JSON.stringify(oldDay));

    render(<App />);

    expect(screen.getByRole('button', { name: /^feeding$/i })).toBeInTheDocument();
    expect(persistedCurrentDay()!.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 0, entries: [] });
  });
});

describe('App: count-only timers', () => {
  it('turning off "Use timer" makes taps count instead of starting a timer, and the choice persists', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));

    await userEvent.click(screen.getByRole('button', { name: /edit nap/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /use timer/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const nap = screen.getByRole('button', { name: /^nap$/i });
    await userEvent.click(nap);
    await userEvent.click(nap);

    expect(nap).not.toHaveClass('activity-button__main--active');
    expect(nap).toHaveTextContent('2');
    expect(JSON.parse(localStorage.getItem('babystats:settings')!).countOnlyTimers).toEqual(['nap']);
    const sessions = (persistedCurrentDay()!.logs.nap as { sessions: { start: string; end: string | null }[] }).sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.end === s.start)).toBe(true);
  });
});

describe('App: cloud sync status', () => {
  it('shows a sync failure in Settings instead of hiding it', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />);
    const onError = vi.mocked(watchSyncedData).mock.calls.at(-1)![2]!;
    act(() => onError(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })));

    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    expect(await screen.findByTestId('sync-status')).toHaveTextContent(/not working: permission-denied/i);
  });
});

describe('App: custom activities', () => {
  it('adding a custom counter makes it tappable immediately and appear in the end-of-day report', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));

    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    await userEvent.type(screen.getByLabelText(/label/i), 'Tummy medicine');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const customButton = screen.getByRole('button', { name: /^tummy medicine$/i });
    await userEvent.click(customButton);
    await userEvent.click(customButton);

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));

    expect(screen.getByText(/tummy medicine: 2/i)).toBeInTheDocument();
  });
});
