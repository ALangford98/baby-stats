import { useCallback, useMemo, useState } from 'react';
import type { ActivityConfig, ActivityType, Day, TimerSession } from './types';
import { combineActivities } from './activities';
import { AppHeader } from './components/AppHeader';
import { ConsentModal } from './components/ConsentModal';
import { RecoveryCodeStep } from './components/RecoveryCodeStep';
import { StartTimeModal } from './components/StartTimeModal';
import { MainScreen } from './components/MainScreen';
import { ReportScreen } from './components/ReportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { HistoryDetail } from './components/HistoryDetail';
import { SettingsScreen } from './components/SettingsScreen';
import { useDayState } from './hooks/useDayState';
import { useSettings } from './hooks/useSettings';
import { useHistory } from './hooks/useHistory';
import { useCloudSync } from './hooks/useCloudSync';
import { generateOfflineReport } from './domain/reportText';
import { generateAiReport } from './domain/aiReport';
import { fetchSyncedData, type SyncedData } from './storage/firebaseSync';
import { loadSettings } from './storage/localStorage';

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
  const { history, addToHistory, replaceHistory, removeFromHistory } = useHistory();

  const activities = useMemo(() => combineActivities(settings.customActivities), [settings.customActivities]);

  // Applies a change that arrived from another device using the same
  // recovery code (e.g. the other parent's phone). Kept stable via
  // useCallback so the listener in useCloudSync only resubscribes when the
  // recovery code itself changes, not on every local edit.
  const handleRemoteUpdate = useCallback(
    (data: SyncedData) => {
      dayState.replaceDay(data.currentDay);
      replaceHistory(data.history);
      updateSettings({ customActivities: data.customActivities });
    },
    [dayState.replaceDay, replaceHistory, updateSettings],
  );

  useCloudSync(settings.recoveryCode, dayState.day, history, settings.customActivities, handleRemoteUpdate);

  async function handleUseExistingCode(code: string) {
    setRestoreError(null);
    try {
      const remote = await fetchSyncedData(code);
      updateSettings(remote ? { recoveryCode: code, customActivities: remote.customActivities } : { recoveryCode: code });
      if (remote) {
        dayState.replaceDay(remote.currentDay);
        replaceHistory(remote.history);
      }
      setScreen(dayState.day || remote?.currentDay ? 'main' : 'startTime');
    } catch {
      setRestoreError('Could not reach that recovery code right now. Check the code and your connection, or continue fresh.');
    }
  }

  function handleTap(type: ActivityType) {
    const activityKind = dayState.day?.logs[type].kind;
    if (activityKind === 'counter') {
      dayState.incrementCounter(type);
    } else {
      dayState.toggleTimer(type);
    }
  }

  function handleEndDay() {
    const ended = dayState.finishDay();
    // One write, not two: `setDayReport` closes over the pre-`finishDay` `day`,
    // so calling it here would persist a stale copy over what `finishDay` just
    // saved — losing `endedAt` and the closed timer sessions on disk.
    dayState.replaceDay({ ...ended, report: generateOfflineReport(ended, activities), reportSource: 'offline' });
    setAiError(null);
    setScreen('report');
  }

  async function handleGenerateAi() {
    if (!dayState.day) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const text = await generateAiReport(dayState.day, settings, activities);
      dayState.setDayReport(text, 'ai');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI report generation failed.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleContinueFromReport() {
    if (dayState.day) addToHistory(dayState.day);
    dayState.clearDay();
    setScreen('startTime');
  }

  // History/Settings are reachable both while a day is running and while
  // waiting to start the next one, so "back" from either needs to land on
  // whichever of those two screens is actually current.
  function backToTracker() {
    setScreen(dayState.day ? 'main' : 'startTime');
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

  if (screen === 'report' && dayState.day) {
    return (
      <ReportScreen
        day={dayState.day}
        activities={activities}
        settings={settings}
        onGenerateAi={handleGenerateAi}
        aiLoading={aiLoading}
        aiError={aiError}
        onContinue={handleContinueFromReport}
      />
    );
  }

  if (dayState.day) {
    return (
      <div>
        <AppHeader
          recoveryCode={settings.recoveryCode}
          onOpenHistory={() => setScreen('history')}
          onOpenSettings={() => setScreen('settings')}
        />
        <MainScreen
          day={dayState.day}
          activities={activities}
          onTap={handleTap}
          onEditCounter={dayState.setCounterCount}
          onEditTimer={(type: ActivityType, sessions: TimerSession[]) => dayState.setTimerSessions(type, sessions)}
          onEndDay={handleEndDay}
          onAddActivity={(activity: ActivityConfig) => {
            dayState.addActivity(activity);
            updateSettings({ customActivities: [...settings.customActivities, activity] });
          }}
          onDeleteActivity={(type: ActivityType) =>
            updateSettings({ customActivities: settings.customActivities.filter((a) => a.type !== type) })
          }
        />
      </div>
    );
  }

  return (
    <div>
      <AppHeader
        recoveryCode={settings.recoveryCode}
        onOpenHistory={() => setScreen('history')}
        onOpenSettings={() => setScreen('settings')}
      />
      <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt, activities); setScreen('main'); }} />
    </div>
  );
}

export default App;
