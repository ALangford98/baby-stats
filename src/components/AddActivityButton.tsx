import { Plus } from 'lucide-react';
import './ActivityButton.css';

type AddActivityButtonProps = {
  onClick: () => void;
};

export function AddActivityButton({ onClick }: AddActivityButtonProps) {
  return (
    <button
      type="button"
      className="activity-button__main activity-button__main--add"
      aria-label="Add activity"
      onClick={onClick}
    >
      <Plus size={28} />
      <span>Add</span>
    </button>
  );
}
