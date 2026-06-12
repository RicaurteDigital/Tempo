import { useEffect, useRef } from 'preact/hooks';
import type { TimeEvent } from '../../db/schema';
import { getBucket } from '../../utils/buckets';
import { formatDuration } from '../../utils/format';
import { calculateBlockPosition, calculateNowPosition, calculateLanes } from '../../utils/timeline-math';
import { tokens } from '../../hooks/use-tokens';
import './day-agenda.css';

interface DayAgendaProps {
  events: TimeEvent[];
  liveEvent: TimeEvent | null;
  nowMs: number;
  dayStartMs: number;
  onBlockTap: (event: TimeEvent) => void;
}

export function DayAgenda({ events, liveEvent, nowMs, dayStartMs, onBlockTap }: DayAgendaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hourHeight = tokens.value.timelineHourHeight;
  const minHeight = tokens.value.timelineBlockMinHeight;

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (containerRef.current) {
      const nowPos = calculateNowPosition(nowMs, dayStartMs, hourHeight);
      const viewportHeight = window.innerHeight;
      // Scroll so now-line is at ~35% of viewport
      containerRef.current.scrollTop = Math.max(0, nowPos - viewportHeight * 0.35);
    }
  }, []); // Only on mount

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const nowPos = calculateNowPosition(nowMs, dayStartMs, hourHeight);
  
  // Combine stored events and live event for rendering
  const allBlocks = [...events];
  if (liveEvent) {
    allBlocks.push(liveEvent);
  }

  // Generate a mock ID for live event if it doesn't have one, just for lane calc
  const eventsForLanes = allBlocks.map((ev, i) => ({
    ...ev,
    id: String(ev.id ?? `live-${i}`)
  }));
  const layoutMap = calculateLanes(eventsForLanes);

  return (
    <div className="day-agenda__viewport" ref={containerRef}>
      <div 
        className="day-agenda__container" 
        style={{ height: `${24 * hourHeight}px` }}
      >
        {/* Hour Gutter & Grid lines */}
        {hours.map(h => (
          <div 
            key={`hour-${h}`} 
            className="day-agenda__hour-row"
            style={{ top: `${h * hourHeight}px`, height: `${hourHeight}px` }}
          >
            <span className="day-agenda__hour-label">
              {h.toString().padStart(2, '0')}:00
            </span>
            <div className="day-agenda__hour-line" />
          </div>
        ))}

        {/* Blocks layer */}
        <div className="day-agenda__blocks-layer">
          {allBlocks.map((event, idx) => {
            const bucket = getBucket(event.bucket);
            const { topPx, heightPx } = calculateBlockPosition(event.start, event.end, dayStartMs, hourHeight, minHeight);
            
            const isLeak = event.bucket === 'leak';
            const isLive = liveEvent && liveEvent.start === event.start;
            const durationMs = event.end - event.start;
            
            const startD = new Date(event.start);
            const endD = new Date(event.end);
            const rangeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')} - ${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;
            
            // Lane logic
            const layout = layoutMap[event.id ?? `live-${idx}`] || { laneIndex: 0, totalLanes: 1 };
            const widthPct = 100 / layout.totalLanes;
            const leftPct = layout.laneIndex * widthPct;

            const isShort = heightPx <= 30; // Shorter blocks are chip-styled

            return (
              <div
                key={event.id ?? `live-${idx}`}
                className={`day-agenda__block ${isLive ? 'day-agenda__block--live' : ''} ${isLeak ? 'day-agenda__block--leak' : ''} ${isShort ? 'day-agenda__block--short' : ''}`}
                style={{ 
                  top: `${topPx}px`, 
                  height: `${heightPx}px`, 
                  width: `calc(${widthPct}% - 4px)`,
                  left: `${leftPct}%`,
                  '--block-color': bucket.color 
                } as Record<string, string>}
                onClick={() => onBlockTap(event)}
              >
                <div className="day-agenda__block-bg" />
                <div className="day-agenda__block-border" />
                <div className="day-agenda__block-content">
                  <span className="day-agenda__block-title">
                    {isLeak && <span className="day-agenda__block-icon">⚠</span>}
                    {isShort ? (isLeak ? '⚠' : bucket.label.split(' ')[0]) : bucket.label}
                  </span>
                  {!isShort && (
                    <span className="day-agenda__block-caption">{rangeStr} · {formatDuration(durationMs)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Now Line */}
        <div 
          className="day-agenda__now-line"
          style={{ top: `${nowPos}px` }}
        >
          <div 
            className="day-agenda__now-dot" 
            style={{ '--now-color': liveEvent ? getBucket(liveEvent.bucket).color : 'var(--color-text-secondary)' } as Record<string, string>}
          />
          <div 
            className="day-agenda__now-stroke"
            style={{ backgroundColor: liveEvent ? getBucket(liveEvent.bucket).color : 'var(--color-text-secondary)' }}
          />
        </div>
      </div>
    </div>
  );
}
