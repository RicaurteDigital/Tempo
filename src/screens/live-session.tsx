import { useEffect, useState } from 'preact/hooks';
import { activeSession, elapsedMs, currentNudge } from '../hooks/use-timer';
import { endSession, getBucketAverage } from '../services/timer';
import { snoozeNudge, clearSnooze } from '../services/nudges';
import { onSessionEnded } from '../hooks/use-timer';
import { getBucket } from '../utils/buckets';
import { SessionCard } from '../components/ui/session-card';
import { InsightCard } from '../components/ui/insight-card';
import type { TimeEvent } from '../db/schema';
import './live-session.css';

interface LiveSessionProps {
  onSessionEnd: (event: TimeEvent) => void;
  onDiscard: () => void;
}

export function LiveSession({ onSessionEnd, onDiscard }: LiveSessionProps) {
  const session = activeSession.value;
  const elapsed = elapsedMs.value;
  const nudge = currentNudge.value;
  const [average, setAverage] = useState<number>(0);
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Load average for the current bucket
  useEffect(() => {
    if (!session) return;
    const bucket = getBucket(session.bucket);
    getBucketAverage(session.bucket, bucket.defaultAvgMs).then(setAverage);
  }, [session?.bucket]);

  // Show nudge when one fires (but not if user dismissed it)
  useEffect(() => {
    if (nudge && !nudgeDismissed) {
      setShowNudge(true);
    }
  }, [nudge, nudgeDismissed]);

  if (!session) return null;

  const bucket = getBucket(session.bucket);

  const handleEnd = async () => {
    setShowNudge(false);
    await clearSnooze();
    const event = await endSession();
    onSessionEnded();
    if (event) onSessionEnd(event);
    else onDiscard();
  };

  const handleNudgeEnd = async () => {
    setShowNudge(false);
    await clearSnooze();
    const event = await endSession();
    onSessionEnded();
    if (event) onSessionEnd(event);
    else onDiscard();
  };

  const handleNudgeContinue = async () => {
    setShowNudge(false);
    setNudgeDismissed(true);
    await snoozeNudge(session.bucket);
    // After snooze period, allow nudge again
    setTimeout(() => setNudgeDismissed(false), 15 * 60 * 1000);
  };

  return (
    <div className="live-session">
      <SessionCard
        bucketColor={bucket.color}
        bucketLabel={bucket.label}
        elapsedMs={elapsed}
        averageMs={average}
        onEnd={handleEnd}
      />

      {/* Nudge bottom sheet is handled in SessionCard or via NudgeSheet, but wait...
          the spec says "Nudge/insight cards: icon chip ... primary filled gray-700 button + text button"
          This means Nudge should be an InsightCard rendered right below the SessionCard! */}
      {showNudge && nudge && (
        <div className="live-session__nudge-wrapper">
          <InsightCard
            icon="🔔"
            iconColor={bucket.color}
            bodyText={nudge.message}
            primaryActionLabel="Terminar"
            onPrimaryAction={handleNudgeEnd}
            secondaryActionLabel="Continuar"
            onSecondaryAction={handleNudgeContinue}
          />
        </div>
      )}
    </div>
  );
}
