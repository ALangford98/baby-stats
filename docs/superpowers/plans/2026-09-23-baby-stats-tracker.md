# Baby Stats Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first React/TypeScript app that tracks a baby's day (diaper changes, spit up, naps, tummy time, crying fits), produces a funny end-of-day report (offline-templated, AI-generated via a user-supplied key, or copy-to-clipboard prompt), and optionally syncs via Firebase using a no-login recovery-code model.

**Architecture:** Pure, side-effect-free domain functions (`src/domain/`) for day state and report text, wrapped by React hooks (`src/hooks/`) that add persistence (localStorage) and best-effort cloud sync (Firebase). Presentational components (`src/components/`) consume the hooks. `App.tsx` is a small screen-state-machine wiring it together.

**Tech Stack:** Vite, React 18, TypeScript, `lucide-react`, Firebase (Firestore + Anonymous Auth), Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-baby-stats-tracker-design.md`

## Global Constraints

- Mobile-first single-screen layout; 3-column grid of square activity buttons.
- No email/password auth anywhere in the app.
- History is read-only — no editing past days.
- Web app only, no native wrapper.
- `llmApiKey` and `llmProvider` must never be written to Firestore — local `localStorage` only, per device.
- Recovery code is the Firestore document key (`users/{recoveryCode}`), 10 characters, generated client-side — not a Firebase Auth UID.
- Offline report generation must work with zero network access and ships before any AI/Firebase code depends on it.
- No CSS framework — plain CSS is sufficient for this scope.

## Review Focus

- **Declining the consent modal**: nothing should be written to `localStorage` and no Firebase calls should fire.
- **Restoring by an unknown or unreachable recovery code**: must show an error and let the user proceed (retry or start fresh) instead of hanging or crashing.
- **AI report call fails** (bad key, network error, non-2xx response): the report screen must keep showing the already-generated offline report, not crash or blank out.
- **A day with zero activity at all** (all counters 0, no timer sessions ever started): offline report generation and the stats summary must not divide by zero or throw on empty arrays.
- **Editing a timer's sessions while one is running**, including leaving a manually-added session with `end: null`: must not desync `isTimerRunning`/End Day's auto-stop logic, and End Day must still close it.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx` (placeholder), `src/test/setup.ts`
- Create: `.gitignore`, `.env.example`
- Test: `src/sanity.test.ts`

**Interfaces:**
- Produces: a working `npm run dev`, `npm run build`, and `npm test` for every later task to build on.

- [ ] **Step 1: Scaffold the Vite React-TS project**

```bash
cd /home/anthony/Documents/baby-stats
npm create vite@latest . -- --template react-ts
npm install
```

If it complains the directory isn't empty (because of `docs/` and `.git/`), re-run with `--force`.

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install lucide-react firebase
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Configure Vitest**

Edit `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

Add to `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write and run a sanity test**

Create `src/sanity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 5: Set up env file and gitignore**

Create `.env.example`:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Confirm `.gitignore` (created by the Vite scaffold) includes `node_modules` and `dist`; append `.env` and `.env.local` if not already present.

- [ ] **Step 6: Verify dev server boots**

Run: `npm run dev -- --port 5173 &` then `curl -sf http://localhost:5173 > /dev/null && echo OK`, then stop the server.
Expected: prints `OK`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React-TS project with Vitest"
```

---

### Task 2: Core Types and Activity Config

**Files:**
- Create: `src/types.ts`
- Create: `src/activities.ts`
- Test: `src/activities.test.ts`

**Interfaces:**
- Produces: `ActivityType`, `CounterLog`, `TimerSession`, `TimerLog`, `ActivityLog`, `Day`, `LlmProvider`, `Settings` (types); `ActivityConfig`, `ACTIVITIES` (const array) from `src/activities.ts`.

- [ ] **Step 1: Write the failing test for activity config coverage**

Create `src/activities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from './activities';
import type { ActivityType } from './types';

