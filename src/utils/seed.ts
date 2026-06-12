import { db } from '../db/database';
import type { TimeEvent } from '../db/schema';

export async function seedTodayOnly() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = today.getTime();

  const events: TimeEvent[] = [
    { bucket: 'sleep', start: dayStart, end: dayStart + 7 * 60 * 60 * 1000 }, // 00:00 - 07:00
    { bucket: 'deep-study', start: dayStart + 9 * 60 * 60 * 1000, end: dayStart + 11.5 * 60 * 60 * 1000 }, // 09:00 - 11:30
    { bucket: 'transport', start: dayStart + 11.5 * 60 * 60 * 1000, end: dayStart + 12 * 60 * 60 * 1000 }, // 11:30 - 12:00
    { bucket: 'body', start: dayStart + 12 * 60 * 60 * 1000, end: dayStart + 12.75 * 60 * 60 * 1000 }, // 12:00 - 12:45
  ];

  await db.events.bulkAdd(events);
  console.log('[Seed] Today seeded with', events.length, 'events.');
}
