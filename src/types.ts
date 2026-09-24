export type ActivityType = string;

export type ActivityKind = 'counter' | 'timer';

export type IconName =
  | 'Droplet'
  | 'Droplets'
  | 'CloudRain'
  | 'Waves'
  | 'Moon'
  | 'Baby'
  | 'AlertTriangle'
  | 'Utensils'
  | 'Milk'
  | 'Pill'
  | 'Bath'
  | 'Smile'
  | 'Heart'
  | 'Star'
  | 'Clock'
  | 'Thermometer'
  | 'Stethoscope'
  | 'BookOpen'
  | 'Music';

export type ActivityConfig = {
  type: ActivityType;
  label: string;
  kind: ActivityKind;
  icon: IconName;
  // Timer activities only: tapping logs an instant, zero-length session
  // instead of starting/stopping a timer. Derived from
  // `Settings.countOnlyTimers`, never stored on the config itself.
  countOnly?: boolean;
};

export type CounterLog = {
  kind: 'counter';
  type: ActivityType;
  count: number;
};

export type TimerSession = {
  start: string; // ISO timestamp
  end: string | null; // null while running
};

export type TimerLog = {
  kind: 'timer';
  type: ActivityType;
  sessions: TimerSession[];
};

export type ActivityLog = CounterLog | TimerLog;

export type Day = {
  date: string; // YYYY-MM-DD, local calendar date
  startedAt: string; // ISO timestamp
  endedAt: string | null; // ISO timestamp
  logs: Record<ActivityType, ActivityLog>;
  report: string | null;
  reportSource: 'offline' | 'ai' | null;
};

export type LlmProvider = 'anthropic' | 'openai';

export type Settings = {
  recoveryCode: string;
  llmProvider: LlmProvider | null;
  llmApiKey: string | null;
  customActivities: ActivityConfig[];
  // Timer activities the household has chosen to just count, not time.
  countOnlyTimers: ActivityType[];
};
