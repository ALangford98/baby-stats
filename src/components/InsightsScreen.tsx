import { useMemo, type ReactNode } from 'react';
import type { Day } from '../types';
import { computeInsights, type GroupInsights, type Hotspots, type Insufficient, type RangeStat } from '../domain/insights';
import { useNow } from '../hooks/useNow';
import { formatClockTime, formatDurationShort } from '../utils/time';
import './InsightsScreen.css';

function notEnough(stat: Insufficient): string {
  return `Not enough data yet (${stat.have} of ${stat.need})`;
}

function range(stat: RangeStat): string {
  return stat.p25 === stat.p75 ? formatDurationShort(stat.median) : `${formatDurationShort(stat.p25)}–${formatDurationShort(stat.p75)}`;
}

function hourLabel(h: number): string {
  return formatClockTime(new Date(2000, 0, 1, h).getTime()).replace(':00', '');
}

function HotspotChart({ hotspots }: { hotspots: Hotspots }) {
  if (hotspots.status === 'insufficient') return <p>{notEnough(hotspots)}</p>;
  const max = Math.max(...hotspots.buckets, 1);
  return (
    <>
      <div className="hotspots" role="img" aria-label="Events by hour of day">
        {hotspots.buckets.map((value, h) => (
          <div key={h} className="hotspots__col" title={`${hourLabel(h)}: ${Math.round(value * 10) / 10}`}>
            <div data-testid="hotspot-bar" className="hotspots__bar" style={{ height: `${(value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="hotspots__axis">
        <span>{hourLabel(0)}</span>
        <span>{hourLabel(6)}</span>
        <span>{hourLabel(12)}</span>
        <span>{hourLabel(18)}</span>
      </div>
      <p>
        Busiest: {hotspots.busiest.map((b) => `${hourLabel(b.startHour)}–${hourLabel((b.startHour + 2) % 24)}`).join(', ')} · based on{' '}
        {hotspots.total}
      </p>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="insight">
      <h3>{label}</h3>
      <div>{children}</div>
    </div>
  );
}

function GroupSection({ title, noun, group, afterFeed }: { title: string; noun: string; group: GroupInsights; afterFeed?: RangeStat | Insufficient }) {
  return (
    <section aria-label={title} className="insights-section">
      <h2>{title}</h2>
      <Stat label="Last one">
        {group.last ? `${formatDurationShort(group.last.agoMs)} ago (${formatClockTime(group.last.at)})` : 'None logged yet'}
      </Stat>
      <Stat label="Usual gap">
        {group.gap.status === 'ok'
          ? `Usually ${range(group.gap)} apart (typically ${formatDurationShort(group.gap.median)})${
              group.nextByGap ? ` · next likely around ${formatClockTime(group.nextByGap)}` : ''
            } · based on ${group.gap.samples} gaps`
          : notEnough(group.gap)}
      </Stat>
      {afterFeed && (
        <Stat label="After feeds">
          {afterFeed.status === 'ok'
            ? `Usually ${range(afterFeed)} after a feed · based on ${afterFeed.samples} ${noun}`
            : notEnough(afterFeed)}
        </Stat>
      )}
      <Stat label="Yesterday around now">
        {group.yesterday.length > 0 ? group.yesterday.map(formatClockTime).join(', ') : 'Nothing within an hour of now'}
      </Stat>
      <Stat label="Time of day">
        <HotspotChart hotspots={group.hotspots} />
      </Stat>
    </section>
  );
}

export function InsightsScreen({ days, onClose }: { days: Day[]; onClose: () => void }) {
  const now = useNow(60_000);
  const insights = useMemo(() => computeInsights(days, new Date(now).toISOString()), [days, now]);
  return (
    <div className="insights-screen">
      <button type="button" onClick={onClose}>
        Back
      </button>
      <p className="insights-screen__note">Based on the last 14 days. Entries without a time count toward totals only.</p>
      <GroupSection title="Poops" noun="poops" group={insights.poop} afterFeed={insights.poop.afterFeed} />
      <GroupSection title="Feeding" noun="feeds" group={insights.feed} />
    </div>
  );
}
