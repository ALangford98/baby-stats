import type { ActivityConfig, Day } from '../types';
import { buildStatsSummary } from '../domain/reportText';
import './ReportScreen.css';

type HistoryDetailProps = {
  day: Day;
  activities: ActivityConfig[];
  onBack: () => void;
};

export function HistoryDetail({ day, activities, onBack }: HistoryDetailProps) {
  return (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <pre className="report-stats">{buildStatsSummary(day, activities)}</pre>
      <p className="report-text">{day.report}</p>
    </div>
  );
}
