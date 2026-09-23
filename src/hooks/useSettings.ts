import { useCallback, useState } from 'react';
import type { Settings } from '../types';
import { loadSettings, saveSettings } from '../storage/localStorage';
import { generateRecoveryCode } from '../utils/recoveryCode';

function loadOrCreateSettings(): Settings {
  const existing = loadSettings();
  if (existing) return existing;
  const fresh: Settings = { recoveryCode: generateRecoveryCode(), llmProvider: null, llmApiKey: null };
  saveSettings(fresh);
  return fresh;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadOrCreateSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
