import { db } from '../db/database';
import type { BucketId } from '../utils/buckets';

export async function reassignEvent(id: number, newBucket: BucketId): Promise<void> {
  await db.events.update(id, { bucket: newBucket });
}

export async function deleteEvent(id: number): Promise<void> {
  await db.events.delete(id);
}