describe('ACTIVITIES', () => {
  it('covers exactly the seven expected activity types, each once', () => {
    const expected: ActivityType[] = [
      'lightDiaper',
      'mediumDiaper',
      'heavyDiaper',
      'spitUp',
      'nap',
      'tummyTime',
      'cryingFit',
    ];
    expect(ACTIVITIES.map((a) => a.type).sort()).toEqual([...expected].sort());
  });

  it('marks diapers and spit up as counters, and nap/tummyTime/cryingFit as timers', () => {
    const kindOf = (t: ActivityType) => ACTIVITIES.find((a) => a.type === t)?.kind;
    expect(kindOf('lightDiaper')).toBe('counter');
    expect(kindOf('mediumDiaper')).toBe('counter');
    expect(kindOf('heavyDiaper')).toBe('counter');
    expect(kindOf('spitUp')).toBe('counter');
    expect(kindOf('nap')).toBe('timer');
    expect(kindOf('tummyTime')).toBe('timer');
    expect(kindOf('cryingFit')).toBe('timer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/activities.test.ts`
Expected: FAIL (module `./activities` not found).

- [ ] **Step 3: Write the types**

Create `src/types.ts`:

```ts
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
```

- [ ] **Step 4: Write the activity config**

Create `src/activities.ts`:

```ts
import type { ActivityType } from './types';

export type ActivityKind = 'counter' | 'timer';

export type ActivityConfig = {
  type: ActivityType;
  label: string;
  kind: ActivityKind;
  icon: 'Droplet' | 'Droplets' | 'CloudRain' | 'Waves' | 'Moon' | 'Baby' | 'AlertTriangle';
};

export const ACTIVITIES: ActivityConfig[] = [
  { type: 'lightDiaper', label: 'Light Diaper', kind: 'counter', icon: 'Droplet' },
  { type: 'mediumDiaper', label: 'Medium Diaper', kind: 'counter', icon: 'Droplets' },
  { type: 'heavyDiaper', label: 'Heavy Diaper', kind: 'counter', icon: 'CloudRain' },
  { type: 'spitUp', label: 'Spit Up', kind: 'counter', icon: 'Waves' },
  { type: 'nap', label: 'Nap', kind: 'timer', icon: 'Moon' },
  { type: 'tummyTime', label: 'Tummy Time', kind: 'timer', icon: 'Baby' },
  { type: 'cryingFit', label: 'Crying Fit', kind: 'timer', icon: 'AlertTriangle' },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/activities.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/activities.ts src/activities.test.ts
git commit -m "feat: add core types and activity config"
```

---

### Task 3: Day State Domain Logic

**Files:**
- Create: `src/domain/day.ts`
- Test: `src/domain/day.test.ts`

**Interfaces:**
- Consumes: `ActivityType`, `Day`, `ActivityLog`, `TimerSession` from `src/types.ts`; `ACTIVITIES` from `src/activities.ts`.
- Produces: `createEmptyDay(startedAt: string): Day`, `incrementCounter(day, type): Day`, `setCounterCount(day, type, count): Day`, `isSessionRunning(log: TimerLog): boolean`, `isTimerRunning(day, type): boolean`, `toggleTimer(day, type, now): Day`, `setTimerSessions(day, type, sessions): Day`, `endDay(day, now): Day`.

- [ ] **Step 1: Write failing tests for counters and empty-day creation**

Create `src/domain/day.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createEmptyDay,
  endDay,
  incrementCounter,
  isTimerRunning,
  setCounterCount,
  setTimerSessions,
  toggleTimer,
} from './day';
import { ACTIVITIES } from '../activities';

const START = '2026-09-23T08:00:00.000Z';

describe('createEmptyDay', () => {
  it('creates a zeroed log for every activity', () => {
    const day = createEmptyDay(START);
    expect(day.date).toBe('2026-09-23');
    expect(day.startedAt).toBe(START);
    expect(day.endedAt).toBeNull();
    expect(day.report).toBeNull();
    for (const activity of ACTIVITIES) {
      const log = day.logs[activity.type];
      if (activity.kind === 'counter') {
        expect(log).toEqual({ kind: 'counter', type: activity.type, count: 0 });
      } else {
        expect(log).toEqual({ kind: 'timer', type: activity.type, sessions: [] });
      }
    }
  });
});

describe('incrementCounter / setCounterCount', () => {
  it('increments a counter without mutating the original day', () => {
    const day = createEmptyDay(START);
    const next = incrementCounter(day, 'lightDiaper');
    expect((day.logs.lightDiaper as any).count).toBe(0);
    expect((next.logs.lightDiaper as any).count).toBe(1);
  });

  it('sets a counter directly via the edit path', () => {
    const day = createEmptyDay(START);
    const next = setCounterCount(day, 'spitUp', 5);
    expect((next.logs.spitUp as any).count).toBe(5);
  });

  it('throws if used on a timer activity', () => {
    const day = createEmptyDay(START);
    expect(() => incrementCounter(day, 'nap')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/day.test.ts`
Expected: FAIL (module `./day` not found).

- [ ] **Step 3: Implement `createEmptyDay`, counter functions**

Create `src/domain/day.ts`:

```ts
import type { ActivityLog, ActivityType, Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';

export function createEmptyDay(startedAt: string): Day {
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const activity of ACTIVITIES) {
    logs[activity.type] =
      activity.kind === 'counter'
        ? { kind: 'counter', type: activity.type, count: 0 }
        : { kind: 'timer', type: activity.type, sessions: [] };
  }
  return {
    date: startedAt.slice(0, 10),
    startedAt,
    endedAt: null,
    logs,
    report: null,
    reportSource: null,
  };
}

function updateLog(day: Day, type: ActivityType, update: (log: ActivityLog) => ActivityLog): Day {
  return { ...day, logs: { ...day.logs, [type]: update(day.logs[type]) } };
}

export function incrementCounter(day: Day, type: ActivityType): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count: log.count + 1 };
  });
}

export function setCounterCount(day: Day, type: ActivityType, count: number): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count };
  });
}
```

- [ ] **Step 4: Run test to verify counter tests pass**

Run: `npm test -- src/domain/day.test.ts`
Expected: 4 tests pass (the timer describe blocks don't exist yet — add them next).

- [ ] **Step 5: Write failing tests for timer toggling, session editing, and end-of-day**

Append to `src/domain/day.test.ts`:

```ts
describe('toggleTimer / isTimerRunning', () => {
  it('starts a session on the first toggle and is reported as running', () => {
    const day = createEmptyDay(START);
    const next = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    expect(isTimerRunning(next, 'nap')).toBe(true);
    expect((next.logs.nap as any).sessions).toEqual([
      { start: '2026-09-23T09:00:00.000Z', end: null },
    ]);
  });

  it('stops the running session on the second toggle', () => {
    let day = createEmptyDay(START);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T09:30:00.000Z');
    expect(isTimerRunning(day, 'nap')).toBe(false);
    expect((day.logs.nap as any).sessions).toEqual([
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' },
    ]);
  });

  it('starts a new session after a prior one is closed', () => {
    let day = createEmptyDay(START);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T09:30:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T10:00:00.000Z');
    expect((day.logs.nap as any).sessions).toHaveLength(2);
    expect(isTimerRunning(day, 'nap')).toBe(true);
  });
});

describe('setTimerSessions', () => {
  it('replaces the full session list for one activity, leaving others untouched', () => {
    const day = createEmptyDay(START);
    const sessions: TimerSession[] = [
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:10:00.000Z' },
    ];
    const next = setTimerSessions(day, 'tummyTime', sessions);
    expect((next.logs.tummyTime as any).sessions).toEqual(sessions);
    expect((next.logs.nap as any).sessions).toEqual([]);
  });
});

describe('endDay', () => {
  it('closes any running timers and sets endedAt', () => {
    let day = createEmptyDay(START);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'cryingFit', '2026-09-23T09:05:00.000Z');
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect(ended.endedAt).toBe('2026-09-23T18:00:00.000Z');
    expect(isTimerRunning(ended, 'nap')).toBe(false);
    expect(isTimerRunning(ended, 'cryingFit')).toBe(false);
    expect((ended.logs.nap as any).sessions[0].end).toBe('2026-09-23T18:00:00.000Z');
  });

  it('is a no-op on timers with no running session', () => {
    const day = createEmptyDay(START);
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect((ended.logs.nap as any).sessions).toEqual([]);
    expect((ended.logs.tummyTime as any).sessions).toEqual([]);
    expect((ended.logs.cryingFit as any).sessions).toEqual([]);
  });

  it('handles a day with zero activity logged at all without throwing', () => {
    const day = createEmptyDay(START);
    expect(() => endDay(day, '2026-09-23T18:00:00.000Z')).not.toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/domain/day.test.ts`
Expected: FAIL (`toggleTimer`, `isTimerRunning`, `setTimerSessions`, `endDay` not defined).

- [ ] **Step 7: Implement timer functions and `endDay`**

Append to `src/domain/day.ts`:

```ts
export function isSessionRunning(log: TimerLog): boolean {
  const last = log.sessions[log.sessions.length - 1];
  return last !== undefined && last.end === null;
}

export function isTimerRunning(day: Day, type: ActivityType): boolean {
  const log = day.logs[type];
  return log.kind === 'timer' && isSessionRunning(log);
}

export function toggleTimer(day: Day, type: ActivityType, now: string): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'timer') throw new Error(`${type} is not a timer activity`);
    const last = log.sessions[log.sessions.length - 1];
    if (last && last.end === null) {
      const sessions = [...log.sessions];
      sessions[sessions.length - 1] = { ...last, end: now };
      return { ...log, sessions };
    }
    return { ...log, sessions: [...log.sessions, { start: now, end: null }] };
  });
}

export function setTimerSessions(day: Day, type: ActivityType, sessions: TimerSession[]): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'timer') throw new Error(`${type} is not a timer activity`);
    return { ...log, sessions };
  });
}

export function endDay(day: Day, now: string): Day {
  let result = day;
  for (const activity of ACTIVITIES) {
    if (activity.kind === 'timer' && isTimerRunning(result, activity.type)) {
      result = toggleTimer(result, activity.type, now);
    }
  }
  return { ...result, endedAt: now };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/domain/day.test.ts`
Expected: PASS (all tests, 12 total).

- [ ] **Step 9: Commit**

```bash
git add src/domain/day.ts src/domain/day.test.ts
git commit -m "feat: add pure day-state domain logic for counters and timers"
```

---

### Task 4: localStorage Persistence and Recovery Code Generator

**Files:**
- Create: `src/storage/localStorage.ts`
- Create: `src/utils/recoveryCode.ts`
- Test: `src/storage/localStorage.test.ts`
- Test: `src/utils/recoveryCode.test.ts`

**Interfaces:**
- Consumes: `Day`, `Settings` from `src/types.ts`.
- Produces: `loadSettings()`, `saveSettings(settings)`, `loadCurrentDay()`, `saveCurrentDay(day)`, `loadHistory()`, `saveHistory(history)` from `src/storage/localStorage.ts`; `generateRecoveryCode(length?)` from `src/utils/recoveryCode.ts`.

- [ ] **Step 1: Write the failing test for the recovery code generator**

Create `src/utils/recoveryCode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateRecoveryCode } from './recoveryCode';

describe('generateRecoveryCode', () => {
  it('generates a 10-character code by default', () => {
    expect(generateRecoveryCode()).toHaveLength(10);
  });

  it('only uses unambiguous uppercase letters and digits', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('generates different codes across calls (extremely unlikely to collide)', () => {
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/recoveryCode.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the recovery code generator**

Create `src/utils/recoveryCode.ts`:

```ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes I, O, 0, 1 to avoid ambiguity

export function generateRecoveryCode(length = 10): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/recoveryCode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for localStorage persistence**

Create `src/storage/localStorage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadCurrentDay,
  loadHistory,
  loadSettings,
  saveCurrentDay,
  saveHistory,
  saveSettings,
} from './localStorage';
import { createEmptyDay } from '../domain/day';
import type { Settings } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('settings round-trip', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSettings()).toBeNull();
  });

  it('saves and reloads settings', () => {
    const settings: Settings = { recoveryCode: 'ABCD123456', llmProvider: 'anthropic', llmApiKey: 'sk-test' };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });
});

describe('currentDay round-trip', () => {
  it('returns null when nothing is stored', () => {
    expect(loadCurrentDay()).toBeNull();
  });

  it('saves, reloads, and clears the current day', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    saveCurrentDay(day);
    expect(loadCurrentDay()).toEqual(day);
    saveCurrentDay(null);
    expect(loadCurrentDay()).toBeNull();
  });
});

describe('history round-trip', () => {
  it('defaults to an empty array', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('saves and reloads history', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    saveHistory([day]);
    expect(loadHistory()).toEqual([day]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/storage/localStorage.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement localStorage persistence**

Create `src/storage/localStorage.ts`:

```ts
import type { Day, Settings } from '../types';

const KEYS = {
  settings: 'babystats:settings',
  currentDay: 'babystats:currentDay',
  history: 'babystats:history',
} as const;

export function loadSettings(): Settings | null {
  const raw = localStorage.getItem(KEYS.settings);
  return raw ? (JSON.parse(raw) as Settings) : null;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export function loadCurrentDay(): Day | null {
  const raw = localStorage.getItem(KEYS.currentDay);
  return raw ? (JSON.parse(raw) as Day) : null;
}

export function saveCurrentDay(day: Day | null): void {
  if (day === null) {
    localStorage.removeItem(KEYS.currentDay);
  } else {
    localStorage.setItem(KEYS.currentDay, JSON.stringify(day));
  }
}

export function loadHistory(): Day[] {
  const raw = localStorage.getItem(KEYS.history);
  return raw ? (JSON.parse(raw) as Day[]) : [];
}

export function saveHistory(history: Day[]): void {
  localStorage.setItem(KEYS.history, JSON.stringify(history));
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/storage/localStorage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add src/storage/localStorage.ts src/storage/localStorage.test.ts src/utils/recoveryCode.ts src/utils/recoveryCode.test.ts
git commit -m "feat: add localStorage persistence and recovery code generator"
```

---

### Task 5: Report Text Generation (Offline + Shared Prompt Text)

**Files:**
- Create: `src/domain/reportText.ts`
- Test: `src/domain/reportText.test.ts`

**Interfaces:**
- Consumes: `Day`, `ActivityType`, `TimerLog` from `src/types.ts`; `ACTIVITIES` from `src/activities.ts`.
- Produces: `STYLE_INSTRUCTION` (string constant), `buildStatsSummary(day: Day): string`, `generateOfflineReport(day: Day): string`, `buildPromptText(day: Day): string`.

- [ ] **Step 1: Write the failing test for `buildStatsSummary`**

Create `src/domain/reportText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPromptText, buildStatsSummary, generateOfflineReport, STYLE_INSTRUCTION } from './reportText';
import { createEmptyDay } from './day';
import { incrementCounter, setTimerSessions } from './day';

const START = '2026-09-23T08:00:00.000Z';

function sampleDay() {
  let day = createEmptyDay(START);
  day = incrementCounter(day, 'lightDiaper');
  day = incrementCounter(day, 'lightDiaper');
  day = incrementCounter(day, 'heavyDiaper');
  day = setTimerSessions(day, 'nap', [
    { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T10:30:00.000Z' },
  ]);
  day = { ...day, endedAt: '2026-09-23T20:00:00.000Z' };
  return day;
}

describe('buildStatsSummary', () => {
  it('includes a line per activity with counts or session totals', () => {
    const summary = buildStatsSummary(sampleDay());
    expect(summary).toContain('Light Diaper: 2');
    expect(summary).toContain('Heavy Diaper: 1');
    expect(summary).toContain('Medium Diaper: 0');
    expect(summary).toContain('Nap: 1 session(s), 1h 30m total');
    expect(summary).toContain('Tummy Time: 0 session(s), 0m total');
  });

  it('does not throw and reports zeros for a completely empty day', () => {
    const day = createEmptyDay(START);
    expect(() => buildStatsSummary(day)).not.toThrow();
    expect(buildStatsSummary(day)).toContain('Nap: 0 session(s), 0m total');
  });
});

describe('buildPromptText', () => {
  it('combines the style instruction with the stats summary', () => {
    const text = buildPromptText(sampleDay());
    expect(text).toContain(STYLE_INSTRUCTION);
    expect(text).toContain(buildStatsSummary(sampleDay()));
  });
});

describe('generateOfflineReport', () => {
  it('produces non-empty text for a fully populated day', () => {
    const report = generateOfflineReport(sampleDay());
    expect(report.length).toBeGreaterThan(0);
  });

  it('does not throw for a completely empty day and still returns text', () => {
    const day = createEmptyDay(START);
    expect(() => generateOfflineReport(day)).not.toThrow();
    expect(generateOfflineReport(day).length).toBeGreaterThan(0);
  });

  it('picks a different line as a counter crosses bucket thresholds', () => {
    let day = createEmptyDay(START);
    const zero = generateOfflineReport(day);
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    day = incrementCounter(day, 'spitUp');
    const four = generateOfflineReport(day);
    expect(four).not.toBe(zero);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/reportText.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `buildStatsSummary` and `buildPromptText`**

Create `src/domain/reportText.ts`:

```ts
import type { ActivityType, Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';

export const STYLE_INSTRUCTION =
  "Write a short, funny, affectionate 3-5 sentence summary of this baby's day using the stats below. Keep it lighthearted, not clinical.";

function sessionDurationMs(session: TimerSession, now: string): number {
  const end = session.end ?? now;
  return new Date(end).getTime() - new Date(session.start).getTime();
}

function totalTimerMs(log: TimerLog, now: string): number {
  return log.sessions.reduce((sum, s) => sum + sessionDurationMs(s, now), 0);
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function buildStatsSummary(day: Day): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = ACTIVITIES.map((activity) => {
    const log = day.logs[activity.type];
    if (log.kind === 'counter') {
      return `${activity.label}: ${log.count}`;
    }
    const totalMs = totalTimerMs(log, now);
    return `${activity.label}: ${log.sessions.length} session(s), ${formatDuration(totalMs)} total`;
  });
  return lines.join('\n');
}

export function buildPromptText(day: Day): string {
  return `${STYLE_INSTRUCTION}\n\n${buildStatsSummary(day)}`;
}
```

- [ ] **Step 4: Run test to verify `buildStatsSummary`/`buildPromptText` tests pass**

Run: `npm test -- src/domain/reportText.test.ts`
Expected: those two describe blocks pass; `generateOfflineReport` tests still fail (not implemented yet).

- [ ] **Step 5: Implement `generateOfflineReport`**

Append to `src/domain/reportText.ts`:

```ts
function bucketIndex(value: number, thresholds: number[]): number {
  let idx = 0;
  for (const t of thresholds) {
    if (value >= t) idx++;
  }
  return idx;
}

const COUNTER_TEMPLATES: Record<'lightDiaper' | 'mediumDiaper' | 'heavyDiaper' | 'spitUp', string[]> = {
  lightDiaper: [
    'Not a single light diaper today — skipped the easy ones entirely.',
    'A couple of light diapers — nice and breezy.',
    'Several light diapers today — a steady drizzle.',
    '6+ light diapers — basically a subscription service at this point.',
  ],
  mediumDiaper: [
    'Zero medium diapers — living the dream.',
    'A light rotation of medium diapers today.',
    'A solid handful of medium diapers — business as usual.',
    '6+ medium diapers — the diaper genie earned its keep.',
  ],
  heavyDiaper: [
    'No heavy diapers today — count your blessings.',
    'A couple of heavy diapers snuck in there.',
    'Several heavy diapers — bring out the good wipes.',
    '6+ heavy diapers — someone should get hazard pay.',
  ],
  spitUp: [
    'No spit up today — the shirt survives another day.',
    'A little spit up here and there — cosmetic damage only.',
    'A fair amount of spit up — you\'ve basically got a second job.',
    '6+ spit ups — you may want to invest in a poncho.',
  ],
};

const TIMER_TEMPLATES: Record<'nap' | 'tummyTime' | 'cryingFit', string[]> = {
  nap: [
    'No naps today — everyone is running on fumes.',
    'A short nap snuck in there — better than nothing.',
    'A solid chunk of nap time today — a small miracle.',
    '90+ minutes of napping — truly professional-grade sleeping.',
  ],
  tummyTime: [
    'No tummy time today — the floor stayed lonely.',
    'A quick bit of tummy time — baby tolerated it, barely.',
    'A good stretch of tummy time — those neck muscles are working.',
    '90+ minutes of tummy time — basically training for a marathon.',
  ],
  cryingFit: [
    'No crying fits today — is this baby broken? (Kidding. Great job.)',
    'A brief crying fit — a small storm, quickly passed.',
    'A fair bit of crying today — everyone needed a hug after.',
    '90+ minutes of crying — you deserve a medal and a nap of your own.',
  ],
};

export function generateOfflineReport(day: Day): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = ACTIVITIES.map((activity) => {
    const log = day.logs[activity.type];
    if (log.kind === 'counter') {
      const idx = bucketIndex(log.count, [1, 3, 6]);
      return COUNTER_TEMPLATES[activity.type as keyof typeof COUNTER_TEMPLATES][idx];
    }
    const totalMinutes = totalTimerMs(log, now) / 60000;
    const idx = bucketIndex(totalMinutes, [1, 30, 90]);
    return TIMER_TEMPLATES[activity.type as keyof typeof TIMER_TEMPLATES][idx];
  });
  return ["Here's how today went:", ...lines].join('\n\n');
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/domain/reportText.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add src/domain/reportText.ts src/domain/reportText.test.ts
git commit -m "feat: add offline report templates and shared prompt text builder"
```

---

### Task 6: AI Report Generation (Anthropic + OpenAI)

**Files:**
- Create: `src/domain/aiReport.ts`
- Test: `src/domain/aiReport.test.ts`

**Interfaces:**
- Consumes: `Day`, `Settings` from `src/types.ts`; `buildStatsSummary`, `STYLE_INSTRUCTION` from `src/domain/reportText.ts`.
- Produces: `generateAiReport(day: Day, settings: Settings): Promise<string>`.

- [ ] **Step 1: Write the failing tests, mocking `fetch`**

Create `src/domain/aiReport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAiReport } from './aiReport';
import { createEmptyDay } from './day';
import type { Settings } from '../types';

const day = createEmptyDay('2026-09-23T08:00:00.000Z');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateAiReport', () => {
  it('throws if no provider/key is configured', async () => {
    const settings: Settings = { recoveryCode: 'X', llmProvider: null, llmApiKey: null };
    await expect(generateAiReport(day, settings)).rejects.toThrow('No LLM provider configured');
  });

  it('calls the Anthropic messages API and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'A very funny anthropic report.' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const settings: Settings = { recoveryCode: 'X', llmProvider: 'anthropic', llmApiKey: 'sk-ant-test' };

    const result = await generateAiReport(day, settings);

    expect(result).toBe('A very funny anthropic report.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
  });

  it('calls the OpenAI chat completions API and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'A very funny openai report.' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const settings: Settings = { recoveryCode: 'X', llmProvider: 'openai', llmApiKey: 'sk-openai-test' };

    const result = await generateAiReport(day, settings);

    expect(result).toBe('A very funny openai report.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-openai-test');
  });

  it('throws a descriptive error when the API responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const settings: Settings = { recoveryCode: 'X', llmProvider: 'anthropic', llmApiKey: 'bad-key' };

    await expect(generateAiReport(day, settings)).rejects.toThrow('Anthropic API error: 401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/aiReport.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `generateAiReport`**

Create `src/domain/aiReport.ts`:

```ts
import type { Day, Settings } from '../types';
import { buildStatsSummary, STYLE_INSTRUCTION } from './reportText';

async function callAnthropic(apiKey: string, statsSummary: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: `${STYLE_INSTRUCTION}\n\n${statsSummary}` }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text as string;
}

async function callOpenAi(apiKey: string, statsSummary: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `${STYLE_INSTRUCTION}\n\n${statsSummary}` }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content as string;
}

export async function generateAiReport(day: Day, settings: Settings): Promise<string> {
  if (!settings.llmProvider || !settings.llmApiKey) {
    throw new Error('No LLM provider configured');
  }
  const statsSummary = buildStatsSummary(day);
  return settings.llmProvider === 'anthropic'
    ? callAnthropic(settings.llmApiKey, statsSummary)
    : callOpenAi(settings.llmApiKey, statsSummary);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/domain/aiReport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/aiReport.ts src/domain/aiReport.test.ts
git commit -m "feat: add AI report generation for Anthropic and OpenAI"
```

---

### Task 7: Firebase Sync Module

**Files:**
- Create: `src/storage/firebaseClient.ts`
- Create: `src/storage/firebaseSync.ts`
- Create: `firestore.rules`
- Test: `src/storage/firebaseSync.test.ts`

**Interfaces:**
- Consumes: `Day` from `src/types.ts`.
- Produces: `ensureAnonymousAuth(): Promise<void>`, `fetchSyncedData(recoveryCode): Promise<SyncedData | null>`, `pushSyncedData(recoveryCode, data): Promise<void>`, `SyncedData` type — all from `src/storage/firebaseSync.ts`.

- [ ] **Step 1: Implement the Firebase client**

Create `src/storage/firebaseClient.ts`:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

- [ ] **Step 2: Write the failing tests for the sync module, mocking Firebase**

Create `src/storage/firebaseSync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInAnonymouslyMock = vi.fn();
const getDocMock = vi.fn();
const setDocMock = vi.fn();
const docMock = vi.fn((_db, _coll, id) => ({ id }));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  signInAnonymously: (...args: unknown[]) => signInAnonymouslyMock(...args),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: (...args: unknown[]) => docMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

import { ensureAnonymousAuth, fetchSyncedData, pushSyncedData } from './firebaseSync';
import { createEmptyDay } from '../domain/day';

beforeEach(() => {
  signInAnonymouslyMock.mockReset().mockResolvedValue(undefined);
  getDocMock.mockReset();
  setDocMock.mockReset().mockResolvedValue(undefined);
});

describe('ensureAnonymousAuth', () => {
  it('signs in anonymously when there is no current user', async () => {
    await ensureAnonymousAuth();
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchSyncedData', () => {
  it('returns null when the document does not exist', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const result = await fetchSyncedData('MISSINGCODE');
    expect(result).toBeNull();
  });

  it('returns the stored data when the document exists', async () => {
    const data = { currentDay: null, history: [] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    const result = await fetchSyncedData('REALCODE01');
    expect(result).toEqual(data);
  });

  it('propagates errors (e.g. offline/network failure) rather than swallowing them', async () => {
    getDocMock.mockRejectedValue(new Error('network error'));
    await expect(fetchSyncedData('REALCODE01')).rejects.toThrow('network error');
  });
});

describe('pushSyncedData', () => {
  it('writes only currentDay and history, never any settings/API key fields', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    await pushSyncedData('REALCODE01', { currentDay: day, history: [] });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = setDocMock.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['currentDay', 'history']);
    expect(JSON.stringify(payload)).not.toContain('llmApiKey');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/storage/firebaseSync.test.ts`
Expected: FAIL (module `./firebaseSync` not found).

- [ ] **Step 4: Implement the sync module**

Create `src/storage/firebaseSync.ts`:

```ts
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebaseClient';
import type { Day } from '../types';

export type SyncedData = { currentDay: Day | null; history: Day[] };

export async function ensureAnonymousAuth(): Promise<void> {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

export async function fetchSyncedData(recoveryCode: string): Promise<SyncedData | null> {
  const snapshot = await getDoc(doc(db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  return snapshot.data() as SyncedData;
}

export async function pushSyncedData(recoveryCode: string, data: SyncedData): Promise<void> {
  await setDoc(doc(db, 'users', recoveryCode), data);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/storage/firebaseSync.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Add Firestore security rules for reference**

Create `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{recoveryCode} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Note: this file is a reference for deploying to your own Firebase project (via `firebase deploy --only firestore:rules` from the Firebase CLI, after `firebase init`) — it is not applied automatically by this codebase. You'll also need to create a Firebase project, enable Anonymous Authentication and Firestore, and populate `.env` from `.env.example` with that project's config before sync works end-to-end.

- [ ] **Step 7: Commit**

```bash
git add src/storage/firebaseClient.ts src/storage/firebaseSync.ts src/storage/firebaseSync.test.ts firestore.rules
git commit -m "feat: add Firebase anonymous auth and Firestore sync module"
```

---

### Task 8: React Hooks (Day State, Settings, History, Cloud Sync)

**Files:**
- Create: `src/hooks/useDayState.ts`
- Create: `src/hooks/useSettings.ts`
- Create: `src/hooks/useHistory.ts`
- Create: `src/hooks/useCloudSync.ts`
- Test: `src/hooks/useDayState.test.ts`
- Test: `src/hooks/useSettings.test.ts`
- Test: `src/hooks/useHistory.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7 (`Day`, `Settings`, `ActivityType`, `TimerSession`; `createEmptyDay`, `incrementCounter`, `setCounterCount`, `toggleTimer`, `setTimerSessions`, `endDay`; `loadCurrentDay`/`saveCurrentDay`/`loadSettings`/`saveSettings`/`loadHistory`/`saveHistory`; `generateRecoveryCode`; `ensureAnonymousAuth`, `pushSyncedData`).
- Produces:
  - `useDayState()` → `{ day: Day | null; startDay(startedAt: string): void; incrementCounter(type): void; setCounterCount(type, count): void; toggleTimer(type): void; setTimerSessions(type, sessions): void; finishDay(): Day; setDayReport(report: string, source: 'offline' | 'ai'): void; clearDay(): void; replaceDay(day: Day | null): void }`
  - `useSettings()` → `{ settings: Settings; updateSettings(patch: Partial<Settings>): void }`
  - `useHistory()` → `{ history: Day[]; addToHistory(day: Day): void; replaceHistory(history: Day[]): void }`
  - `useCloudSync(recoveryCode: string, day: Day | null, history: Day[]): void`

- [ ] **Step 1: Write the failing test for `useDayState`**

Create `src/hooks/useDayState.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDayState } from './useDayState';

beforeEach(() => {
  localStorage.clear();
});

describe('useDayState', () => {
  it('starts null and creates a day via startDay', () => {
    const { result } = renderHook(() => useDayState());
    expect(result.current.day).toBeNull();

    act(() => result.current.startDay('2026-09-23T08:00:00.000Z'));

    expect(result.current.day?.startedAt).toBe('2026-09-23T08:00:00.000Z');
  });

  it('increments a counter and persists it to localStorage', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z'));
    act(() => result.current.incrementCounter('lightDiaper'));

    expect((result.current.day!.logs.lightDiaper as any).count).toBe(1);

    const { result: reloaded } = renderHook(() => useDayState());
    expect((reloaded.current.day!.logs.lightDiaper as any).count).toBe(1);
  });

  it('toggles a timer on and off', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z'));
    act(() => result.current.toggleTimer('nap'));
    expect((result.current.day!.logs.nap as any).sessions).toHaveLength(1);
    expect((result.current.day!.logs.nap as any).sessions[0].end).toBeNull();

    act(() => result.current.toggleTimer('nap'));
    expect((result.current.day!.logs.nap as any).sessions[0].end).not.toBeNull();
  });

  it('finishDay closes running timers, sets endedAt, and updates state', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z'));
    act(() => result.current.toggleTimer('nap'));

    let ended;
    act(() => {
      ended = result.current.finishDay();
    });

    expect(ended!.endedAt).not.toBeNull();
    expect((result.current.day!.logs.nap as any).sessions[0].end).not.toBeNull();
  });

  it('setDayReport updates report and reportSource on the current day', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z'));
    act(() => result.current.setDayReport('Funny report text', 'offline'));

    expect(result.current.day!.report).toBe('Funny report text');
    expect(result.current.day!.reportSource).toBe('offline');
  });

  it('clearDay resets to null and clears localStorage', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z'));
    act(() => result.current.clearDay());

    expect(result.current.day).toBeNull();
    const { result: reloaded } = renderHook(() => useDayState());
    expect(reloaded.current.day).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useDayState.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `useDayState`**

Create `src/hooks/useDayState.ts`:

```ts
import { useCallback, useState } from 'react';
import type { ActivityType, Day, TimerSession } from '../types';
import {
  createEmptyDay,
  endDay,
  incrementCounter as incrementCounterDomain,
  setCounterCount as setCounterCountDomain,
  setTimerSessions as setTimerSessionsDomain,
  toggleTimer as toggleTimerDomain,
} from '../domain/day';
import { loadCurrentDay, saveCurrentDay } from '../storage/localStorage';

export function useDayState() {
  const [day, setDayState] = useState<Day | null>(() => loadCurrentDay());

  const persist = useCallback((next: Day | null) => {
    setDayState(next);
    saveCurrentDay(next);
  }, []);

  const startDay = useCallback((startedAt: string) => persist(createEmptyDay(startedAt)), [persist]);

  const incrementCounter = useCallback(
    (type: ActivityType) => {
      if (!day) return;
      persist(incrementCounterDomain(day, type));
    },
    [day, persist],
  );

  const setCounterCount = useCallback(
    (type: ActivityType, count: number) => {
      if (!day) return;
      persist(setCounterCountDomain(day, type, count));
    },
    [day, persist],
  );

  const toggleTimer = useCallback(
    (type: ActivityType) => {
      if (!day) return;
      persist(toggleTimerDomain(day, type, new Date().toISOString()));
    },
    [day, persist],
  );

  const setTimerSessions = useCallback(
    (type: ActivityType, sessions: TimerSession[]) => {
      if (!day) return;
      persist(setTimerSessionsDomain(day, type, sessions));
    },
    [day, persist],
  );

  const finishDay = useCallback((): Day => {
    if (!day) throw new Error('No active day to finish');
    const ended = endDay(day, new Date().toISOString());
    persist(ended);
    return ended;
  }, [day, persist]);

  const setDayReport = useCallback(
    (report: string, source: 'offline' | 'ai') => {
      if (!day) return;
      persist({ ...day, report, reportSource: source });
    },
    [day, persist],
  );

  const clearDay = useCallback(() => persist(null), [persist]);

  const replaceDay = useCallback((next: Day | null) => persist(next), [persist]);

  return {
    day,
    startDay,
    incrementCounter,
    setCounterCount,
    toggleTimer,
    setTimerSessions,
    finishDay,
    setDayReport,
    clearDay,
    replaceDay,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useDayState.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing test for `useSettings` and `useHistory`**

Create `src/hooks/useSettings.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from './useSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('useSettings', () => {
  it('generates and persists a recovery code on first use', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.recoveryCode).toHaveLength(10);
    expect(result.current.settings.llmProvider).toBeNull();

    const { result: reloaded } = renderHook(() => useSettings());
    expect(reloaded.current.settings.recoveryCode).toBe(result.current.settings.recoveryCode);
  });

  it('updateSettings merges and persists a partial patch', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.updateSettings({ llmProvider: 'openai', llmApiKey: 'sk-test' }));

    expect(result.current.settings.llmProvider).toBe('openai');
    expect(result.current.settings.llmApiKey).toBe('sk-test');

    const { result: reloaded } = renderHook(() => useSettings());
    expect(reloaded.current.settings.llmProvider).toBe('openai');
  });
});
```

Create `src/hooks/useHistory.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHistory } from './useHistory';
import { createEmptyDay } from '../domain/day';

beforeEach(() => {
  localStorage.clear();
});

describe('useHistory', () => {
  it('starts empty and adds a day, persisting it', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.history).toEqual([]);

    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    act(() => result.current.addToHistory(day));

    expect(result.current.history).toEqual([day]);
    const { result: reloaded } = renderHook(() => useHistory());
    expect(reloaded.current.history).toEqual([day]);
  });

  it('replaceHistory overwrites the full list, e.g. after a restore-by-code', () => {
    const { result } = renderHook(() => useHistory());
    const restored = [createEmptyDay('2026-09-20T08:00:00.000Z')];
    act(() => result.current.replaceHistory(restored));

    expect(result.current.history).toEqual(restored);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- src/hooks/useSettings.test.ts src/hooks/useHistory.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 7: Implement `useSettings` and `useHistory`**

Create `src/hooks/useSettings.ts`:

```ts
import { useCallback, useState } from 'react';
import type { Settings } from '../types';
import { loadSettings, saveSettings } from '../storage/localStorage';
import { generateRecoveryCode } from '../utils/recoveryCode';

function loadOrCreateSettings(): Settings {
  const existing = loadSettings();
  if (existing) return existing;
  const fresh: Settings = { recoveryCode: generateRecoveryCode(), llmProvider: null, llmApiKey: null };
  saveSettings(fresh);
  return fresh;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadOrCreateSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
```

Create `src/hooks/useHistory.ts`:

```ts
import { useCallback, useState } from 'react';
import type { Day } from '../types';
import { loadHistory, saveHistory } from '../storage/localStorage';

export function useHistory() {
  const [history, setHistoryState] = useState<Day[]>(() => loadHistory());

  const replaceHistory = useCallback((next: Day[]) => {
    setHistoryState(next);
    saveHistory(next);
  }, []);

  const addToHistory = useCallback(
    (day: Day) => {
      setHistoryState((prev) => {
        const next = [day, ...prev];
        saveHistory(next);
        return next;
      });
    },
    [],
  );

  return { history, addToHistory, replaceHistory };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- src/hooks/useSettings.test.ts src/hooks/useHistory.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Implement `useCloudSync` (best-effort, no dedicated test — exercised in Task 15's integration test)**

Create `src/hooks/useCloudSync.ts`:

```ts
import { useEffect } from 'react';
import type { Day } from '../types';
import { ensureAnonymousAuth, pushSyncedData } from '../storage/firebaseSync';

export function useCloudSync(recoveryCode: string, day: Day | null, history: Day[]): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        if (cancelled) return;
        await pushSyncedData(recoveryCode, { currentDay: day, history });
      } catch {
        // Best-effort sync only — the app is offline-first and localStorage
        // already holds the source of truth for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryCode, day, history]);
}
```

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useDayState.ts src/hooks/useDayState.test.ts src/hooks/useSettings.ts src/hooks/useSettings.test.ts src/hooks/useHistory.ts src/hooks/useHistory.test.ts src/hooks/useCloudSync.ts
git commit -m "feat: add React hooks for day state, settings, history, and cloud sync"
```

---

### Task 9: Time Formatting Utilities and `useElapsedTime`

**Files:**
- Create: `src/utils/time.ts`
- Create: `src/hooks/useElapsedTime.ts`
- Test: `src/utils/time.test.ts`
- Test: `src/hooks/useElapsedTime.test.ts`

**Interfaces:**
- Produces: `formatElapsed(ms: number): string` (mm:ss) from `src/utils/time.ts`; `useElapsedTime(startIso: string | null): number` (milliseconds elapsed, ticking every second) from `src/hooks/useElapsedTime.ts`.

- [ ] **Step 1: Write the failing test for `formatElapsed`**

Create `src/utils/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatElapsed } from './time';

describe('formatElapsed', () => {
  it('formats sub-minute durations as 0:ss', () => {
    expect(formatElapsed(5000)).toBe('0:05');
  });

  it('formats multi-minute durations as m:ss', () => {
    expect(formatElapsed(65000)).toBe('1:05');
  });

  it('pads seconds under 10', () => {
    expect(formatElapsed(3 * 60_000 + 2000)).toBe('3:02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/time.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `formatElapsed`**

Create `src/utils/time.ts`:

```ts
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/time.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `useElapsedTime`**

Create `src/hooks/useElapsedTime.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElapsedTime } from './useElapsedTime';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useElapsedTime', () => {
  it('returns 0 when startIso is null', () => {
    const { result } = renderHook(() => useElapsedTime(null));
    expect(result.current).toBe(0);
  });

  it('ticks upward once per second while running', () => {
    const { result } = renderHook(() => useElapsedTime('2026-09-23T09:00:00.000Z'));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(3000);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/hooks/useElapsedTime.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `useElapsedTime`**

Create `src/hooks/useElapsedTime.ts`:

```ts
import { useEffect, useState } from 'react';

export function useElapsedTime(startIso: string | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startIso) {
      setElapsed(0);
      return;
    }
    const start = new Date(startIso).getTime();
    setElapsed(Date.now() - start);
    const interval = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(interval);
  }, [startIso]);

  return elapsed;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/hooks/useElapsedTime.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/utils/time.ts src/utils/time.test.ts src/hooks/useElapsedTime.ts src/hooks/useElapsedTime.test.ts
git commit -m "feat: add elapsed-time formatting and live-ticking hook"
```

---

### Task 10: ActivityButton and Edit Modals

**Files:**
- Create: `src/components/ActivityButton.tsx`
- Create: `src/components/EditCounterModal.tsx`
- Create: `src/components/EditTimerModal.tsx`
- Create: `src/components/ActivityButton.css`
- Test: `src/components/ActivityButton.test.tsx`
- Test: `src/components/EditCounterModal.test.tsx`
- Test: `src/components/EditTimerModal.test.tsx`

**Interfaces:**
- Consumes: `ActivityConfig` from `src/activities.ts`; `ActivityLog`, `CounterLog`, `TimerLog`, `TimerSession` from `src/types.ts`; `isSessionRunning` from `src/domain/day.ts`; `useElapsedTime` from `src/hooks/useElapsedTime.ts`; `formatElapsed` from `src/utils/time.ts`.
- Produces:
  - `<ActivityButton config log onTap onEdit />`
  - `<EditCounterModal config log onSave onClose />`
  - `<EditTimerModal config log onSave onClose />`

- [ ] **Step 1: Write the failing test for `ActivityButton`**

Create `src/components/ActivityButton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivityButton } from './ActivityButton';
import { ACTIVITIES } from '../activities';
import type { CounterLog, TimerLog } from '../types';

const diaperConfig = ACTIVITIES.find((a) => a.type === 'lightDiaper')!;
const napConfig = ACTIVITIES.find((a) => a.type === 'nap')!;

describe('ActivityButton', () => {
  it('shows the count badge for a counter activity and calls onTap when tapped', async () => {
    const log: CounterLog = { kind: 'counter', type: 'lightDiaper', count: 3 };
    const onTap = vi.fn();
    render(<ActivityButton config={diaperConfig} log={log} onTap={onTap} onEdit={vi.fn()} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^light diaper$/i }));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('shows an active state and elapsed readout while a timer is running', () => {
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [{ start: new Date().toISOString(), end: null }] };
    render(<ActivityButton config={napConfig} log={log} onTap={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^nap$/i })).toHaveClass('activity-button__main--active');
  });

  it('calls onEdit when the edit icon is tapped, without triggering onTap', async () => {
    const log: CounterLog = { kind: 'counter', type: 'lightDiaper', count: 0 };
    const onTap = vi.fn();
    const onEdit = vi.fn();
    render(<ActivityButton config={diaperConfig} log={log} onTap={onTap} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole('button', { name: /edit light diaper/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ActivityButton.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ActivityButton`**

Create `src/components/ActivityButton.css`:

```css
.activity-button {
  position: relative;
}

.activity-button__edit {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
  background: transparent;
  border: none;
  padding: 4px;
  opacity: 0.7;
}

.activity-button__main {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 12px;
  border: 1px solid #ccc;
  background: #fafafa;
}

.activity-button__main--active {
  background: #ffe8b0;
  border-color: #e0a800;
}

.activity-button__badge {
  font-weight: bold;
}

.activity-button__elapsed {
  font-variant-numeric: tabular-nums;
}
```

Create `src/components/ActivityButton.tsx`:

```tsx
import { AlertTriangle, Baby, CloudRain, Droplet, Droplets, Moon, Pencil, Waves } from 'lucide-react';
import type { ActivityConfig } from '../activities';
import type { ActivityLog } from '../types';
import { isSessionRunning } from '../domain/day';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { formatElapsed } from '../utils/time';
import './ActivityButton.css';

const ICONS = { Droplet, Droplets, CloudRain, Waves, Moon, Baby, AlertTriangle } as const;

type ActivityButtonProps = {
  config: ActivityConfig;
  log: ActivityLog;
  onTap: () => void;
  onEdit: () => void;
};

export function ActivityButton({ config, log, onTap, onEdit }: ActivityButtonProps) {
  const Icon = ICONS[config.icon];
  const running = log.kind === 'timer' && isSessionRunning(log);
  const runningStart =
    log.kind === 'timer' && running ? log.sessions[log.sessions.length - 1].start : null;
  const elapsedMs = useElapsedTime(runningStart);

  return (
    <div className="activity-button">
      <button
        type="button"
        className="activity-button__edit"
        aria-label={`Edit ${config.label}`}
        onClick={onEdit}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className={`activity-button__main${running ? ' activity-button__main--active' : ''}`}
        aria-label={config.label}
        onClick={onTap}
      >
        <Icon size={28} />
        <span>{config.label}</span>
        {log.kind === 'counter' && <span className="activity-button__badge">{log.count}</span>}
        {log.kind === 'timer' && running && (
          <span className="activity-button__elapsed">{formatElapsed(elapsedMs)}</span>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ActivityButton.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `EditCounterModal`**

Create `src/components/EditCounterModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditCounterModal } from './EditCounterModal';
import { ACTIVITIES } from '../activities';
import type { CounterLog } from '../types';

const config = ACTIVITIES.find((a) => a.type === 'spitUp')!;

describe('EditCounterModal', () => {
  it('prefills the current count and saves an edited value', async () => {
    const log: CounterLog = { kind: 'counter', type: 'spitUp', count: 2 };
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    const input = screen.getByLabelText<HTMLInputElement>(/spit up count/i);
    expect(input.value).toBe('2');

    await userEvent.clear(input);
    await userEvent.type(input, '7');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(7);
  });

  it('calls onClose when cancel is clicked', async () => {
    const log: CounterLog = { kind: 'counter', type: 'spitUp', count: 2 };
    const onClose = vi.fn();
    render(<EditCounterModal config={config} log={log} onSave={vi.fn()} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/components/EditCounterModal.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `EditCounterModal`**

Create `src/components/EditCounterModal.tsx`:

```tsx
import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { CounterLog } from '../types';

type EditCounterModalProps = {
  config: ActivityConfig;
  log: CounterLog;
  onSave: (count: number) => void;
  onClose: () => void;
};

export function EditCounterModal({ config, log, onSave, onClose }: EditCounterModalProps) {
  const [value, setValue] = useState(String(log.count));

  return (
    <div role="dialog" aria-label={`Edit ${config.label}`}>
      <label htmlFor="counter-input">{config.label} count</label>
      <input
        id="counter-input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => onSave(Math.max(0, Number(value) || 0))}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/components/EditCounterModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing test for `EditTimerModal`, including the running-session edge case**

Create `src/components/EditTimerModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditTimerModal } from './EditTimerModal';
import { ACTIVITIES } from '../activities';
import type { TimerLog } from '../types';

const config = ACTIVITIES.find((a) => a.type === 'nap')!;

describe('EditTimerModal', () => {
  it('lists existing sessions and saves an added session', async () => {
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [{ start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' }],
    };
    const onSave = vi.fn();
    render(<EditTimerModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getAllByLabelText(/start/i)).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /add session/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(2);
  });

  it('allows deleting a session, including one that is still running (end is empty)', async () => {
    const log: TimerLog = {
      kind: 'timer',
      type: 'nap',
      sessions: [
        { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' },
        { start: '2026-09-23T10:00:00.000Z', end: null },
      ],
    };
    const onSave = vi.fn();
    render(<EditTimerModal config={config} log={log} onSave={onSave} onClose={vi.fn()} />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete session/i });
    expect(deleteButtons).toHaveLength(2);
    await userEvent.click(deleteButtons[1]);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].end).toBe('2026-09-23T09:30:00.000Z');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- src/components/EditTimerModal.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 11: Implement `EditTimerModal`**

Create `src/components/EditTimerModal.tsx`:

```tsx
import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { TimerLog, TimerSession } from '../types';

type EditTimerModalProps = {
  config: ActivityConfig;
  log: TimerLog;
  onSave: (sessions: TimerSession[]) => void;
  onClose: () => void;
};

export function EditTimerModal({ config, log, onSave, onClose }: EditTimerModalProps) {
  const [sessions, setSessions] = useState<TimerSession[]>(log.sessions);

  function updateSession(index: number, patch: Partial<TimerSession>) {
    setSessions((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function deleteSession(index: number) {
    setSessions((prev) => prev.filter((_, i) => i !== index));
  }

  function addSession() {
    const now = new Date().toISOString();
    setSessions((prev) => [...prev, { start: now, end: now }]);
  }

  return (
    <div role="dialog" aria-label={`Edit ${config.label}`}>
      {sessions.map((session, index) => (
        <div key={index}>
          <label htmlFor={`start-${index}`}>Start {index + 1}</label>
          <input
            id={`start-${index}`}
            type="datetime-local"
            value={session.start.slice(0, 16)}
            onChange={(e) => updateSession(index, { start: new Date(e.target.value).toISOString() })}
          />
          <label htmlFor={`end-${index}`}>End {index + 1}</label>
          <input
            id={`end-${index}`}
            type="datetime-local"
            value={session.end ? session.end.slice(0, 16) : ''}
            onChange={(e) =>
              updateSession(index, { end: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
          <button type="button" aria-label={`Delete session ${index + 1}`} onClick={() => deleteSession(index)}>
            Delete session
          </button>
        </div>
      ))}
      <button type="button" onClick={addSession}>
        Add session
      </button>
      <button type="button" onClick={() => onSave(sessions)}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- src/components/EditTimerModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 13: Commit**

```bash
git add src/components/ActivityButton.tsx src/components/ActivityButton.css src/components/ActivityButton.test.tsx src/components/EditCounterModal.tsx src/components/EditCounterModal.test.tsx src/components/EditTimerModal.tsx src/components/EditTimerModal.test.tsx
git commit -m "feat: add activity button and edit modals"
```

---

### Task 11: MainScreen

**Files:**
- Create: `src/components/MainScreen.tsx`
- Create: `src/components/MainScreen.css`
- Test: `src/components/MainScreen.test.tsx`

**Interfaces:**
- Consumes: `ACTIVITIES` from `src/activities.ts`; `Day`, `ActivityType`, `TimerSession` from `src/types.ts`; `ActivityButton`, `EditCounterModal`, `EditTimerModal` from Task 10.
- Produces: `<MainScreen day onTap onEditCounter onEditTimer onEndDay />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/MainScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MainScreen } from './MainScreen';
import { createEmptyDay, incrementCounter } from '../domain/day';

describe('MainScreen', () => {
  it('renders all seven activity buttons and an End Day button', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    render(<MainScreen day={day} onTap={vi.fn()} onEditCounter={vi.fn()} onEditTimer={vi.fn()} onEndDay={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^light diaper$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^crying fit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end day/i })).toBeInTheDocument();
  });

  it('calls onTap with the right activity type when a button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onTap = vi.fn();
    render(<MainScreen day={day} onTap={onTap} onEditCounter={vi.fn()} onEditTimer={vi.fn()} onEndDay={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /^heavy diaper$/i }));
    expect(onTap).toHaveBeenCalledWith('heavyDiaper');
  });

  it('opens the counter edit modal and forwards the saved value', async () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z');
    day = incrementCounter(day, 'spitUp');
    const onEditCounter = vi.fn();
    render(<MainScreen day={day} onTap={vi.fn()} onEditCounter={onEditCounter} onEditTimer={vi.fn()} onEndDay={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /edit spit up/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEditCounter).toHaveBeenCalledWith('spitUp', 1);
  });

  it('calls onEndDay when the End Day button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onEndDay = vi.fn();
    render(<MainScreen day={day} onTap={vi.fn()} onEditCounter={vi.fn()} onEditTimer={vi.fn()} onEndDay={onEndDay} />);

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));
    expect(onEndDay).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/MainScreen.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `MainScreen`**

Create `src/components/MainScreen.css`:

```css
.main-screen__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
}

.main-screen__end-day {
  position: sticky;
  bottom: 0;
  width: 100%;
  padding: 16px;
  font-size: 1.1rem;
  font-weight: bold;
}
```

Create `src/components/MainScreen.tsx`:

```tsx
import { useState } from 'react';
import { ACTIVITIES } from '../activities';
import type { ActivityType, CounterLog, Day, TimerLog, TimerSession } from '../types';
import { ActivityButton } from './ActivityButton';
import { EditCounterModal } from './EditCounterModal';
import { EditTimerModal } from './EditTimerModal';
import './MainScreen.css';

type MainScreenProps = {
  day: Day;
  onTap: (type: ActivityType) => void;
  onEditCounter: (type: ActivityType, count: number) => void;
  onEditTimer: (type: ActivityType, sessions: TimerSession[]) => void;
  onEndDay: () => void;
};

export function MainScreen({ day, onTap, onEditCounter, onEditTimer, onEndDay }: MainScreenProps) {
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const editingConfig = ACTIVITIES.find((a) => a.type === editingType) ?? null;
  const editingLog = editingType ? day.logs[editingType] : null;

  return (
    <div>
      <div className="main-screen__grid">
        {ACTIVITIES.map((activity) => (
          <ActivityButton
            key={activity.type}
            config={activity}
            log={day.logs[activity.type]}
            onTap={() => onTap(activity.type)}
            onEdit={() => setEditingType(activity.type)}
          />
        ))}
      </div>
      <button type="button" className="main-screen__end-day" onClick={onEndDay}>
        End Day
      </button>
      {editingConfig && editingLog?.kind === 'counter' && (
        <EditCounterModal
          config={editingConfig}
          log={editingLog as CounterLog}
          onSave={(count) => {
            onEditCounter(editingConfig.type, count);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
        />
      )}
      {editingConfig && editingLog?.kind === 'timer' && (
        <EditTimerModal
          config={editingConfig}
          log={editingLog as TimerLog}
          onSave={(sessions) => {
            onEditTimer(editingConfig.type, sessions);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/MainScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/MainScreen.tsx src/components/MainScreen.css src/components/MainScreen.test.tsx
git commit -m "feat: add MainScreen with activity grid and End Day button"
```

---

### Task 12: Onboarding Components (Consent, Recovery Code, Start Time)

**Files:**
- Create: `src/components/ConsentModal.tsx`
- Create: `src/components/RecoveryCodeStep.tsx`
- Create: `src/components/StartTimeModal.tsx`
- Test: `src/components/ConsentModal.test.tsx`
- Test: `src/components/RecoveryCodeStep.test.tsx`
- Test: `src/components/StartTimeModal.test.tsx`

**Interfaces:**
- Produces:
  - `<ConsentModal onAccept onDecline />`
  - `<RecoveryCodeStep recoveryCode onContinueFresh onUseExistingCode />` where `onUseExistingCode: (code: string) => void`
  - `<StartTimeModal defaultTime onConfirm />` where `defaultTime`/`onConfirm` use ISO strings

- [ ] **Step 1: Write the failing test for `ConsentModal`**

Create `src/components/ConsentModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentModal } from './ConsentModal';

describe('ConsentModal', () => {
  it('calls onAccept when the user agrees', async () => {
    const onAccept = vi.fn();
    render(<ConsentModal onAccept={onAccept} onDecline={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when the user declines', async () => {
    const onDecline = vi.fn();
    render(<ConsentModal onAccept={vi.fn()} onDecline={onDecline} />);
    await userEvent.click(screen.getByRole('button', { name: /no|decline/i }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ConsentModal.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ConsentModal`**

Create `src/components/ConsentModal.tsx`:

```tsx
type ConsentModalProps = {
  onAccept: () => void;
  onDecline: () => void;
};

export function ConsentModal({ onAccept, onDecline }: ConsentModalProps) {
  return (
    <div role="dialog" aria-label="Consent">
      <p>
        This app tracks your baby's stats on this device, and can optionally sync to the cloud
        with a recovery code — no account needed. Is that OK?
      </p>
      <button type="button" onClick={onAccept}>
        Yes, OK
      </button>
      <button type="button" onClick={onDecline}>
        No, decline
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ConsentModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `RecoveryCodeStep`**

Create `src/components/RecoveryCodeStep.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryCodeStep } from './RecoveryCodeStep';

describe('RecoveryCodeStep', () => {
  it('shows the generated recovery code and continues fresh', async () => {
    const onContinueFresh = vi.fn();
    render(
      <RecoveryCodeStep recoveryCode="ABCD123456" onContinueFresh={onContinueFresh} onUseExistingCode={vi.fn()} />,
    );

    expect(screen.getByText('ABCD123456')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinueFresh).toHaveBeenCalledTimes(1);
  });

  it('lets the user switch to entering an existing code', async () => {
    const onUseExistingCode = vi.fn();
    render(
      <RecoveryCodeStep recoveryCode="ABCD123456" onContinueFresh={vi.fn()} onUseExistingCode={onUseExistingCode} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /already have a code/i }));
    await userEvent.type(screen.getByLabelText(/recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /submit|use this code/i }));

    expect(onUseExistingCode).toHaveBeenCalledWith('ZZZZ999999');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/components/RecoveryCodeStep.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `RecoveryCodeStep`**

Create `src/components/RecoveryCodeStep.tsx`:

```tsx
import { useState } from 'react';

type RecoveryCodeStepProps = {
  recoveryCode: string;
  onContinueFresh: () => void;
  onUseExistingCode: (code: string) => void;
};

export function RecoveryCodeStep({ recoveryCode, onContinueFresh, onUseExistingCode }: RecoveryCodeStepProps) {
  const [showEntry, setShowEntry] = useState(false);
  const [entered, setEntered] = useState('');

  if (showEntry) {
    return (
      <div>
        <label htmlFor="recovery-code-input">Recovery code</label>
        <input id="recovery-code-input" value={entered} onChange={(e) => setEntered(e.target.value)} />
        <button type="button" onClick={() => onUseExistingCode(entered.trim())}>
          Use this code
        </button>
        <button type="button" onClick={() => setShowEntry(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>Your recovery code:</p>
      <strong>{recoveryCode}</strong>
      <p>Save this to restore your data on another device. Don't share it — anyone with this code can access your data.</p>
      <button type="button" onClick={onContinueFresh}>
        Continue
      </button>
      <button type="button" onClick={() => setShowEntry(true)}>
        I already have a code
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/components/RecoveryCodeStep.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing test for `StartTimeModal`**

Create `src/components/StartTimeModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StartTimeModal } from './StartTimeModal';

describe('StartTimeModal', () => {
  it('defaults the input to the given time and confirms with it unchanged', async () => {
    const onConfirm = vi.fn();
    render(<StartTimeModal defaultTime="2026-09-23T08:00:00.000Z" onConfirm={onConfirm} />);

    const input = screen.getByLabelText<HTMLInputElement>(/start time/i);
    expect(input.value).toBe('2026-09-23T08:00');

    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));
    expect(onConfirm).toHaveBeenCalledWith('2026-09-23T08:00:00.000Z');
  });

  it('confirms with an edited time converted back to ISO', async () => {
    const onConfirm = vi.fn();
    render(<StartTimeModal defaultTime="2026-09-23T08:00:00.000Z" onConfirm={onConfirm} />);

    const input = screen.getByLabelText<HTMLInputElement>(/start time/i);
    await userEvent.clear(input);
    await userEvent.type(input, '2026-09-23T07:30');
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));

    expect(onConfirm).toHaveBeenCalledWith(new Date('2026-09-23T07:30').toISOString());
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- src/components/StartTimeModal.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 11: Implement `StartTimeModal`**

Create `src/components/StartTimeModal.tsx`:

```tsx
import { useState } from 'react';

type StartTimeModalProps = {
  defaultTime: string; // ISO
  onConfirm: (startedAt: string) => void;
};

export function StartTimeModal({ defaultTime, onConfirm }: StartTimeModalProps) {
  const [value, setValue] = useState(defaultTime.slice(0, 16));

  return (
    <div>
      <label htmlFor="start-time-input">Start time</label>
      <input
        id="start-time-input"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => onConfirm(new Date(value).toISOString())}>
        Confirm
      </button>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- src/components/StartTimeModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 13: Commit**

```bash
git add src/components/ConsentModal.tsx src/components/ConsentModal.test.tsx src/components/RecoveryCodeStep.tsx src/components/RecoveryCodeStep.test.tsx src/components/StartTimeModal.tsx src/components/StartTimeModal.test.tsx
git commit -m "feat: add onboarding components (consent, recovery code, start time)"
```

---

### Task 13: ReportScreen

**Files:**
- Create: `src/components/ReportScreen.tsx`
- Test: `src/components/ReportScreen.test.tsx`

**Interfaces:**
- Consumes: `Day`, `Settings` from `src/types.ts`; `buildPromptText` from `src/domain/reportText.ts`.
- Produces: `<ReportScreen day settings onGenerateAi aiLoading aiError onContinue />`.

- [ ] **Step 1: Write the failing test, covering the AI-hidden-without-key and copy-prompt cases**

Create `src/components/ReportScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportScreen } from './ReportScreen';
import { createEmptyDay } from '../domain/day';
import type { Settings } from '../types';

const baseDay = { ...createEmptyDay('2026-09-23T08:00:00.000Z'), endedAt: '2026-09-23T20:00:00.000Z', report: 'Offline report text', reportSource: 'offline' as const };

const settingsNoKey: Settings = { recoveryCode: 'X', llmProvider: null, llmApiKey: null };
const settingsWithKey: Settings = { recoveryCode: 'X', llmProvider: 'anthropic', llmApiKey: 'sk-test' };

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('ReportScreen', () => {
  it('shows the current report text', () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    expect(screen.getByText('Offline report text')).toBeInTheDocument();
  });

  it('hides the "Generate with AI" button when no LLM key is configured', () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /generate with ai/i })).not.toBeInTheDocument();
  });

  it('shows the "Generate with AI" button and calls onGenerateAi when a key is configured', async () => {
    const onGenerateAi = vi.fn();
    render(<ReportScreen day={baseDay} settings={settingsWithKey} onGenerateAi={onGenerateAi} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /generate with ai/i }));
    expect(onGenerateAi).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the offline report and an error message if AI generation failed', () => {
    render(<ReportScreen day={baseDay} settings={settingsWithKey} onGenerateAi={vi.fn()} aiLoading={false} aiError="Anthropic API error: 401" onContinue={vi.fn()} />);
    expect(screen.getByText('Offline report text')).toBeInTheDocument();
    expect(screen.getByText(/anthropic api error: 401/i)).toBeInTheDocument();
  });

  it('copies the prompt text to the clipboard when "Copy Prompt" is tapped', async () => {
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /copy prompt/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect((navigator.clipboard.writeText as any).mock.calls[0][0]).toContain('Light Diaper: 0');
  });

  it('calls onContinue when the user is done reviewing', async () => {
    const onContinue = vi.fn();
    render(<ReportScreen day={baseDay} settings={settingsNoKey} onGenerateAi={vi.fn()} aiLoading={false} aiError={null} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('button', { name: /continue|done|save/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ReportScreen.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ReportScreen`**

Create `src/components/ReportScreen.tsx`:

```tsx
import type { Day, Settings } from '../types';
import { buildPromptText } from '../domain/reportText';

type ReportScreenProps = {
  day: Day;
  settings: Settings;
  onGenerateAi: () => void;
  aiLoading: boolean;
  aiError: string | null;
  onContinue: () => void;
};

export function ReportScreen({ day, settings, onGenerateAi, aiLoading, aiError, onContinue }: ReportScreenProps) {
  const hasLlmKey = Boolean(settings.llmProvider && settings.llmApiKey);

  return (
    <div>
      <p>{day.report}</p>
      {aiError && <p role="alert">{aiError}</p>}
      {hasLlmKey && (
        <button type="button" onClick={onGenerateAi} disabled={aiLoading}>
          {aiLoading ? 'Generating…' : 'Generate with AI'}
        </button>
      )}
      <button type="button" onClick={() => navigator.clipboard.writeText(buildPromptText(day))}>
        Copy Prompt
      </button>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ReportScreen.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportScreen.tsx src/components/ReportScreen.test.tsx
git commit -m "feat: add ReportScreen with offline/AI/copy-prompt actions"
```

---

### Task 14: HistoryScreen, HistoryDetail, SettingsScreen

**Files:**
- Create: `src/components/HistoryScreen.tsx`
- Create: `src/components/HistoryDetail.tsx`
- Create: `src/components/SettingsScreen.tsx`
- Test: `src/components/HistoryScreen.test.tsx`
- Test: `src/components/HistoryDetail.test.tsx`
- Test: `src/components/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `Day`, `Settings`, `LlmProvider` from `src/types.ts`; `buildStatsSummary` from `src/domain/reportText.ts`.
- Produces:
  - `<HistoryScreen history onSelect onClose />`
  - `<HistoryDetail day onBack />`
  - `<SettingsScreen settings onUpdate onClose onEnterRecoveryCode />`

- [ ] **Step 1: Write the failing test for `HistoryScreen`**

Create `src/components/HistoryScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryScreen } from './HistoryScreen';
import { createEmptyDay } from '../domain/day';

describe('HistoryScreen', () => {
  it('shows a message when there is no history yet', () => {
    render(<HistoryScreen history={[]} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/no days tracked yet/i)).toBeInTheDocument();
  });

  it('lists each past day and calls onSelect when tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onSelect = vi.fn();
    render(<HistoryScreen history={[day]} onSelect={onSelect} onClose={vi.fn()} />);

    await userEvent.click(screen.getByText('2026-09-23'));
    expect(onSelect).toHaveBeenCalledWith(day);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/HistoryScreen.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `HistoryScreen`**

Create `src/components/HistoryScreen.tsx`:

```tsx
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
            <li key={day.date}>
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/HistoryScreen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `HistoryDetail`**

Create `src/components/HistoryDetail.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryDetail } from './HistoryDetail';
import { createEmptyDay, incrementCounter } from '../domain/day';

describe('HistoryDetail', () => {
  it('shows the saved report and stats summary for that day', () => {
    let day = createEmptyDay('2026-09-23T08:00:00.000Z');
    day = incrementCounter(day, 'lightDiaper');
    day = { ...day, endedAt: '2026-09-23T20:00:00.000Z', report: 'A very funny report.', reportSource: 'offline' };

    render(<HistoryDetail day={day} onBack={vi.fn()} />);

    expect(screen.getByText('A very funny report.')).toBeInTheDocument();
    expect(screen.getByText(/light diaper: 1/i)).toBeInTheDocument();
  });

  it('calls onBack when the back button is tapped', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const onBack = vi.fn();
    render(<HistoryDetail day={day} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/components/HistoryDetail.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `HistoryDetail`**

Create `src/components/HistoryDetail.tsx`:

```tsx
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
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/components/HistoryDetail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing test for `SettingsScreen`**

Create `src/components/SettingsScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from './SettingsScreen';
import type { Settings } from '../types';

const settings: Settings = { recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null };

describe('SettingsScreen', () => {
  it('shows the recovery code', () => {
    render(<SettingsScreen settings={settings} onUpdate={vi.fn()} onClose={vi.fn()} onEnterRecoveryCode={vi.fn()} />);
    expect(screen.getByText('ABCD123456')).toBeInTheDocument();
  });

  it('updates the provider and API key', async () => {
    const onUpdate = vi.fn();
    render(<SettingsScreen settings={settings} onUpdate={onUpdate} onClose={vi.fn()} onEnterRecoveryCode={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText(/provider/i), 'openai');
    expect(onUpdate).toHaveBeenCalledWith({ llmProvider: 'openai' });

    await userEvent.type(screen.getByLabelText(/api key/i), 'sk-test');
    expect(onUpdate).toHaveBeenCalledWith({ llmApiKey: 'sk-test' });
  });

  it('submits a manually entered recovery code', async () => {
    const onEnterRecoveryCode = vi.fn();
    render(<SettingsScreen settings={settings} onUpdate={vi.fn()} onClose={vi.fn()} onEnterRecoveryCode={onEnterRecoveryCode} />);

    await userEvent.type(screen.getByLabelText(/enter a different recovery code/i), 'ZZZZ999999');
    await userEvent.click(screen.getByRole('button', { name: /switch code/i }));

    expect(onEnterRecoveryCode).toHaveBeenCalledWith('ZZZZ999999');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- src/components/SettingsScreen.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 11: Implement `SettingsScreen`**

Create `src/components/SettingsScreen.tsx`:

```tsx
import { useState } from 'react';
import type { LlmProvider, Settings } from '../types';

type SettingsScreenProps = {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onEnterRecoveryCode: (code: string) => void;
};

export function SettingsScreen({ settings, onUpdate, onClose, onEnterRecoveryCode }: SettingsScreenProps) {
  const [newCode, setNewCode] = useState('');

  return (
    <div>
      <button type="button" onClick={onClose}>
        Close
      </button>

      <p>Your recovery code:</p>
      <strong>{settings.recoveryCode}</strong>

      <label htmlFor="provider-select">LLM provider</label>
      <select
        id="provider-select"
        value={settings.llmProvider ?? ''}
        onChange={(e) => onUpdate({ llmProvider: (e.target.value || null) as LlmProvider | null })}
      >
        <option value="">None</option>
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
      </select>

      <label htmlFor="api-key-input">API key</label>
      <input
        id="api-key-input"
        type="password"
        value={settings.llmApiKey ?? ''}
        onChange={(e) => onUpdate({ llmApiKey: e.target.value || null })}
      />

      <label htmlFor="new-code-input">Enter a different recovery code</label>
      <input id="new-code-input" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
      <button type="button" onClick={() => onEnterRecoveryCode(newCode.trim())}>
        Switch code
      </button>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- src/components/SettingsScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 13: Commit**

```bash
git add src/components/HistoryScreen.tsx src/components/HistoryScreen.test.tsx src/components/HistoryDetail.tsx src/components/HistoryDetail.test.tsx src/components/SettingsScreen.tsx src/components/SettingsScreen.test.tsx
git commit -m "feat: add history and settings screens"
```

---

### Task 15: App Integration

**Files:**
- Modify: `src/App.tsx` (replace scaffold placeholder entirely)
- Test: `src/App.test.tsx`
- Delete: `src/App.css` content not needed (leave file empty or remove import in `App.tsx`)

**Interfaces:**
- Consumes: every hook from Task 8/9 and every component from Tasks 10–14; `generateOfflineReport` from Task 5; `generateAiReport` from Task 6; `fetchSyncedData` from Task 7.
- Produces: the assembled `<App />` used by `src/main.tsx`.

- [ ] **Step 1: Write the failing integration test for the consent-decline path (Review Focus item)**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./storage/firebaseSync', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue(undefined),
  fetchSyncedData: vi.fn().mockResolvedValue(null),
  pushSyncedData: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('App: consent decline (Review Focus)', () => {
  it('stores nothing in localStorage if the user declines consent', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /no|decline/i }));

    expect(screen.getByText(/not tracking/i)).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL (current scaffold `App` doesn't render a consent modal).

- [ ] **Step 3: Implement the screen state machine in `App.tsx`**

Replace the contents of `src/App.tsx`:

```tsx
import { useState } from 'react';
import type { ActivityType, Day, TimerSession } from './types';
import { ConsentModal } from './components/ConsentModal';
import { RecoveryCodeStep } from './components/RecoveryCodeStep';
import { StartTimeModal } from './components/StartTimeModal';
import { MainScreen } from './components/MainScreen';
import { ReportScreen } from './components/ReportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { HistoryDetail } from './components/HistoryDetail';
import { SettingsScreen } from './components/SettingsScreen';
import { useDayState } from './hooks/useDayState';
import { useSettings } from './hooks/useSettings';
import { useHistory } from './hooks/useHistory';
import { useCloudSync } from './hooks/useCloudSync';
import { generateOfflineReport } from './domain/reportText';
import { generateAiReport } from './domain/aiReport';
import { fetchSyncedData } from './storage/firebaseSync';

type Screen =
  | 'consent'
  | 'declined'
  | 'recoveryCode'
  | 'startTime'
  | 'main'
  | 'report'
  | 'history'
  | 'historyDetail'
  | 'settings';

export function App() {
  const [screen, setScreen] = useState<Screen>('consent');
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<Day | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const dayState = useDayState();
  const { settings, updateSettings } = useSettings();
  const { history, addToHistory, replaceHistory } = useHistory();

  useCloudSync(settings.recoveryCode, dayState.day, history);

  function handleAccept() {
    setScreen(dayState.day ? 'main' : 'recoveryCode');
  }

  async function handleUseExistingCode(code: string) {
    setRestoreError(null);
    try {
      const remote = await fetchSyncedData(code);
      updateSettings({ recoveryCode: code });
      if (remote) {
        dayState.replaceDay(remote.currentDay);
        replaceHistory(remote.history);
      }
      setScreen(dayState.day || remote?.currentDay ? 'main' : 'startTime');
    } catch {
      setRestoreError('Could not reach that recovery code right now. Check the code and your connection, or continue fresh.');
    }
  }

  function handleTap(type: ActivityType) {
    const activityKind = dayState.day?.logs[type].kind;
    if (activityKind === 'counter') {
      dayState.incrementCounter(type);
    } else {
      dayState.toggleTimer(type);
    }
  }

  function handleEndDay() {
    const ended = dayState.finishDay();
    dayState.setDayReport(generateOfflineReport(ended), 'offline');
    setAiError(null);
    setScreen('report');
  }

  async function handleGenerateAi() {
    if (!dayState.day) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const text = await generateAiReport(dayState.day, settings);
      dayState.setDayReport(text, 'ai');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI report generation failed.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleContinueFromReport() {
    if (dayState.day) addToHistory(dayState.day);
    dayState.clearDay();
    setScreen('startTime');
  }

  if (screen === 'consent') {
    return <ConsentModal onAccept={handleAccept} onDecline={() => setScreen('declined')} />;
  }

  if (screen === 'declined') {
    return <p>Not tracking. Nothing has been saved.</p>;
  }

  if (screen === 'recoveryCode') {
    return (
      <div>
        <RecoveryCodeStep
          recoveryCode={settings.recoveryCode}
          onContinueFresh={() => setScreen('startTime')}
          onUseExistingCode={handleUseExistingCode}
        />
        {restoreError && <p role="alert">{restoreError}</p>}
      </div>
    );
  }

  if (screen === 'startTime') {
    return <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt); setScreen('main'); }} />;
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onUpdate={updateSettings}
        onClose={() => setScreen('main')}
        onEnterRecoveryCode={(code) => { handleUseExistingCode(code); setScreen('main'); }}
      />
    );
  }

  if (screen === 'history') {
    return (
      <HistoryScreen
        history={history}
        onSelect={(day) => { setSelectedHistoryDay(day); setScreen('historyDetail'); }}
        onClose={() => setScreen('main')}
      />
    );
  }

  if (screen === 'historyDetail' && selectedHistoryDay) {
    return <HistoryDetail day={selectedHistoryDay} onBack={() => setScreen('history')} />;
  }

  if (screen === 'report' && dayState.day) {
    return (
      <ReportScreen
        day={dayState.day}
        settings={settings}
        onGenerateAi={handleGenerateAi}
        aiLoading={aiLoading}
        aiError={aiError}
        onContinue={handleContinueFromReport}
      />
    );
  }

  if (dayState.day) {
    return (
      <div>
        <button type="button" onClick={() => setScreen('history')}>History</button>
        <button type="button" onClick={() => setScreen('settings')}>Settings</button>
        <MainScreen
          day={dayState.day}
          onTap={handleTap}
          onEditCounter={dayState.setCounterCount}
          onEditTimer={(type: ActivityType, sessions: TimerSession[]) => dayState.setTimerSessions(type, sessions)}
          onEndDay={handleEndDay}
        />
      </div>
    );
  }

  return <StartTimeModal defaultTime={new Date().toISOString()} onConfirm={(startedAt) => { dayState.startDay(startedAt); setScreen('main'); }} />;
}
```

Delete the leftover Vite boilerplate import if present: open `src/App.tsx` (already fully replaced above) — confirm no `import './App.css'` remains, and delete `src/App.css` if it's unused (`rm src/App.css` if it still exists from scaffolding).

- [ ] **Step 4: Run test to verify the decline path passes**

Run: `npm test -- src/App.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing full-flow smoke test**

Append to `src/App.test.tsx`:

```tsx
describe('App: full day flow', () => {
  it('goes from consent through tracking to a saved history entry', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // recovery code step, start fresh
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i })); // start time, accept default

    await userEvent.click(screen.getByRole('button', { name: /^light diaper$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^light diaper$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^nap$/i }));

    expect(screen.getByRole('button', { name: /^nap$/i })).toHaveClass('activity-button__main--active');

    await userEvent.click(screen.getByRole('button', { name: /^nap$/i })); // stop the nap timer

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));

    expect(screen.getByText(/here's how today went/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await userEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails first, then passes after any fixes**

Run: `npm test -- src/App.test.tsx`
Expected: run once to confirm the new test exercises real behavior (it should mostly pass given the implementation above); if it fails, fix the specific mismatch (e.g., an aria-label wording mismatch) rather than restructuring the state machine, then re-run until PASS (2 tests total).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: every test file across all tasks passes.

- [ ] **Step 8: Manual smoke check in the browser**

Run: `npm run dev`, open the printed local URL, and click through: consent → continue fresh → confirm start time → tap a few buttons (verify counts and a running timer's elapsed readout) → End Day → confirm the offline report renders → Continue → open History and confirm the day appears. Stop the dev server after.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: wire up App screen flow and full integration test"
```

---

## Post-Plan Manual Setup (not part of automated tasks)

To use the optional cloud sync in a real deployment, outside of this
codebase's automated tasks:

1. Create a Firebase project at the Firebase console.
2. Enable **Anonymous** sign-in under Authentication.
3. Create a **Firestore** database and deploy `firestore.rules` (via `firebase init` + `firebase deploy --only firestore:rules`).
4. Copy the web app config into `.env` (based on `.env.example`).
5. To use AI report generation, the user pastes their own Anthropic or OpenAI API key into Settings — no project-level setup needed for that part.
