export type ActivityType =
  | 'lightDiaper'
  | 'mediumDiaper'
  | 'heavyDiaper'
  | 'spitUp'
  | 'nap'
  | 'tummyTime'
  | 'cryingFit';

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
  date: string; // YYYY-MM-DD
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
};
