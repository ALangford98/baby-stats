import { useEffect, type ReactNode } from 'react';
import './Dialog.css';

type DialogProps = {
  label: string;
  onClose?: () => void;
  children: ReactNode;
};

export function Dialog({ label, onClose, children }: DialogProps) {
  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose!();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay" data-testid="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
