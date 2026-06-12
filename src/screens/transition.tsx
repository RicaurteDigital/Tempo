import { useState, useEffect } from 'preact/hooks';
import { BUCKETS, getBucket } from '../utils/buckets';
import type { BucketId } from '../utils/buckets';
import type { TimeEvent } from '../db/schema';
import { startSession, getBucketAverage } from '../services/timer';
import { checkUnderAverage } from '../services/nudges';
import { onSessionStarted } from '../hooks/use-timer';
import { formatDuration, formatDelta } from '../utils/format';
import { BucketCard } from '../components/bucket-card';
import type { NudgeInfo } from '../services/nudges';
import { InsightCard } from '../components/ui/insight-card';
import './transition.css';

interface TransitionProps {
  /** The event that was just logged, or null for first-run */
  lastEvent: TimeEvent | null;
  onSessionStart: () => void;
}

export function Transition({ lastEvent, onSessionStart }: TransitionProps) {
  const isFirstRun = !lastEvent;
  const [bucketAverages, setBucketAverages] = useState<Record<string, number>>({});
  const [underAvgAlert, setUnderAvgAlert] = useState<NudgeInfo | null>(null);

  // Load averages for all buckets
  useEffect(() => {
    const loadAverages = async () => {
      const avgs: Record<string, number> = {};
      for (const b of BUCKETS) {
        avgs[b.id] = await getBucketAverage(b.id, b.defaultAvgMs);
      }
      setBucketAverages(avgs);
    };
    loadAverages();
  }, []);

  // Check for under-average alert on post-block
  useEffect(() => {
    if (!lastEvent) return;
    checkUnderAverage(
      lastEvent.bucket,
      lastEvent.end - lastEvent.start
    ).then(setUnderAvgAlert);
  }, [lastEvent]);

  const handleSelect = async (bucketId: string) => {
    const session = await startSession(bucketId as BucketId);
    onSessionStarted(session);
    onSessionStart();
  };

  // Filter buckets: on post-block, exclude the just-ended bucket and sort by relevance
  const availableBuckets = isFirstRun
    ? [...BUCKETS]
    : BUCKETS.filter((b) => b.id !== lastEvent.bucket);

  // Build the last-event info
  const lastBucket = lastEvent ? getBucket(lastEvent.bucket) : null;
  const lastDuration = lastEvent ? lastEvent.end - lastEvent.start : 0;
  const lastAverage = lastEvent ? (bucketAverages[lastEvent.bucket] ?? lastBucket!.defaultAvgMs) : 0;

  return (
    <div className="transition">
      {/* Headline */}
      <h1 className="transition__headline">
        {isFirstRun ? '¿Con qué empezamos?' : '¿Qué sigue?'}
      </h1>

      {/* Confirmation card (post-block only) */}
      {lastEvent && lastBucket && (
        <>
          <div
            className="transition__confirm-card"
            style={{ '--confirm-color': lastBucket.color } as Record<string, string>}
          >
            <span className="transition__confirm-icon">{lastBucket.icon}</span>
            <div className="transition__confirm-info">
              <span className="transition__confirm-label">
                {lastBucket.label} · {formatDuration(lastDuration)}
              </span>
              <span className="transition__confirm-stats">
                Promedio: {formatDuration(lastAverage)}
              </span>
            </div>
            <span
              className={`transition__confirm-delta ${
                lastDuration > lastAverage
                  ? 'transition__confirm-delta--positive'
                  : 'transition__confirm-delta--negative'
              }`}
            >
              {formatDelta(lastDuration, lastAverage)}
            </span>
          </div>

          {/* Under-average interruption alert */}
          {underAvgAlert && (
            <InsightCard 
              icon="⚠️"
              iconColor="#FF453A"
              bodyText={underAvgAlert.message}
              primaryActionLabel="Ignorar"
              onPrimaryAction={() => setUnderAvgAlert(null)}
            />
          )}
        </>
      )}

      {/* Bucket cards */}
      <div className="transition__bucket-list">
        {availableBuckets.map((bucket) => (
          <BucketCard
            key={bucket.id}
            bucket={bucket}
            meta={
              bucketAverages[bucket.id]
                ? `Promedio: ${formatDuration(bucketAverages[bucket.id])}`
                : undefined
            }
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
