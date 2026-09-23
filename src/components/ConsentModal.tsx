type ConsentModalProps = {
  onAccept: () => void;
  onDecline: () => void;
};

export function ConsentModal({ onAccept, onDecline }: ConsentModalProps) {
  return (
    <div role="dialog" aria-label="Consent">
      <p>
        This app tracks your baby's stats on this device, and can optionally sync to the cloud
        with a recovery code — no account needed. Is that OK?
      </p>
      <button type="button" onClick={onAccept}>
        Yes, OK
      </button>
      <button type="button" onClick={onDecline}>
        No, decline
      </button>
    </div>
  );
}
