import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityConfig, ActivityType, Day, TimerSession } from './types';
import { ACTIVITIES, combineActivities } from './activities';
import { addActivityToDay, createEmptyDay, endDay, logInstantSession } from './domain/day';
import { applyNightCheckIn, cancelBed, goToBed, type NightTargets } from './domain/night';
import { AppHeader } from './components/AppHeader';
import { ConsentModal } from './components/ConsentModal';
import { RecoveryCodeStep } from './components/RecoveryCodeStep';
import { StartTimeModal } from './components/StartTimeModal';
import { MainScreen } from './components/MainScreen';
import { ReportScreen } from './components/ReportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { HistoryDetail } from './components/HistoryDetail';
import { JoinSessionDialog } from './components/JoinSessionDialog';
import { NightCheckInDialog } from './components/NightCheckInDialog';
import { PredictionCard } from './components/PredictionCard';
import { SettingsScreen } from './components/SettingsScreen';
import { useDayState } from './hooks/useDayState';
import { useSettings } from './hooks/useSettings';
import { useHistory } from './hooks/useHistory';
import { useCloudSync } from './hooks/useCloudSync';
import { generateOfflineReport } from './domain/reportText';
import { generateAiReport } from './domain/aiReport';
import { fetchSyncedData, type SyncedData } from './storage/firebaseSync';
import { loadSettings } from './storage/localStorage';
import { clearJoinCodeFromUrl, normalizeRecoveryCode, readJoinCode } from './utils/recoveryCode';

type Screen =
  | 'recoveryCode'
  | 'startTime'
  | 'main'
  | 'report'
  | 'history'
  | 'historyDetail'
  | 'settings';

// Consent must be answered before any hook that touches localStorage runs
// (useSettings, useDayState, useHistory, useCloudSync all read/write on
// mount). Splitting the tracking UI into its own component means those
// hooks are not invoked at all until the user accepts — so declining
// consent leaves localStorage untouched.
// Turns a failed join into something the person can act on. Sync errors are
// otherwise swallowed (sync is best-effort), so this is the one place a
// misconfigured backend becomes visible.
function describeJoinError(err: unknown): string {
  if (err instanceof Error && err.message === 'Cloud sync is not configured') {
    return "Cloud sync isn't set up in this version of the app, so sessions can't be shared.";
  }
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'permission-denied' || code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'The sync server refused access. Anonymous sign-in may be disabled in Firebase, or the Firestore rules may not be deployed.';
  }
  return 'Could not reach that recovery code right now. Check the code and your connection, or continue fresh.';
}

export function App() {
  // Someone with saved settings already answered this question on a previous
  // launch. Re-asking every time would be noise, and worse: declining would
  // claim "nothing has been saved" while their real data sits in localStorage.
  // `loadSettings` is a pure read, so declining still writes nothing.
  const [consent, setConsent] = useState<'pending' | 'granted' | 'declined'>(() =>
    loadSettings() ? 'granted' : 'pending',
  );

  if (consent === 'pending') {
    return <ConsentModal onAccept={() => setConsent('granted')} onDecline={() => setConsent('declined')} />;
  }

  if (consent === 'declined') {
    return <p>Not tracking. Nothing has been saved.</p>;
  }

  return <Tracker />;
}

