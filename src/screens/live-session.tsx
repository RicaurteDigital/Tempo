import { useEffect, useState } from 'preact/hooks';
import { activeSession, elapsedMs, currentNudge } from '../hooks/use-timer';
import { endSession, getBucketAverage } from '../services/timer';
import { snoozeNudge, clearSnooze } from '../services/nudges';
import { onSessionEnded } from '../hooks/use-timer';
import { getBucket } from '../utils/buckets';
import { formatTimerDisplay, formatDuration } from '../utils/format';
import { TimerRing } from '../components/timer-ring';
import { NudgeSheet } from '../components/nudge-sheet';
import { Button } from '../components/ui/button';
import type { TimeEvent } from '../db/schema';
import './live-session.css';

interface LiveSessionProps {
  onSessionEnd: (event: TimeEvent) => void;
}

export function LiveSession({ onSessionEnd }: LiveSessionProps) {
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
  };

  const handleNudgeEnd = async () => {
    setShowNudge(false);
    await clearSnooze();
    const event = await endSession();
    onSessionEnded();
    if (event) onSessionEnd(event);
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
      {/* Bucket indicator pill */}
      <div
        className="live-session__bucket-indicator"
        style={{ '--bucket-color': bucket.color } as Record<string, string>}
      >
        <div className="live-session__bucket-dot" />
        <span className="live-session__bucket-name">{bucket.label}</span>
      </div>

      {/* Hero timer ring */}
      <TimerRing
        elapsed={elapsed}
        average={average}
        color={bucket.color}
        timeDisplay={formatTimerDisplay(elapsed)}
        label={bucket.label}
      />

      {/* Average info */}
      <span className="live-session__avg-info">
        Promedio: {formatDuration(average)}
      </span>

      {/* End button */}
      <div className="live-session__end-btn">
        <Button
          variant="primary"
          size="lg"
          full
          color={bucket.color}
          onClick={handleEnd}
        >
          Terminar bloque
        </Button>
      </div>

      {/* Nudge bottom sheet */}
      {showNudge && nudge && (
        <NudgeSheet
          nudge={nudge}
          bucketColor={bucket.color}
          onEnd={handleNudgeEnd}
          onContinue={handleNudgeContinue}
        />
      )}
    </div>
  );
}
