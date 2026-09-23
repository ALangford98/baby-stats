import type { Day } from '../types';
import { buildStatsSummary } from '../domain/reportText';

type HistoryDetailProps = {
  day: Day;
  onBack: () => void;
};

export function HistoryDetail({ day, onBack }: HistoryDetailProps) {
  return (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <p>{day.report}</p>
      <pre>{buildStatsSummary(day)}</pre>
    </div>
  );
}
