// Application-wide constants

export const APP_NAME = 'Tempo';
export const STORAGE_KEY_TOKENS = 'tempo-tokens';
export const STORAGE_KEY_ACTIVE_SESSION = 'activeSession';
export const STORAGE_KEY_BUCKET_STATS = 'bucketStats';
export const STORAGE_KEY_SNOOZE = 'nudgeSnooze';
export const STORAGE_KEY_PIN = 'pin';
export const STORAGE_KEY_PERSISTENCE = 'storagePersistence';

export const WORK_CAP_MS = 8 * 60 * 60 * 1000; // 8 hours in ms
export const SNOOZE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const MIN_SESSIONS_FOR_AVERAGE = 3;

export const TIMER_TICK_MS = 1000; // 1Hz timer tick

// Spring easing for animations
export const SPRING_EASING = 'cubic-bezier(.32,.72,0,1)';
export const SPRING_DURATION_MS = 300;
