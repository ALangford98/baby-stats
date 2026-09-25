import { useState } from 'react';
import type { ActivityConfig, ActivityType, CounterEntry, CounterLog, Day, TimerLog, TimerSession } from '../types';
import { AddActivityButton } from './AddActivityButton';
import { AddActivityDialog } from './AddActivityDialog';
import { ActivityButton } from './ActivityButton';
import { EditCounterModal } from './EditCounterModal';
import { EditTimerModal } from './EditTimerModal';
import './MainScreen.css';

type MainScreenProps = {
  day: Day;
  activities: ActivityConfig[];
  onTap: (type: ActivityType) => void;
  onEditCounter: (type: ActivityType, entries: CounterEntry[]) => void;
  onEditTimer: (type: ActivityType, sessions: TimerSession[], useTimer: boolean) => void;
  onGoToBed: () => void;
  onCancelBed: () => void;
  onWakeUp: () => void;
  onAddActivity: (activity: ActivityConfig) => void;
  onDeleteActivity: (type: ActivityType) => void;
};

export function MainScreen({
  day,
  activities,
  onTap,
  onEditCounter,
  onEditTimer,
  onGoToBed,
  onCancelBed,
  onWakeUp,
  onAddActivity,
  onDeleteActivity,
}: MainScreenProps) {
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [addingActivity, setAddingActivity] = useState(false);
  const editingConfig = activities.find((a) => a.type === editingType) ?? null;
  const editingLog = editingType ? day.logs[editingType] : null;
  const isCustom = (type: ActivityType) => type.startsWith('custom-');

  return (
    <div className={day.bedAt ? 'main-screen main-screen--night' : 'main-screen'}>
      <div className="main-screen__grid">
        {activities
          // An activity config can briefly have no log on the current day
          // (e.g. mid-sync, before the two settle together) — skip it rather
          // than render a button with nothing to show or act on.
          .filter((activity) => day.logs[activity.type] !== undefined)
          .map((activity) => (
            <ActivityButton
              key={activity.type}
              config={activity}
              log={day.logs[activity.type]}
              onTap={() => onTap(activity.type)}
              onEdit={() => setEditingType(activity.type)}
            />
          ))}
        <AddActivityButton onClick={() => setAddingActivity(true)} />
      </div>
      <div className="main-screen__footer">
        {day.bedAt ? (
          <>
            <button type="button" className="main-screen__primary" onClick={onWakeUp}>
              Woke Up
            </button>
            <button type="button" className="main-screen__secondary" onClick={onCancelBed}>
              Not going to bed yet
            </button>
          </>
        ) : (
          <>
            <button type="button" className="main-screen__primary" onClick={onGoToBed}>
              Gone to Bed
            </button>
            <button type="button" className="main-screen__secondary" onClick={onWakeUp}>
              Woke Up
            </button>
          </>
        )}
      </div>
      {editingConfig && editingLog?.kind === 'counter' && (
        <EditCounterModal
          config={editingConfig}
          log={editingLog as CounterLog}
          onSave={(entries) => {
            onEditCounter(editingConfig.type, entries);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
          onDelete={
            isCustom(editingConfig.type)
              ? () => {
                  onDeleteActivity(editingConfig.type);
                  setEditingType(null);
                }
              : undefined
          }
        />
      )}
      {editingConfig && editingLog?.kind === 'timer' && (
        <EditTimerModal
          config={editingConfig}
          log={editingLog as TimerLog}
          onSave={(sessions, useTimer) => {
            onEditTimer(editingConfig.type, sessions, useTimer);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
          onDelete={
            isCustom(editingConfig.type)
              ? () => {
                  onDeleteActivity(editingConfig.type);
                  setEditingType(null);
                }
              : undefined
          }
        />
      )}
      {addingActivity && (
        <AddActivityDialog
          onAdd={(activity) => {
            onAddActivity(activity);
            setAddingActivity(false);
          }}
          onClose={() => setAddingActivity(false)}
        />
      )}
    </div>
  );
}
