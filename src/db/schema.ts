// Dexie database schema — version 1

import type { BucketId } from '../utils/buckets';

/** A tracked time event */
export interface TimeEvent {
  id?: number;
  bucket: BucketId;
  start: number;  // epoch ms
  end: number;    // epoch ms
  note?: string;
}

/** Key-value settings record */
export interface SettingRecord {
  key: string;
  value: unknown;
}

/** Design token profile */
export interface TokenRecord {
  key: string;
  value: Record<string, unknown>;
}

/** Achievement record */
export interface AchievementRecord {
  id?: number;
  type: string;
  unlockedAt: number; // epoch ms
  data?: Record<string, unknown>;
}

/** Weekly review record */
export interface ReviewRecord {
  id?: number;
  weekStart: number; // epoch ms (Monday 00:00)
  data: Record<string, unknown>;
}

/** Active session state (stored in settings) */
export interface ActiveSession {
  bucket: BucketId;
  startEpochMs: number;
}

/** Cached bucket statistics (stored in settings) */
export interface BucketStats {
  [bucket: string]: {
    count: number;
    totalMs: number;
  };
}

/** Nudge snooze state (stored in settings) */
export interface SnoozeState {
  bucket: BucketId;
  snoozedUntilMs: number; // epoch ms
}
