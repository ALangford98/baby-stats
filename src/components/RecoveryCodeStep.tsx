import { useState } from 'react';

type RecoveryCodeStepProps = {
  recoveryCode: string;
  onContinueFresh: () => void;
  onUseExistingCode: (code: string) => void;
};

export function RecoveryCodeStep({ recoveryCode, onContinueFresh, onUseExistingCode }: RecoveryCodeStepProps) {
  const [showEntry, setShowEntry] = useState(false);
  const [entered, setEntered] = useState('');

  if (showEntry) {
    return (
      <div>
        <label htmlFor="recovery-code-input">Recovery code</label>
        <input id="recovery-code-input" value={entered} onChange={(e) => setEntered(e.target.value)} />
        <button type="button" onClick={() => onUseExistingCode(entered.trim())}>
          Use this code
        </button>
        <button type="button" onClick={() => setShowEntry(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>Your recovery code:</p>
      <strong>{recoveryCode}</strong>
      <p>Save this to restore your data on another device. Don't share it — anyone with this code can access your data.</p>
      <button type="button" onClick={onContinueFresh}>
        Continue
      </button>
      <button type="button" onClick={() => setShowEntry(true)}>
        I already have a code
      </button>
    </div>
  );
}
