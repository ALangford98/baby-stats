import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { CounterLog } from '../types';

type EditCounterModalProps = {
  config: ActivityConfig;
  log: CounterLog;
  onSave: (count: number) => void;
  onClose: () => void;
};

export function EditCounterModal({ config, log, onSave, onClose }: EditCounterModalProps) {
  const [value, setValue] = useState(String(log.count));

  return (
    <div role="dialog" aria-label={`Edit ${config.label}`}>
      <label htmlFor="counter-input">{config.label} count</label>
      <input
        id="counter-input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => onSave(Math.max(0, Number(value) || 0))}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
