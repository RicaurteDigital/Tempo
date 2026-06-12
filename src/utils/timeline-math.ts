/** 
 * Pure functions for calculating positioning of blocks on the day timeline 
 */

/**
 * Calculates absolute top and height for a block in the agenda.
 * 
 * @param startMs - The start epoch timestamp of the event
 * @param endMs - The end epoch timestamp of the event
 * @param dayStartMs - The epoch timestamp of the start of the visible day (00:00)
 * @param hourHeightPx - The CSS token value for the height of one hour
 * @param minHeightPx - The CSS token value for the minimum height of a block
 * @returns { topPx, heightPx } to be applied as style
 */
export function calculateBlockPosition(
  startMs: number, 
  endMs: number, 
  dayStartMs: number, 
  hourHeightPx: number, 
  minHeightPx: number
) {
  // Clamp to the 24h day boundary
  const dayEndMs = dayStartMs + 86400000;
  
  const clampedStart = Math.max(dayStartMs, startMs);
  const clampedEnd = Math.min(dayEndMs, endMs);
  
  // Calculate relative to start of day
  const startMin = (clampedStart - dayStartMs) / 60000;
  const endMin = (clampedEnd - dayStartMs) / 60000;
  
  const pxPerMin = hourHeightPx / 60;
  
  const topPx = startMin * pxPerMin;
  const rawHeightPx = (endMin - startMin) * pxPerMin;
  
  const heightPx = Math.max(rawHeightPx, minHeightPx);
  
  return { topPx, heightPx };
}

/**
 * Calculate the position of the "Now" line.
 */
export function calculateNowPosition(nowMs: number, dayStartMs: number, hourHeightPx: number) {
  const startMin = (nowMs - dayStartMs) / 60000;
  const pxPerMin = hourHeightPx / 60;
  return startMin * pxPerMin;
}
