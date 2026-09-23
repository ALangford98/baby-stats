import { useState } from 'react';
import { fromLocalInputValue, toLocalInputValue } from '../utils/time';
import { Dialog } from './Dialog';

type StartTimeModalProps = {
  defaultTime: string; // ISO
  onConfirm: (startedAt: string) => void;
};

export function StartTimeModal({ defaultTime, onConfirm }: StartTimeModalProps) {
  const initialValue = toLocalInputValue(defaultTime);
  const [value, setValue] = useState(initialValue);

  const handleConfirm = () => {
    // An untouched input still confirms the exact `defaultTime`: the input only
    // has minute resolution, so re-parsing it would silently drop the seconds
    // and milliseconds of the "now" the caller handed us.
    if (value === initialValue) {
      onConfirm(defaultTime);
    } else {
      onConfirm(fromLocalInputValue(value));
    }
  };

  return (
    <Dialog label="New day">
      <label htmlFor="start-time-input">Start time</label>
      <input
        id="start-time-input"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={handleConfirm}>
        Confirm
      </button>
    </Dialog>
  );
}
