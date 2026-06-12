// Bucket definitions — the 7 life categories

export type BucketId = 'deep-study' | 'work' | 'transport' | 'body' | 'sleep' | 'rest' | 'leak';

export interface Bucket {
  id: BucketId;
  label: string;
  color: string;
  icon: string; // Emoji icon for the bucket
  defaultAvgMs: number; // Default average duration in ms (used for first 3 sessions)
}

export const BUCKETS: readonly Bucket[] = [
  { id: 'deep-study', label: 'Estudio PM',  color: '#5E5CE6', icon: '📚', defaultAvgMs: 90 * 60 * 1000 },
  { id: 'work',       label: 'Trabajo',     color: '#64D2FF', icon: '💼', defaultAvgMs: 120 * 60 * 1000 },
  { id: 'transport',  label: 'Transporte',  color: '#98989D', icon: '🚶', defaultAvgMs: 30 * 60 * 1000 },
  { id: 'body',       label: 'Cuerpo',      color: '#30D158', icon: '🏋️', defaultAvgMs: 60 * 60 * 1000 },
  { id: 'sleep',      label: 'Sueño',       color: '#BF5AF2', icon: '😴', defaultAvgMs: 480 * 60 * 1000 },
  { id: 'rest',       label: 'Descanso',    color: '#66D4CF', icon: '🧘', defaultAvgMs: 45 * 60 * 1000 },
  { id: 'leak',       label: 'Fuga',        color: '#FF453A', icon: '⚡', defaultAvgMs: 20 * 60 * 1000 },
] as const;

export const BUCKET_MAP = new Map<BucketId, Bucket>(
  BUCKETS.map((b) => [b.id, b])
);

export function getBucket(id: BucketId): Bucket {
  const bucket = BUCKET_MAP.get(id);
  if (!bucket) throw new Error(`Unknown bucket: ${id}`);
  return bucket;
}
