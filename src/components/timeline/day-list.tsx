import { getBucket } from '../../utils/buckets';
import { formatDuration } from '../../utils/format';
import type { TimeEvent } from '../../db/schema';
import './day-list.css';

interface DayListProps {
  events: TimeEvent[];
  liveEvent: TimeEvent | null;
  onBlockTap: (event: TimeEvent) => void;
}

export function DayList({ events, liveEvent, onBlockTap }: DayListProps) {
  const allBlocks = [...events];
  if (liveEvent) {
    allBlocks.push(liveEvent);
  }
  
  // Sort events chronologically (just in case)
  allBlocks.sort((a, b) => a.start - b.start);

  return (
    <div className="day-list">
      {allBlocks.map((event, idx) => {
        const bucket = getBucket(event.bucket);
        const isLeak = event.bucket === 'leak';
        const isLive = liveEvent && liveEvent.start === event.start;
        const durationMs = event.end - event.start;

        const startD = new Date(event.start);
        const endD = new Date(event.end);
        const rangeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')} - ${isLive ? 'Ahora' : `${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`}`;

        return (
          <div key={event.id ?? `live-${idx}`} className="day-list__item" onClick={() => onBlockTap(event)}>
            {/* Timeline track + node */}
            <div className="day-list__track">
              <div 
                className={`day-list__node ${isLeak ? 'day-list__node--leak' : ''}`}
                style={{ '--node-color': isLeak ? 'var(--color-leak)' : bucket.color } as Record<string, string>}
              >
                {isLeak ? '⚠' : ''}
              </div>
              {idx < allBlocks.length - 1 && <div className="day-list__line" />}
            </div>

            {/* Card */}
            <div className={`day-list__card ${isLive ? 'day-list__card--live' : ''}`}>
              <div className="day-list__card-header">
                <span className="day-list__card-title" style={{ color: isLeak ? 'var(--color-leak)' : 'var(--color-text-primary)' }}>
                  {isLeak ? 'Fuga: sin asignar' : bucket.label}
                </span>
                <span className="day-list__card-duration">{formatDuration(durationMs)}</span>
              </div>
              <span className="day-list__card-caption">{rangeStr}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
