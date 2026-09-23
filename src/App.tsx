import { useState } from 'react';
import type { ActivityType, Day, TimerSession } from './types';
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
import { fetchSyncedData } from './storage/firebaseSync';

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
  const [consent, setConsent] = useState<'pending' | 'granted' | 'declined'>('pending');

  if (consent === 'pending') {
    return <ConsentModal onAccept={() => setConsent('granted')} onDecline={() => setConsent('declined')} />;
  }

  if (consent === 'declined') {
    return <p>Not tracking. Nothing has been saved.</p>;
  }

  return <Tracker />;
}

function Tracker() {
  const dayState = useDayState();
  const [screen, setScreen] = useState<Screen>(() => (dayState.day ? 'main' : 'recoveryCode'));
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<Day | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const { settings, updateSettings } = useSettings();
  const { history, addToHistory, replaceHistory } = useHistory();

  useCloudSync(settings.recoveryCode, dayState.day, history);

  async function handleUseExistingCode(code: string) {
    setRestoreError(null);
    try {
      const remote = await fetchSyncedData(code);
      updateSettings({ recoveryCode: code });
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
    dayState.setDayReport(generateOfflineReport(ended), 'offline');
    setAiError(null);
    setScreen('report');
  }

  async function handleGenerateAi() {
    if (!dayState.day) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const text = await generateAiReport(dayState.day, settings);
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
        <button type="button" onClick={() => setScreen('history')}>History</button>
        <button type="button" onClick={() => setScreen('settings')}>Settings</button>
        <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt); setScreen('main'); }} />
      </div>
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onUpdate={updateSettings}
        onClose={backToTracker}
        onEnterRecoveryCode={(code) => { handleUseExistingCode(code); backToTracker(); }}
      />
    );
  }

  if (screen === 'history') {
    return (
      <HistoryScreen
        history={history}
        onSelect={(day) => { setSelectedHistoryDay(day); setScreen('historyDetail'); }}
        onClose={backToTracker}
      />
    );
  }

  if (screen === 'historyDetail' && selectedHistoryDay) {
    return <HistoryDetail day={selectedHistoryDay} onBack={() => setScreen('history')} />;
  }

  if (screen === 'report' && dayState.day) {
    return (
      <ReportScreen
        day={dayState.day}
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
        <button type="button" onClick={() => setScreen('history')}>History</button>
        <button type="button" onClick={() => setScreen('settings')}>Settings</button>
        <MainScreen
          day={dayState.day}
          onTap={handleTap}
          onEditCounter={dayState.setCounterCount}
          onEditTimer={(type: ActivityType, sessions: TimerSession[]) => dayState.setTimerSessions(type, sessions)}
          onEndDay={handleEndDay}
        />
      </div>
    );
  }

  return <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt); setScreen('main'); }} />;
}

export default App;
