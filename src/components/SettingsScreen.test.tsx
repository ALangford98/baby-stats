import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from './SettingsScreen';
import type { Settings } from '../types';

const settings: Settings = { recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null };

describe('SettingsScreen', () => {
  it('shows the recovery code', () => {
    render(<SettingsScreen settings={settings} onUpdate={vi.fn()} onClose={vi.fn()} onEnterRecoveryCode={vi.fn()} />);
    expect(screen.getByText('ABCD123456')).toBeInTheDocument();
  });

  it('updates the provider and API key', async () => {
    const onUpdate = vi.fn();
    render(<SettingsScreen settings={settings} onUpdate={onUpdate} onClose={vi.fn()} onEnterRecoveryCode={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText(/provider/i), 'openai');
    expect(onUpdate).toHaveBeenCalledWith({ llmProvider: 'openai' });

    await userEvent.type(screen.getByLabelText(/api key/i), 'sk-test');
    expect(onUpdate).toHaveBeenCalledWith({ llmApiKey: 'sk-test' });
  });

  it('submits a manually entered recovery code', async () => {
    const onEnterRecoveryCode = vi.fn();
    render(<SettingsScreen settings={settings} onUpdate={vi.fn()} onClose={vi.fn()} onEnterRecoveryCode={onEnterRecoveryCode} />);

    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    expect(onEnterRecoveryCode).toHaveBeenCalledWith('ZZZZ999999');
  });

  it('shows a restore error when one is passed in', () => {
    render(
      <SettingsScreen
        settings={settings}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
        onEnterRecoveryCode={vi.fn()}
        restoreError="Could not reach that recovery code right now."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach that recovery code/i);
  });

  it('shows no alert when there is no restore error', () => {
    render(<SettingsScreen settings={settings} onUpdate={vi.fn()} onClose={vi.fn()} onEnterRecoveryCode={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
