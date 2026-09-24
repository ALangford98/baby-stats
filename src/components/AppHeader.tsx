import { useEffect, useState } from 'react';
import { History, Settings as SettingsIcon, Share2 } from 'lucide-react';
import { buildShareLink } from '../utils/recoveryCode';
import './AppHeader.css';

type AppHeaderProps = {
  recoveryCode: string;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
};

export function AppHeader({ recoveryCode, onOpenHistory, onOpenSettings }: AppHeaderProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleShare() {
    const url = buildShareLink(recoveryCode, window.location.href);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Baby Stats', text: 'Join my Baby Stats session', url });
        return;
      } catch (err) {
        // The user dismissing the share sheet is not a failure worth a fallback.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copy this link to share your session:', url);
    }
  }

  return (
    <header className="app-header">
      <button type="button" className="app-header__icon-button" aria-label="History" onClick={onOpenHistory}>
        <History size={20} />
      </button>
      <div className="app-header__actions">
        {copied && (
          <span className="app-header__status" role="status">
            Link copied
          </span>
        )}
        <button type="button" className="app-header__icon-button" aria-label="Share session" onClick={() => void handleShare()}>
          <Share2 size={20} />
        </button>
        <button type="button" className="app-header__icon-button" aria-label="Settings" onClick={onOpenSettings}>
          <SettingsIcon size={20} />
        </button>
      </div>
    </header>
  );
}
