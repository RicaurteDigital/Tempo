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

export interface BlockLaneLayout {
  eventId: string;
  laneIndex: number;
  totalLanes: number;
}

/**
 * Calculates collision lanes for calendar blocks.
 * Overlapping blocks are placed in side-by-side lanes.
 */
export function calculateLanes(events: { id: string; start: number; end: number }[]): Record<string, BlockLaneLayout> {
  if (events.length === 0) return {};
  
  // Sort by start time, then end time descending
  const sorted = [...events].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  const columns: typeof sorted[] = [];
  const layout: Record<string, BlockLaneLayout> = {};

  for (const ev of sorted) {
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const lastEventInCol = col[col.length - 1];
      // If it doesn't overlap with the last event in this column, we can place it here
      if (lastEventInCol.end <= ev.start) {
        col.push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([ev]);
    }
  }

  // Calculate total lanes needed for overlapping groups
  // We'll find connected components of overlapping events to determine max lanes for each group
  // Simple approach: every event in a column gets laneIndex = col_index
  // totalLanes = total active columns at the time of the event.
  // Actually, standard calendar layout uses more complex algorithms, but a simple greedy coloring works for "side-by-side lanes".
  // Let's use the greedy column assignment for laneIndex, and totalLanes = max columns that overlap with this event.
  
  for (let i = 0; i < columns.length; i++) {
    for (const ev of columns[i]) {
      // Find how many columns have an event overlapping with `ev`
      let overlappingCols = 0;
      for (const col of columns) {
        if (col.some(c => c.start < ev.end && c.end > ev.start)) {
          overlappingCols++;
        }
      }
      layout[ev.id] = {
        eventId: ev.id,
        laneIndex: i,
        totalLanes: overlappingCols
      };
    }
  }

  return layout;
}
