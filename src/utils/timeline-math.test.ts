import { describe, it, expect } from 'vitest';
import { calculateBlockPosition } from './timeline-math';

describe('Timeline Math', () => {
  const dayStart = 1600000000000; // arbitrary midnight
  const hourHeight = 60; // easy math: 1px = 1min
  const minHeight = 15;

  it('1. normal block positions correctly', () => {
    // 01:00 to 02:00
    const start = dayStart + 60 * 60 * 1000;
    const end = start + 60 * 60 * 1000;
    
    const pos = calculateBlockPosition(start, end, dayStart, hourHeight, minHeight);
    expect(pos.topPx).toBe(60); // 1h in
    expect(pos.heightPx).toBe(60); // 1h duration
  });

  it('2. <15 min block uses min-height', () => {
    // 00:00 to 00:10
    const start = dayStart;
    const end = start + 10 * 60 * 1000;
    
    const pos = calculateBlockPosition(start, end, dayStart, hourHeight, minHeight);
    expect(pos.topPx).toBe(0);
    expect(pos.heightPx).toBe(15); // minHeight overrides raw 10px
  });

  it('3. cross-midnight clamp at 00:00', () => {
    // started 2 hours before midnight, ends 1 hour after
    const start = dayStart - 2 * 60 * 60 * 1000;
    const end = dayStart + 1 * 60 * 60 * 1000;
    
    const pos = calculateBlockPosition(start, end, dayStart, hourHeight, minHeight);
    expect(pos.topPx).toBe(0); // Clamped to 00:00
    expect(pos.heightPx).toBe(60); // Only shows the 1h within the visible day
  });

  it('4. block ending exactly 24:00', () => {
    const start = dayStart + 23 * 60 * 60 * 1000;
    const end = dayStart + 24 * 60 * 60 * 1000;
    
    const pos = calculateBlockPosition(start, end, dayStart, hourHeight, minHeight);
    expect(pos.topPx).toBe(23 * 60);
    expect(pos.heightPx).toBe(60);
  });

  it('5. live block top/height', () => {
    // Same math applies. Just testing the math directly.
    const start = dayStart + 30 * 60 * 1000; // 00:30
    const end = start + 45 * 60 * 1000; // ends 01:15
    
    const pos = calculateBlockPosition(start, end, dayStart, hourHeight, minHeight);
    expect(pos.topPx).toBe(30);
    expect(pos.heightPx).toBe(45);
  });
});
