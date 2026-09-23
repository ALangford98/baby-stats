import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportScreen } from './ReportScreen';
import { createEmptyDay } from '../domain/day';
import type { Settings } from '../types';

const baseDay = { ...createEmptyDay('2026-09-23T08:00:00.000Z'), endedAt: '2026-09-23T20:00:00.000Z', report: 'Offline report text', reportSource: 'offline' as const };

const settingsNoKey: Settings = { recoveryCode: 'X', llmProvider: null, llmApiKey: null };
const settingsWithKey: Settings = { recoveryCode: 'X', llmProvider: 'anthropic', llmApiKey: 'sk-test' };

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('ReportScreen', () => {
  it('shows the current report text', () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    expect(screen.getByText('Offline report text')).toBeInTheDocument();
  });

  it('shows the stats summary before the report text', () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    const statsText = screen.getByText(/light diaper: 0/i);
    const reportText = screen.getByText('Offline report text');
    expect(statsText.compareDocumentPosition(reportText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the "Generate with AI" button when no LLM key is configured', () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /generate with ai/i })).not.toBeInTheDocument();
  });

  it('shows the "Generate with AI" button and calls onGenerateAi when a key is configured', async () => {
    const onGenerateAi = vi.fn();
    render(<ReportScreen day={baseDay} settings={settingsWithKey} onGenerateAi={onGenerateAi} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /generate with ai/i }));
    expect(onGenerateAi).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the offline report and an error message if AI generation failed', () => {
    render(<ReportScreen day={baseDay} settings={settingsWithKey} onGenerateAi={vi.fn()} aiLoading={false} aiError="Anthropic API error: 401" onContinue={vi.fn()} />);
    expect(screen.getByText('Offline report text')).toBeInTheDocument();
    expect(screen.getByText(/anthropic api error: 401/i)).toBeInTheDocument();
  });

  it('copies the prompt text to the clipboard when "Copy Prompt" is tapped', async () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /copy prompt/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect((navigator.clipboard.writeText as any).mock.calls[0][0]).toContain('Light Diaper: 0');
  });

  it('calls onContinue when the user is done reviewing', async () => {
    const onContinue = vi.fn();
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('button', { name: /continue|done|save/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
