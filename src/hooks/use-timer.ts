// Reactive timer hook using Preact signals
// Updates at 1Hz, evaluates nudges in the same tick

import { signal } from '@preact/signals';
import type { ActiveSession } from '../db/schema';
import type { NudgeInfo } from '../services/nudges';
import { getActiveSession, computeElapsed } from '../services/timer';
import { shouldNudge } from '../services/nudges';
import { TIMER_TICK_MS } from '../utils/constants';

/** Reactive state signals */
export const activeSession = signal<ActiveSession | null>(null);
export const elapsedMs = signal<number>(0);
export const currentNudge = signal<NudgeInfo | null>(null);
export const isLoading = signal<boolean>(true);

let tickInterval: ReturnType<typeof setInterval> | null = null;
let lastNudgeCheck = 0;

/** Initialize timer state from DB (call once on app boot) */
export async function initTimer(): Promise<void> {
  isLoading.value = true;
  const session = await getActiveSession();
  activeSession.value = session;

  if (session) {
    elapsedMs.value = computeElapsed(session);
    startTicking();
  }

  isLoading.value = false;
}

/** Start the 1Hz display tick */
function startTicking(): void {
  if (tickInterval) return;

  tickInterval = setInterval(() => {
    const session = activeSession.value;
    if (!session) {
      stopTicking();
      return;
    }

    // Update elapsed (computed from timestamp, not incremented)
    elapsedMs.value = computeElapsed(session);

    // Evaluate nudge in the same 1Hz tick (correction E)
    const now = Date.now();
    if (now - lastNudgeCheck >= TIMER_TICK_MS) {
      lastNudgeCheck = now;
      shouldNudge(session.bucket, elapsedMs.value).then((nudge) => {
        currentNudge.value = nudge;
      });
    }
  }, TIMER_TICK_MS);
}

/** Stop the tick interval */
function stopTicking(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  currentNudge.value = null;
}

/** Called when a new session starts */
export function onSessionStarted(session: ActiveSession): void {
  activeSession.value = session;
  elapsedMs.value = 0;
  currentNudge.value = null;
  lastNudgeCheck = 0;
  startTicking();
}

/** Called when a session ends */
export function onSessionEnded(): void {
  activeSession.value = null;
  elapsedMs.value = 0;
  stopTicking();
}
