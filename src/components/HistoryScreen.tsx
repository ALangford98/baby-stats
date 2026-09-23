import type { Day } from '../types';

type HistoryScreenProps = {
  history: Day[];
  onSelect: (day: Day) => void;
  onClose: () => void;
};

export function HistoryScreen({ history, onSelect, onClose }: HistoryScreenProps) {
  return (
    <div>
      <button type="button" onClick={onClose}>
        Close
      </button>
      {history.length === 0 ? (
        <p>No days tracked yet.</p>
      ) : (
        <ul>
          {history.map((day) => (
            // Keyed by startedAt, not date: two days can share a calendar date.
            <li key={day.startedAt}>
              <button type="button" onClick={() => onSelect(day)}>
                {day.date}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
