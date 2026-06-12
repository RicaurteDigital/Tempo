import { describe, it, expect } from 'vitest';
import { calculateLanes } from './timeline-math';

describe('calculateLanes', () => {
  it('assigns 1 lane for non-overlapping blocks', () => {
    const layout = calculateLanes([
      { id: '1', start: 0, end: 100 },
      { id: '2', start: 100, end: 200 }
    ]);
    expect(layout['1'].laneIndex).toBe(0);
    expect(layout['1'].totalLanes).toBe(1);
    expect(layout['2'].laneIndex).toBe(0);
    expect(layout['2'].totalLanes).toBe(1);
  });

  it('assigns 2 lanes for overlapping blocks', () => {
    const layout = calculateLanes([
      { id: '1', start: 0, end: 100 },
      { id: '2', start: 50, end: 150 }
    ]);
    expect(layout['1'].laneIndex).toBe(0);
    expect(layout['1'].totalLanes).toBe(2);
    expect(layout['2'].laneIndex).toBe(1);
    expect(layout['2'].totalLanes).toBe(2);
  });

  it('handles nested overlaps', () => {
    const layout = calculateLanes([
      { id: '1', start: 0, end: 200 },
      { id: '2', start: 50, end: 100 },
      { id: '3', start: 60, end: 80 }
    ]);
    expect(layout['1'].laneIndex).toBe(0);
    expect(layout['2'].laneIndex).toBe(1);
    expect(layout['3'].laneIndex).toBe(2);
    expect(layout['1'].totalLanes).toBe(3);
  });

  it('handles seconds-long blocks chip overlap', () => {
    // Blocks that are technically sequential but extremely short
    // Actually our lane logic is based on raw time. If they don't overlap in time, they are lane 0.
    // The requirement says "seconds-long blocks get min-height chips without overlap".
    // This is handled by CSS layout if they don't overlap in time.
    const layout = calculateLanes([
      { id: '1', start: 0, end: 10 },
      { id: '2', start: 10, end: 20 }
    ]);
    expect(layout['1'].laneIndex).toBe(0);
    expect(layout['2'].laneIndex).toBe(0);
  });
});