function Tracker() {
  // Must be read before `useSettings()` runs: that hook's own lazy initializer
  // creates and saves fresh settings when none exist, so asking afterwards
  // would always say "returning". The recovery-code step is onboarding — a
  // returning user has already seen and saved their code.
  const [isReturningUser] = useState(() => loadSettings() !== null);

  const dayState = useDayState();
  const [screen, setScreen] = useState<Screen>(() => {
    if (dayState.day) return 'main';
    return isReturningUser ? 'startTime' : 'recoveryCode';
  });
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<Day | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const { settings, updateSettings } = useSettings();
  const { history, addToHistory, replaceHistory, removeFromHistory, updateHistoryDay } = useHistory();

  // The check-in belongs to the day it was opened for. If the other parent
  // confirms first, sync replaces the current day and this closes itself.
  const [checkInFor, setCheckInFor] = useState<string | null>(null);
  const [reportDayId, setReportDayId] = useState<string | null>(null);
  const reportDay = history.find((d) => d.startedAt === reportDayId) ?? null;
  const patternDays = useMemo(() => (dayState.day ? [dayState.day, ...history] : history), [dayState.day, history]);

  // A share link (`?join=CODE`) asks to join someone else's session. Opening
  // your own link is a no-op, so only a different code is worth confirming.
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => {
    const code = readJoinCode(window.location.search);
    return code && code !== settings.recoveryCode ? code : null;
  });

  useEffect(() => {
    if (!pendingJoin) clearJoinCodeFromUrl();
  }, [pendingJoin]);

  // A day started before a built-in activity existed has no log for it, so
  // its button would stay hidden until tomorrow. Backfill it into the running
  // day instead; a no-op once every built-in has a log.
  useEffect(() => {
    const day = dayState.day;
    if (!day || day.endedAt) return;
    const missing = ACTIVITIES.filter((activity) => !day.logs[activity.type]);
    if (missing.length === 0) return;
    dayState.replaceDay(missing.reduce((next, activity) => addActivityToDay(next, activity), day));
  }, [dayState.day, dayState.replaceDay]);

  const activities = useMemo(
    () => combineActivities(settings.customActivities, settings.countOnlyTimers),
    [settings.customActivities, settings.countOnlyTimers],
  );

  // Applies a change that arrived from another device using the same
  // recovery code (e.g. the other parent's phone). Kept stable via
  // useCallback so the listener in useCloudSync only resubscribes when the
  // recovery code itself changes, not on every local edit.
  const handleRemoteUpdate = useCallback(
    (data: SyncedData) => {
      dayState.replaceDay(data.currentDay);
      replaceHistory(data.history);
      updateSettings({ customActivities: data.customActivities, countOnlyTimers: data.countOnlyTimers });
    },
    [dayState.replaceDay, replaceHistory, updateSettings],
  );

  const { status: syncStatus, syncNow } = useCloudSync(
    settings.recoveryCode,
    {
      currentDay: dayState.day,
      history,
      customActivities: settings.customActivities,
      countOnlyTimers: settings.countOnlyTimers,
    },
    handleRemoteUpdate,
  );

  // Switches this device onto an existing session. Refuses a code with no
  // session behind it: switching anyway used to leave this device quietly
  // tracking into a brand-new empty session that nobody else could see.
  async function handleUseExistingCode(rawCode: string): Promise<boolean> {
    setRestoreError(null);
    const code = normalizeRecoveryCode(rawCode);
    if (!code) {
      setRestoreError('Enter a code first.');
      return false;
    }
    let remote: SyncedData | null;
    try {
      remote = await fetchSyncedData(code);
    } catch (err) {
      setRestoreError(describeJoinError(err));
      return false;
    }
    if (!remote) {
      setRestoreError(`No shared session found for ${code}. Double-check the code, or ask the other device to open the app once so it can sync.`);
      return false;
    }
    updateSettings({ recoveryCode: code, customActivities: remote.customActivities, countOnlyTimers: remote.countOnlyTimers });
    dayState.replaceDay(remote.currentDay);
    replaceHistory(remote.history);
    setScreen(remote.currentDay ? 'main' : 'startTime');
    return true;
  }

  function handleTap(type: ActivityType) {
    const activityKind = dayState.day?.logs[type].kind;
    if (activityKind === 'counter') {
      dayState.incrementCounter(type);
    } else if (activities.find((a) => a.type === type)?.countOnly) {
      if (dayState.day) dayState.replaceDay(logInstantSession(dayState.day, type, new Date().toISOString()));
    } else {
      dayState.toggleTimer(type);
    }
  }

  // One state update: yesterday is finished and filed into history, and today
  // starts at the wake time. Synced state never shows a half-finished night.
  function handleWakeConfirm(bedAt: string, targets: NightTargets) {
    const day = dayState.day;
    if (!day) return;
    const wakeAt = new Date().toISOString();
    const ended = endDay(applyNightCheckIn(day, bedAt, wakeAt, targets), wakeAt);
    const finished = { ...ended, report: generateOfflineReport(ended, activities), reportSource: 'offline' as const };
    addToHistory(finished);
    dayState.replaceDay(createEmptyDay(wakeAt, activities));
    setCheckInFor(null);
    setReportDayId(finished.startedAt);
    setAiError(null);
    setScreen('report');
  }

  async function handleGenerateAi() {
    if (!reportDay) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const text = await generateAiReport(reportDay, settings, activities);
      updateHistoryDay(reportDay.startedAt, (d) => ({ ...d, report: text, reportSource: 'ai' }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI report generation failed.');
    } finally {
      setAiLoading(false);
    }
  }

  // History/Settings are reachable both while a day is running and while
  // waiting to start the next one, so "back" from either needs to land on
  // whichever of those two screens is actually current.
  function backToTracker() {
    setScreen(dayState.day ? 'main' : 'startTime');
  }

  if (pendingJoin) {
    return (
      <JoinSessionDialog
        code={pendingJoin}
        error={restoreError}
        onJoin={async () => {
          if (await handleUseExistingCode(pendingJoin)) setPendingJoin(null);
        }}
        onCancel={() => {
          setRestoreError(null);
          setPendingJoin(null);
        }}
      />
    );
  }

  if (screen === 'recoveryCode') {
    return (
      <div>
        <RecoveryCodeStep
          recoveryCode={settings.recoveryCode}
          onContinueFresh={() => setScreen('startTime')}
          onUseExistingCode={handleUseExistingCode}
        />
        {restoreError && <p role="alert">{restoreError}</p>}
      </div>
    );
  }

  if (screen === 'startTime') {
    return (
      <div>
        <AppHeader
          recoveryCode={settings.recoveryCode}
          onSync={syncNow}
          onOpenHistory={() => setScreen('history')}
          onOpenSettings={() => setScreen('settings')}
        />
        <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt, activities); setScreen('main'); }} />
      </div>
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onUpdate={updateSettings}
        onClose={backToTracker}
        // No `backToTracker()` here: `handleUseExistingCode` owns the screen
        // transition on success and deliberately stays put on failure, so the
        // restore error below is actually visible where it was triggered.
        onEnterRecoveryCode={(code) => { void handleUseExistingCode(code); }}
        restoreError={restoreError}
        syncStatus={syncStatus}
      />
    );
  }

  if (screen === 'history') {
    return (
      <HistoryScreen
        history={history}
        onSelect={(day) => { setSelectedHistoryDay(day); setScreen('historyDetail'); }}
        onClose={backToTracker}
        onDelete={(day) => removeFromHistory(day.startedAt)}
      />
    );
  }

  if (screen === 'historyDetail' && selectedHistoryDay) {
    return <HistoryDetail day={selectedHistoryDay} activities={activities} onBack={() => setScreen('history')} />;
  }

  if (screen === 'report' && reportDay) {
    return (
      <ReportScreen
        day={reportDay}
        activities={activities}
        settings={settings}
        onGenerateAi={handleGenerateAi}
        aiLoading={aiLoading}
        aiError={aiError}
        onContinue={() => setScreen(dayState.day ? 'main' : 'startTime')}
      />
    );
  }

  if (dayState.day) {
    return (
      <div>
        <AppHeader
          recoveryCode={settings.recoveryCode}
          onSync={syncNow}
          onOpenHistory={() => setScreen('history')}
          onOpenSettings={() => setScreen('settings')}
        />
        <MainScreen
          day={dayState.day}
          activities={activities}
          onTap={handleTap}
          onEditCounter={dayState.setCounterEntries}
          onEditTimer={(type: ActivityType, sessions: TimerSession[], useTimer: boolean) => {
            dayState.setTimerSessions(type, sessions);
            const others = settings.countOnlyTimers.filter((t) => t !== type);
            updateSettings({ countOnlyTimers: useTimer ? others : [...others, type] });
          }}
          onGoToBed={() => dayState.day && dayState.replaceDay(goToBed(dayState.day, new Date().toISOString()))}
          onCancelBed={() => dayState.day && dayState.replaceDay(cancelBed(dayState.day))}
          onWakeUp={() => setCheckInFor(dayState.day?.startedAt ?? null)}
          predictionCard={<PredictionCard days={patternDays} />}
          onAddActivity={(activity: ActivityConfig) => {
            dayState.addActivity(activity);
            updateSettings({ customActivities: [...settings.customActivities, activity] });
          }}
          onDeleteActivity={(type: ActivityType) =>
            updateSettings({ customActivities: settings.customActivities.filter((a) => a.type !== type) })
          }
        />
        {checkInFor !== null && checkInFor === dayState.day.startedAt && (
          <NightCheckInDialog
            day={dayState.day}
            activities={activities}
            now={new Date().toISOString()}
            onConfirm={handleWakeConfirm}
            onCancel={() => setCheckInFor(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <AppHeader
        recoveryCode={settings.recoveryCode}
        onSync={syncNow}
        onOpenHistory={() => setScreen('history')}
        onOpenSettings={() => setScreen('settings')}
      />
      <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt, activities); setScreen('main'); }} />
    </div>
  );
}

export default App;
