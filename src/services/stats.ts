import { db } from '../db/database';
import type { TimeEvent } from '../db/schema';
import type { BucketId } from '../utils/buckets';

export async function getDayEvents(dayStart: number): Promise<TimeEvent[]> {
  const dayEnd = dayStart + 86400000;
  
  // Indexed range query: start time between dayStart - 24h and dayEnd
  // This catches events starting yesterday that might bleed into today,
  // plus all events starting today.
  const events = await db.events
    .where('start')
    .between(dayStart - 86400000, dayEnd)
    .toArray();
    
  // Filter out events that ended before today even started
  return events.filter((e) => e.end > dayStart);
}

export async function getDayTotals(dayStart: number, liveElapsedMs?: number, liveBucket?: BucketId): Promise<Record<BucketId, number>> {
  const events = await getDayEvents(dayStart);
  const dayEnd = dayStart + 86400000;
  
  const totals: Partial<Record<BucketId, number>> = {};
  
  for (const e of events) {
    const clampedStart = Math.max(dayStart, e.start);
    const clampedEnd = Math.min(dayEnd, e.end);
    const duration = clampedEnd - clampedStart;
    
    if (duration > 0) {
      totals[e.bucket] = (totals[e.bucket] || 0) + duration;
    }
  }
  
  if (liveBucket && liveElapsedMs !== undefined) {
    totals[liveBucket] = (totals[liveBucket] || 0) + liveElapsedMs;
  }
  
  return totals as Record<BucketId, number>;
}
