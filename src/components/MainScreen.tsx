import { useState } from 'react';
import type { ActivityConfig, ActivityType, CounterLog, Day, TimerLog, TimerSession } from '../types';
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
  onEditCounter: (type: ActivityType, count: number) => void;
  onEditTimer: (type: ActivityType, sessions: TimerSession[], useTimer: boolean) => void;
  onEndDay: () => void;
  onAddActivity: (activity: ActivityConfig) => void;
  onDeleteActivity: (type: ActivityType) => void;
};

export function MainScreen({
  day,
  activities,
  onTap,
  onEditCounter,
  onEditTimer,
  onEndDay,
  onAddActivity,
  onDeleteActivity,
}: MainScreenProps) {
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [addingActivity, setAddingActivity] = useState(false);
  const editingConfig = activities.find((a) => a.type === editingType) ?? null;
  const editingLog = editingType ? day.logs[editingType] : null;
  const isCustom = (type: ActivityType) => type.startsWith('custom-');

  return (
    <div>
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
      <button type="button" className="main-screen__end-day" onClick={onEndDay}>
        End Day
      </button>
      {editingConfig && editingLog?.kind === 'counter' && (
        <EditCounterModal
          config={editingConfig}
          log={editingLog as CounterLog}
          onSave={(count) => {
            onEditCounter(editingConfig.type, count);
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
