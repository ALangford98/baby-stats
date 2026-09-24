import { useState } from 'react';
import { Dialog } from './Dialog';

type JoinSessionDialogProps = {
  code: string;
  error: string | null;
  onJoin: () => Promise<void>;
  onCancel: () => void;
};

export function JoinSessionDialog({ code, error, onJoin, onCancel }: JoinSessionDialogProps) {
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    setJoining(true);
    try {
      await onJoin();
    } finally {
      setJoining(false);
    }
  }

  return (
    <Dialog label="Join shared session">
      <p>You've been invited to a shared session:</p>
      <strong>{code}</strong>
      <p>Joining replaces the data on this device with the shared session's data.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void handleJoin()} disabled={joining}>
        {joining ? 'Joining…' : 'Join'}
      </button>
      <button type="button" onClick={onCancel} disabled={joining}>
        Not now
      </button>
    </Dialog>
  );
}
