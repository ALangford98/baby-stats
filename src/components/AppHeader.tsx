import { useEffect, useState } from 'react';
import { History, RefreshCw, Settings as SettingsIcon, Share2 } from 'lucide-react';
import type { SyncResult } from '../hooks/useCloudSync';
import { buildShareLink } from '../utils/recoveryCode';
import './AppHeader.css';

type AppHeaderProps = {
  recoveryCode: string;
  onSync: () => Promise<SyncResult>;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
};

export function AppHeader({ recoveryCode, onSync, onOpenHistory, onOpenSettings }: AppHeaderProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);

  async function handleSync() {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await onSync();
      setNotice(result.ok ? 'Synced' : 'Sync failed — see Settings');
    } finally {
      setSyncing(false);
    }
  }

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
      setNotice('Link copied');
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
        {notice && (
          <span className="app-header__status" role="status">
            {notice}
          </span>
        )}
        <button
          type="button"
          className="app-header__icon-button"
          aria-label="Sync now"
          onClick={() => void handleSync()}
          disabled={syncing}
        >
          <RefreshCw size={20} className={syncing ? 'app-header__spin' : undefined} />
        </button>
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
