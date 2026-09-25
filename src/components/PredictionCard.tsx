import { useMemo } from 'react';
import type { Day } from '../types';
import { computeInsights, predictNextPoop } from '../domain/insights';
import { useNow } from '../hooks/useNow';
import { formatClockTime, formatDurationShort } from '../utils/time';
import './InsightsScreen.css';

function rangeText(p25: number, p75: number): string {
  return p25 === p75 ? formatDurationShort(p25) : `${formatDurationShort(p25)}–${formatDurationShort(p75)}`;
}

// The headline in-app "notification": when the next poop is likely, based on
// how soon poops usually follow a feed.
export function PredictionCard({ days }: { days: Day[] }) {
  const now = useNow(60_000);
  const prediction = useMemo(() => predictNextPoop(computeInsights(days, new Date(now).toISOString())), [days, now]);

  let text: string | null = null;
  switch (prediction.state) {
    case 'learning':
      text = `Learning your baby's pattern — ${prediction.have} of ${prediction.need} poops after feeds logged.`;
      break;
    case 'upcoming':
    case 'now': {
      const window = prediction.from === prediction.to
        ? formatClockTime(prediction.from)
        : `${formatClockTime(prediction.from)}–${formatClockTime(prediction.to)}`;
      text = `Poop likely ${window} (${rangeText(prediction.p25, prediction.p75)} after the ${formatClockTime(prediction.feedAt)} feed).`;
      break;
    }
    case 'done':
      text = `Poop logged at ${formatClockTime(prediction.poopAt)}, ${formatDurationShort(prediction.poopAt - prediction.feedAt)} after the feed.`;
      break;
    case 'gap':
      text = `Next poop usually ~${formatDurationShort(prediction.median)} after the last one — around ${formatClockTime(prediction.at)}.`;
      break;
    case 'none':
      text = null;
  }
  if (!text) return null;
  return (
    <p role="status" className={`prediction-card prediction-card--${prediction.state}`}>
      {text}
    </p>
  );
}
