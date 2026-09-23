import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MainScreen } from './MainScreen';
import { createEmptyDay, incrementCounter } from '../domain/day';

describe('MainScreen', () => {
  it('renders all seven activity buttons and an End Day button', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    render(<MainScreen day={day} onTap={vi.fn()} onEditCounter={vi.fn()} onEditTimer={vi.fn()} onEndDay={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^crying fit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end day/i })).toBeInTheDocument();
  });

  it('calls onTap with the right activity type when a button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onTap = vi.fn();
    render(<MainScreen day={day} onTap={onTap} onEditCounter={vi.fn()} onEditTimer={vi.fn()} onEndDay={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /^heavy diaper$/i }));
    expect(onTap).toHaveBeenCalledWith('heavyDiaper');
  });

  it('opens the counter edit modal and forwards the saved value', async () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z');
    day = incrementCounter(day, 'spitUp');
    const onEditCounter = vi.fn();
    render(<MainScreen day={day} onTap={vi.fn()} onEditCounter={onEditCounter} onEditTimer={vi.fn()} onEndDay={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /edit spit up/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEditCounter).toHaveBeenCalledWith('spitUp', 1);
  });

  it('calls onEndDay when the End Day button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onEndDay = vi.fn();
    render(<MainScreen day={day} onTap={vi.fn()} onEditCounter={vi.fn()} onEditTimer={vi.fn()} onEndDay={onEndDay} />);

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));
    expect(onEndDay).toHaveBeenCalledTimes(1);
  });
});
