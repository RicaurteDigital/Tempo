// Dexie database singleton with schema migrations

import Dexie, { type Table } from 'dexie';
import type {
  TimeEvent,
  SettingRecord,
  TokenRecord,
  AchievementRecord,
  ReviewRecord,
} from './schema';
import { STORAGE_KEY_PERSISTENCE } from '../utils/constants';

class TempoDatabase extends Dexie {
  events!: Table<TimeEvent, number>;
  settings!: Table<SettingRecord, string>;
  tokens!: Table<TokenRecord, string>;
  achievements!: Table<AchievementRecord, number>;
  reviews!: Table<ReviewRecord, number>;

  constructor() {
    super('TempoDatabase');

    // Version 1 — initial schema
    this.version(1).stores({
      events: '++id, bucket, start, end',
      settings: 'key',
      tokens: 'key',
      achievements: '++id, type, unlockedAt',
      reviews: '++id, weekStart',
    });
  }
}

/** Singleton database instance */
export const db = new TempoDatabase();

/** Request persistent storage and record the result */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;

  try {
    const granted = await navigator.storage.persist();
    await db.settings.put({ key: STORAGE_KEY_PERSISTENCE, value: granted });
    return granted;
  } catch {
    return false;
  }
}

/** Helper: get a setting by key with type safety */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const record = await db.settings.get(key);
  return record?.value as T | undefined;
}

/** Helper: set a setting by key */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value: value as unknown });
}
