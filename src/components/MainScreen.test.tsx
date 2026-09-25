import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MainScreen } from './MainScreen';
import { createEmptyDay, incrementCounter } from '../domain/day';
import { ACTIVITIES, combineActivities } from '../activities';

describe('MainScreen', () => {
  it('renders all seven activity buttons and an End Day button', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    render(
      <MainScreen
        day={day}
        activities={ACTIVITIES}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^crying fit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end day/i })).toBeInTheDocument();
  });

  it('calls onTap with the right activity type when a button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    const onTap = vi.fn();
    render(
      <MainScreen
        day={day}
        activities={ACTIVITIES}
        onTap={onTap}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^heavy diaper$/i }));
    expect(onTap).toHaveBeenCalledWith('heavyDiaper');
  });

  it('opens the counter edit modal and forwards the saved value', async () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    day = incrementCounter(day, 'spitUp');
    const onEditCounter = vi.fn();
    render(
      <MainScreen
        day={day}
        activities={ACTIVITIES}
        onTap={vi.fn()}
        onEditCounter={onEditCounter}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /edit spit up/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEditCounter).toHaveBeenCalledWith('spitUp', [{ kind: 'exact', at: expect.any(String) }]);
  });

  it('calls onEndDay when the End Day button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    const onEndDay = vi.fn();
    render(
      <MainScreen
        day={day}
        activities={ACTIVITIES}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={onEndDay}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));
    expect(onEndDay).toHaveBeenCalledTimes(1);
  });
});

describe('MainScreen: custom activities', () => {
  it('renders a custom activity button using the activities prop, not just the built-ins', () => {
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    let day = createEmptyDay('2026-09-23T08:00:00.000Z', combineActivities([custom]));
    render(
      <MainScreen
        day={day}
        activities={combineActivities([custom])}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /^tummy medicine$/i })).toBeInTheDocument();
  });

  it('opens the add-activity dialog from the + tile and forwards the new activity', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    const onAddActivity = vi.fn();
    render(
      <MainScreen
        day={day}
        activities={ACTIVITIES}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={onAddActivity}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    await userEvent.type(screen.getByLabelText(/label/i), 'Tummy medicine');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAddActivity).toHaveBeenCalledTimes(1);
    expect(onAddActivity.mock.calls[0][0].label).toBe('Tummy medicine');
  });

  it('offers a delete action only for a custom activity\'s edit modal, not a built-in one', async () => {
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const activities = combineActivities([custom]);
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', activities);

    render(
      <MainScreen
        day={day}
        activities={activities}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^edit light diaper$/i }));
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await userEvent.click(screen.getByRole('button', { name: /^edit tummy medicine$/i }));
    expect(screen.getByRole('button', { name: /delete this button/i })).toBeInTheDocument();
  });

  it('deleting a custom activity from its edit modal closes the modal and calls onDeleteActivity', async () => {
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const activities = combineActivities([custom]);
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', activities);
    const onDeleteActivity = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MainScreen
        day={day}
        activities={activities}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={onDeleteActivity}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^edit tummy medicine$/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDeleteActivity).toHaveBeenCalledWith('custom-abc12345');
    expect(screen.queryByRole('dialog', { name: /^edit tummy medicine$/i })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('does not crash when an activity config has no matching log on the current day', () => {
    // Can happen when a device's settings and its current day briefly
    // disagree (e.g. mid-sync) — the day simply has nothing to show yet
    // for that activity, so it's skipped rather than crashing the screen.
    const custom = { type: 'custom-orphan1', label: 'Orphan', kind: 'counter' as const, icon: 'Pill' as const };
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES); // day has no log for `custom`
    const activities = combineActivities([custom]); // but the activities list includes it

    render(
      <MainScreen
        day={day}
        activities={activities}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^orphan$/i })).not.toBeInTheDocument();
  });
});
