export const RECORD_MOVES_UPDATED_EVENT = 'record-moves-updated';
const RECORD_MOVES_KEY = 'stone-age-record-moves-enabled';
const RECORDED_RUN_KEY_PREFIX = 'stone-age-recorded-run-';

export type RecordedInputCommand =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'select'; x: number; y: number }
  | { type: 'deselect' }
  | { type: 'wait'; durationMs?: number };

export interface RecordedRun {
  levelId: number;
  actions: RecordedInputCommand[];
  moves: number;
  recordedAt: string;
}

export const getRecordMovesEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (localStorage.getItem(RECORD_MOVES_KEY) ?? '0') === '1';
  } catch {
    return false;
  }
};

export const setRecordMovesEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECORD_MOVES_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new Event(RECORD_MOVES_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
};

const recordedRunKey = (levelId: number) => `${RECORDED_RUN_KEY_PREFIX}${levelId}`;

export const saveRecordedRun = (run: RecordedRun): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(recordedRunKey(run.levelId), JSON.stringify(run));
  } catch {
    // ignore storage failures (e.g. quota exceeded)
  }
};

export const getRecordedRun = (levelId: number): RecordedRun | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(recordedRunKey(levelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecordedRun;
    if (!parsed || !Array.isArray(parsed.actions) || parsed.actions.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearRecordedRun = (levelId: number): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(recordedRunKey(levelId));
  } catch {
    // ignore storage failures
  }
};
