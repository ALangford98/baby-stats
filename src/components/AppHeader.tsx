import { History, Settings as SettingsIcon } from 'lucide-react';
import './AppHeader.css';

type AppHeaderProps = {
  recoveryCode: string;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
};

export function AppHeader({ recoveryCode, onOpenHistory, onOpenSettings }: AppHeaderProps) {
  return (
    <header className="app-header">
      <button type="button" className="app-header__icon-button" aria-label="History" onClick={onOpenHistory}>
        <History size={20} />
      </button>
      <div className="app-header__code-group">
        <span className="app-header__code">{recoveryCode}</span>
        <button type="button" className="app-header__icon-button" aria-label="Settings" onClick={onOpenSettings}>
          <SettingsIcon size={20} />
        </button>
      </div>
    </header>
  );
}
