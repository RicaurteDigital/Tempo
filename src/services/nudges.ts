// Smart nudge engine — evaluates every 1Hz tick inside the timer loop

import { getSetting, setSetting } from '../db/database';
import type { SnoozeState } from '../db/schema';
import type { BucketId } from '../utils/buckets';
import { getBucketAverage, getBucketTodayMs } from './timer';
import { getBucket } from '../utils/buckets';
import { STORAGE_KEY_SNOOZE, WORK_CAP_MS, SNOOZE_DURATION_MS } from '../utils/constants';

export type NudgeType = 'over-average' | 'under-average' | 'work-cap';

export interface NudgeInfo {
  type: NudgeType;
  elapsedMs: number;
  averageMs: number;
  message: string;
  bucketLabel: string;
}

/** Check if a nudge should fire for the current session.
 *  Called every 1Hz tick inside the timer display loop.
 *  Returns null if no nudge, or a NudgeInfo if one should show. */
export async function shouldNudge(
  bucket: BucketId,
  elapsedMs: number
): Promise<NudgeInfo | null> {
  // Check snooze state first
  const snooze = await getSetting<SnoozeState>(STORAGE_KEY_SNOOZE);
  if (snooze && snooze.bucket === bucket && Date.now() < snooze.snoozedUntilMs) {
    return null; // Still snoozed
  }

  const bucketDef = getBucket(bucket);
  const averageMs = await getBucketAverage(bucket, bucketDef.defaultAvgMs);

  // Work cap warning: approaching 8h/day
  if (bucket === 'work') {
    const todayMs = await getBucketTodayMs('work');
    const totalMs = todayMs + elapsedMs;
    if (totalMs >= WORK_CAP_MS * 0.9 && totalMs < WORK_CAP_MS) {
      return {
        type: 'work-cap',
        elapsedMs,
        averageMs: WORK_CAP_MS,
        message: `Llevas ${formatMinutes(totalMs)} de trabajo hoy. Límite: 8h.`,
        bucketLabel: bucketDef.label,
      };
    }
  }

  // Over average nudge
  if (elapsedMs > averageMs) {
    return {
      type: 'over-average',
      elapsedMs,
      averageMs,
      message: `Parece que terminaste`,
      bucketLabel: bucketDef.label,
    };
  }

  return null;
}

/** Check if a just-ended block was significantly under average (interruption detection) */
export async function checkUnderAverage(
  bucket: BucketId,
  durationMs: number
): Promise<NudgeInfo | null> {
  const bucketDef = getBucket(bucket);
  const averageMs = await getBucketAverage(bucket, bucketDef.defaultAvgMs);

  // If ended at less than 40% of average, flag it
  if (durationMs < averageMs * 0.4 && averageMs > 0) {
    return {
      type: 'under-average',
      elapsedMs: durationMs,
      averageMs,
      message: '¿Interrupción o cambio de plan?',
      bucketLabel: bucketDef.label,
    };
  }

  return null;
}

/** Snooze nudges for the current bucket (15 min). Persists in DB. */
export async function snoozeNudge(bucket: BucketId): Promise<void> {
  const state: SnoozeState = {
    bucket,
    snoozedUntilMs: Date.now() + SNOOZE_DURATION_MS,
  };
  await setSetting(STORAGE_KEY_SNOOZE, state);
}

/** Clear snooze (called when session ends) */
export async function clearSnooze(): Promise<void> {
  await setSetting(STORAGE_KEY_SNOOZE, null);
}

/** Helper: format ms to human-readable minutes */
function formatMinutes(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
