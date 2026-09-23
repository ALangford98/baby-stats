import type { Day } from '../types';
import { buildStatsSummary } from '../domain/reportText';
import './ReportScreen.css';

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
      <pre className="report-stats">{buildStatsSummary(day)}</pre>
      <p className="report-text">{day.report}</p>
    </div>
  );
}
