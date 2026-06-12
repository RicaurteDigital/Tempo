import { db } from '../db/database';
import type { TimeEvent } from '../db/schema';

export async function seedTodayOnly() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = today.getTime();

  const events: TimeEvent[] = [
    { bucket: 'sleep', start: dayStart, end: dayStart + 7 * 60 * 60 * 1000 }, // 00:00 - 07:00
    { bucket: 'body', start: dayStart + 7 * 60 * 60 * 1000, end: dayStart + 8 * 60 * 60 * 1000 }, // 07:00 - 08:00
    { bucket: 'transport', start: dayStart + 8 * 60 * 60 * 1000, end: dayStart + 8.5 * 60 * 60 * 1000 }, // 08:00 - 08:30
    { bucket: 'work', start: dayStart + 8.5 * 60 * 60 * 1000, end: dayStart + 12 * 60 * 60 * 1000 }, // 08:30 - 12:00
    { bucket: 'rest', start: dayStart + 12 * 60 * 60 * 1000, end: dayStart + 13 * 60 * 60 * 1000 }, // 12:00 - 13:00
    { bucket: 'work', start: dayStart + 13 * 60 * 60 * 1000, end: dayStart + 17 * 60 * 60 * 1000 }, // 13:00 - 17:00
    { bucket: 'leak', start: dayStart + 17 * 60 * 60 * 1000, end: dayStart + 17.5 * 60 * 60 * 1000 }, // 17:00 - 17:30
  ];

  await db.events.bulkAdd(events);
  console.log('[Seed] Today seeded with', events.length, 'events.');
}
