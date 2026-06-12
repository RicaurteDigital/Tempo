// Timestamp-based timer engine — survives reload, tab kill, phone restart

import { db, getSetting, setSetting } from '../db/database';
import type { ActiveSession, BucketStats, TimeEvent } from '../db/schema';
import type { BucketId } from '../utils/buckets';
import { STORAGE_KEY_ACTIVE_SESSION, STORAGE_KEY_BUCKET_STATS } from '../utils/constants';

/** Get the currently active session, or null */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const session = await getSetting<ActiveSession>(STORAGE_KEY_ACTIVE_SESSION);
  return session ?? null;
}

/** Start a new session for the given bucket */
export async function startSession(bucket: BucketId): Promise<ActiveSession> {
  const session: ActiveSession = {
    bucket,
    startEpochMs: Date.now(),
  };
  await setSetting(STORAGE_KEY_ACTIVE_SESSION, session);
  return session;
}

/** End the current session, creating a TimeEvent */
export async function endSession(note?: string): Promise<TimeEvent | null> {
  const session = await getActiveSession();
  if (!session) return null;

  const now = Date.now();
  const event: TimeEvent = {
    bucket: session.bucket,
    start: session.startEpochMs,
    end: now,
    ...(note ? { note } : {}),
  };
  const duration = now - session.startEpochMs;

  if (duration < 30000) {
    await db.settings.delete(STORAGE_KEY_ACTIVE_SESSION);
    return null;
  }

  // Store event
  await db.events.add(event);

  // Update bucket stats (incremental aggregation)
  await updateBucketStats(session.bucket, duration);

  // Clear active session
  await db.settings.delete(STORAGE_KEY_ACTIVE_SESSION);

  return event;
}

/** Compute elapsed ms for the current session */
export function computeElapsed(session: ActiveSession): number {
  return Date.now() - session.startEpochMs;
}

/** Update cached bucket stats (incremental — never re-scans all events) */
async function updateBucketStats(bucket: BucketId, durationMs: number): Promise<void> {
  const stats = (await getSetting<BucketStats>(STORAGE_KEY_BUCKET_STATS)) ?? {};
  const current = stats[bucket] ?? { count: 0, totalMs: 0 };
  stats[bucket] = {
    count: current.count + 1,
    totalMs: current.totalMs + durationMs,
  };
  await setSetting(STORAGE_KEY_BUCKET_STATS, stats);
}

/** Get average duration for a bucket (returns defaultAvgMs if < 3 sessions) */
export async function getBucketAverage(bucket: BucketId, defaultAvgMs: number): Promise<number> {
  const stats = await getSetting<BucketStats>(STORAGE_KEY_BUCKET_STATS);
  const bucketData = stats?.[bucket];
  if (!bucketData || bucketData.count < 3) return defaultAvgMs;
  return bucketData.totalMs / bucketData.count;
}

/** Get total time for a bucket today */
export async function getBucketTodayMs(bucket: BucketId): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const events = await db.events
    .where('start')
    .aboveOrEqual(todayStart.getTime())
    .filter((e) => e.bucket === bucket)
    .toArray();
  return events.reduce((sum, e) => sum + (e.end - e.start), 0);
}
