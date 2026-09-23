import { useState } from 'react';

type StartTimeModalProps = {
  defaultTime: string; // ISO
  onConfirm: (startedAt: string) => void;
};

export function StartTimeModal({ defaultTime, onConfirm }: StartTimeModalProps) {
  const initialValue = defaultTime.slice(0, 16);
  const [value, setValue] = useState(initialValue);

  const handleConfirm = () => {
    if (value === initialValue) {
      onConfirm(defaultTime);
    } else {
      onConfirm(new Date(value).toISOString());
    }
  };

  return (
    <div>
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
    </div>
  );
}
