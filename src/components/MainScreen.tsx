import { useState } from 'react';
import { ACTIVITIES } from '../activities';
import type { ActivityType, CounterLog, Day, TimerLog, TimerSession } from '../types';
import { ActivityButton } from './ActivityButton';
import { EditCounterModal } from './EditCounterModal';
import { EditTimerModal } from './EditTimerModal';
import './MainScreen.css';

type MainScreenProps = {
  day: Day;
  onTap: (type: ActivityType) => void;
  onEditCounter: (type: ActivityType, count: number) => void;
  onEditTimer: (type: ActivityType, sessions: TimerSession[]) => void;
  onEndDay: () => void;
};

export function MainScreen({ day, onTap, onEditCounter, onEditTimer, onEndDay }: MainScreenProps) {
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const editingConfig = ACTIVITIES.find((a) => a.type === editingType) ?? null;
  const editingLog = editingType ? day.logs[editingType] : null;

  return (
    <div>
      <div className="main-screen__grid">
        {ACTIVITIES.map((activity) => (
          <ActivityButton
            key={activity.type}
            config={activity}
            log={day.logs[activity.type]}
            onTap={() => onTap(activity.type)}
            onEdit={() => setEditingType(activity.type)}
          />
        ))}
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
        />
      )}
      {editingConfig && editingLog?.kind === 'timer' && (
        <EditTimerModal
          config={editingConfig}
          log={editingLog as TimerLog}
          onSave={(sessions) => {
            onEditTimer(editingConfig.type, sessions);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
        />
      )}
    </div>
  );
}
