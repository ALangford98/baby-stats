import { useState } from 'react';
import { ICON_OPTIONS } from '../activities';
import type { ActivityConfig, ActivityKind, IconName } from '../types';
import { generateActivityId } from '../utils/activityId';
import { Dialog } from './Dialog';
import { ICONS } from './icons';
import './AddActivityDialog.css';

type AddActivityDialogProps = {
  onAdd: (activity: ActivityConfig) => void;
  onClose: () => void;
};

export function AddActivityDialog({ onAdd, onClose }: AddActivityDialogProps) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ActivityKind>('counter');
  const [icon, setIcon] = useState<IconName>(ICON_OPTIONS[0]);

  function handleSave() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ type: generateActivityId(), label: trimmed, kind, icon });
  }

  return (
    <Dialog label="Add activity" onClose={onClose}>
      <label htmlFor="add-activity-label">Label</label>
      <input id="add-activity-label" value={label} onChange={(e) => setLabel(e.target.value)} />

      <fieldset className="add-activity-dialog__kind">
        <legend>Function</legend>
        <label>
          <input
            type="radio"
            name="add-activity-kind"
            value="counter"
            checked={kind === 'counter'}
            onChange={() => setKind('counter')}
          />
          Counter
        </label>
        <label>
          <input
            type="radio"
            name="add-activity-kind"
            value="timer"
            checked={kind === 'timer'}
            onChange={() => setKind('timer')}
          />
          Timer
        </label>
      </fieldset>

      <div className="add-activity-dialog__icons">
        {ICON_OPTIONS.map((option) => {
          const OptionIcon = ICONS[option];
          return (
            <button
              type="button"
              key={option}
              aria-label={option}
              className={`add-activity-dialog__icon-button${icon === option ? ' add-activity-dialog__icon-button--selected' : ''}`}
              onClick={() => setIcon(option)}
            >
              <OptionIcon size={20} />
            </button>
          );
        })}
      </div>

      <button type="button" onClick={handleSave}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </Dialog>
  );
}
