import { useState, useEffect } from 'preact/hooks';
import { BUCKETS } from '../utils/buckets';
import { formatDuration, formatDate } from '../utils/format';
import { useDay } from '../hooks/use-day';
import { DayAgenda } from '../components/timeline/day-agenda';
import { StatBar } from '../components/ui/stat-bar';
import { BlockSheet } from '../components/timeline/block-sheet';
import type { TimeEvent } from '../db/schema';
import './today.css';

export function TodayScreen() {
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedBlock, setSelectedBlock] = useState<TimeEvent | null>(null);
  
  // For this screen, dayStart is midnight of current day
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = today.getTime();

  const { events, totals, liveEvent } = useDay(dayStart);

  // Update "now" every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="today-screen">
      <div className="today-screen__header">
        <h1 className="today-screen__date">{formatDate(today)}</h1>
        {/* Progress Rows */}
        <div className="today-screen__stats">
          {BUCKETS.map(bucket => {
            const totalMs = totals[bucket.id] || 0;
            if (totalMs === 0 && bucket.id !== 'work') return null; // Only show active buckets, but maybe always show work?
            if (totalMs === 0) return null;

            // Target = defaultAvgMs * 3 as a fake daily target for now
            // Requirements say "weekly target / 7 from settings". We don't have settings yet.
            const targetMs = bucket.defaultAvgMs * 2; 
            const isLeak = bucket.id === 'leak';
            const progress = isLeak ? 100 : Math.min((totalMs / targetMs) * 100, 100);

            return (
              <StatBar
                key={bucket.id}
                label={bucket.label}
                valueText={isLeak ? formatDuration(totalMs) : `${formatDuration(totalMs)} / ${formatDuration(targetMs)}`}
                progressPercent={progress}
                color={bucket.color}
                isLeak={isLeak}
                caption={isLeak ? "menos es mejor" : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Agenda */}
      <DayAgenda 
        events={events}
        liveEvent={liveEvent}
        nowMs={nowMs}
        dayStartMs={dayStart}
        onBlockTap={setSelectedBlock}
      />

      {/* Block Sheet */}
      {selectedBlock && (
        <BlockSheet 
          event={selectedBlock} 
          onClose={() => setSelectedBlock(null)} 
        />
      )}
    </div>
  );
}
