import type { Day, Settings } from '../types';
import { buildPromptText, buildStatsSummary } from '../domain/reportText';
import './ReportScreen.css';

type ReportScreenProps = {
  day: Day;
  settings: Settings;
  onGenerateAi: () => void;
  aiLoading: boolean;
  aiError: string | null;
  onContinue: () => void;
};

export function ReportScreen({ day, settings, onGenerateAi, aiLoading, aiError, onContinue }: ReportScreenProps) {
  const hasLlmKey = Boolean(settings.llmProvider && settings.llmApiKey);

  return (
    <div>
      <pre className="report-stats">{buildStatsSummary(day)}</pre>
      <p className="report-text">{day.report}</p>
      {aiError && <p role="alert">{aiError}</p>}
      {hasLlmKey && (
        <button type="button" onClick={onGenerateAi} disabled={aiLoading}>
          {aiLoading ? 'Generating…' : 'Generate with AI'}
        </button>
      )}
      <button type="button" onClick={() => navigator.clipboard.writeText(buildPromptText(day))}>
        Copy Prompt
      </button>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
