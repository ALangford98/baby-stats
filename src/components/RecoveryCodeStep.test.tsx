import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryCodeStep } from './RecoveryCodeStep';

describe('RecoveryCodeStep', () => {
  it('shows the generated recovery code and continues fresh', async () => {
    const onContinueFresh = vi.fn();
    render(
      <RecoveryCodeStep recoveryCode="ABCD123456" onContinueFresh={onContinueFresh} onUseExistingCode={vi.fn()} />,
    );

    expect(screen.getByText('ABCD123456')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinueFresh).toHaveBeenCalledTimes(1);
  });

  it('lets the user switch to entering an existing code', async () => {
    const onUseExistingCode = vi.fn();
    render(
      <RecoveryCodeStep recoveryCode="ABCD123456" onContinueFresh={vi.fn()} onUseExistingCode={onUseExistingCode} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /already have a code/i }));
    await userEvent.type(screen.getByLabelText(/recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /submit|use this code/i }));

    expect(onUseExistingCode).toHaveBeenCalledWith('ZZZZ999999');
  });
});
