import { Trash2 } from 'lucide-react';
import type { Day } from '../types';

type HistoryScreenProps = {
  history: Day[];
  onSelect: (day: Day) => void;
  onClose: () => void;
  onDelete?: (day: Day) => void;
};

export function HistoryScreen({ history, onSelect, onClose, onDelete }: HistoryScreenProps) {
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
              {onDelete && (
                <button
                  type="button"
                  aria-label={`Delete ${day.date}`}
                  onClick={() => {
                    if (window.confirm(`Delete the tracking data for ${day.date}? This cannot be undone.`)) {
                      onDelete(day);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
