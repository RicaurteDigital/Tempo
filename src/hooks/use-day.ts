import { useState, useEffect } from 'preact/hooks';
import { liveQuery } from 'dexie';
import { getDayEvents } from '../services/stats';
import { activeSession, elapsedMs } from './use-timer';
import type { TimeEvent } from '../db/schema';
import type { BucketId } from '../utils/buckets';

export function useDay(dayStart: number) {
  const [events, setEvents] = useState<TimeEvent[]>([]);
  const [totals, setTotals] = useState<Record<BucketId, number>>({} as Record<BucketId, number>);
  
  // Sync DB events via liveQuery
  useEffect(() => {
    const observable = liveQuery(() => getDayEvents(dayStart));
    const subscription = observable.subscribe({
      next: (result) => setEvents(result)
    });
    return () => subscription.unsubscribe();
  }, [dayStart]);

  // Compute totals synchronously when events or live timer change
  useEffect(() => {
    const liveBucket = activeSession.value?.bucket;
    const liveElapsed = elapsedMs.value;
    const dayEnd = dayStart + 86400000;
    
    const computedTotals: Partial<Record<BucketId, number>> = {};
    
    for (const e of events) {
      const clampedStart = Math.max(dayStart, e.start);
      const clampedEnd = Math.min(dayEnd, e.end);
      const duration = clampedEnd - clampedStart;
      
      if (duration > 0) {
        computedTotals[e.bucket] = (computedTotals[e.bucket] || 0) + duration;
      }
    }
    
    if (liveBucket) {
      computedTotals[liveBucket] = (computedTotals[liveBucket] || 0) + liveElapsed;
    }
    
    setTotals(computedTotals as Record<BucketId, number>);
  }, [events, dayStart, activeSession.value?.bucket, elapsedMs.value]);

  return { 
    events, 
    totals, 
    liveEvent: activeSession.value 
      ? { 
          bucket: activeSession.value.bucket, 
          start: activeSession.value.startEpochMs, 
          end: activeSession.value.startEpochMs + elapsedMs.value 
        } as TimeEvent
      : null 
  };
}
