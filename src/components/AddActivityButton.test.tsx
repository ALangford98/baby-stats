import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddActivityButton } from './AddActivityButton';

describe('AddActivityButton', () => {
  it('renders a labeled "Add activity" button and calls onClick when tapped', async () => {
    const onClick = vi.fn();
    render(<AddActivityButton onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
