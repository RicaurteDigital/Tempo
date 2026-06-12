import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, setSetting } from '../db/database';
import { STORAGE_KEY_ACTIVE_SESSION } from '../utils/constants';
import {
  startSession,
  getActiveSession,
  endSession,
  computeElapsed,
} from './timer';

describe('Timer Engine', () => {
  beforeEach(async () => {
    await db.events.clear();
    await db.settings.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('t1: startSession persists {bucket, startEpochMs}; getElapsed grows with mocked Date.now', async () => {
    const now = 1600000000000;
    vi.setSystemTime(now);

    const session = await startSession('work');
    expect(session.bucket).toBe('work');
    expect(session.startEpochMs).toBe(now);

    const persisted = await getActiveSession();
    expect(persisted).toEqual(session);

    // Advance 5 minutes
    vi.setSystemTime(now + 5 * 60 * 1000);
    const elapsed = computeElapsed(session);
    expect(elapsed).toBe(5 * 60 * 1000);
  });

  it('t2: simulated reload (new module init reading persisted state) keeps the same start timestamp', async () => {
    const now = 1600000000000;
    vi.setSystemTime(now);

    const session = { bucket: 'deep-study' as const, startEpochMs: now };
    await setSetting(STORAGE_KEY_ACTIVE_SESSION, session);

    // Advance 10 minutes (simulating time passing while app is closed)
    vi.setSystemTime(now + 10 * 60 * 1000);

    const reloadedSession = await getActiveSession();
    expect(reloadedSession).toEqual(session);
    
    if (reloadedSession) {
      const elapsed = computeElapsed(reloadedSession);
      expect(elapsed).toBe(10 * 60 * 1000);
    } else {
      expect.fail('Session not found');
    }
  });

  it('t3: endSession creates event with correct start/end and clears active state', async () => {
    const start = 1600000000000;
    vi.setSystemTime(start);

    await startSession('rest');

    // Advance 1 hour
    const end = start + 60 * 60 * 1000;
    vi.setSystemTime(end);

    const event = await endSession();
    expect(event).toBeDefined();
    expect(event?.bucket).toBe('rest');
    expect(event?.start).toBe(start);
    expect(event?.end).toBe(end);

    const active = await getActiveSession();
    expect(active).toBeNull();
  });

  it('t4: blocks shorter than 30s are discarded, state still cleared', async () => {
    const start = 1600000000000;
    vi.setSystemTime(start);

    await startSession('transport');

    // Advance 20 seconds
    vi.setSystemTime(start + 20 * 1000);

    const event = await endSession();
    expect(event).toBeNull(); // Discarded

    const active = await getActiveSession();
    expect(active).toBeNull(); // State cleared
  });
});
