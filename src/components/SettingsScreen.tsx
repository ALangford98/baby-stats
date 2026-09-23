import { useEffect, useState } from 'react';
import type { LlmProvider, Settings } from '../types';
import { Dialog } from './Dialog';

type SettingsScreenProps = {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onEnterRecoveryCode: (code: string) => void;
  restoreError?: string | null;
};

export function SettingsScreen({ settings, onUpdate, onClose, onEnterRecoveryCode, restoreError }: SettingsScreenProps) {
  const [newCode, setNewCode] = useState('');
  const [apiKey, setApiKey] = useState(settings.llmApiKey ?? '');

  useEffect(() => {
    setApiKey(settings.llmApiKey ?? '');
  }, [settings.llmApiKey]);

  return (
    <Dialog label="Settings" onClose={onClose}>
      <button type="button" onClick={onClose}>
        Close
      </button>

      <p>Your recovery code:</p>
      <strong>{settings.recoveryCode}</strong>

      <label htmlFor="provider-select">LLM provider</label>
      <select
        id="provider-select"
        value={settings.llmProvider ?? ''}
        onChange={(e) => onUpdate({ llmProvider: (e.target.value || null) as LlmProvider | null })}
      >
        <option value="">None</option>
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
      </select>

      <label htmlFor="api-key-input">API key</label>
      <input
        id="api-key-input"
        type="password"
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          onUpdate({ llmApiKey: e.target.value || null });
        }}
      />

      <label htmlFor="new-code-input">Enter a different recovery code</label>
      <input id="new-code-input" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
      <button type="button" onClick={() => onEnterRecoveryCode(newCode.trim())}>
        Switch code
      </button>
      {restoreError && <p role="alert">{restoreError}</p>}
    </Dialog>
  );
}
