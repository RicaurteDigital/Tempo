import { useState, useEffect } from 'preact/hooks';
import { BUCKETS } from '../utils/buckets';
import { formatDuration, formatDate } from '../utils/format';
import { useDay } from '../hooks/use-day';
import { DayAgenda } from '../components/timeline/day-agenda';
import { DayList } from '../components/timeline/day-list';
import { MetricCard } from '../components/ui/metric-card';
import { SessionCard } from '../components/ui/session-card';
import { Pill } from '../components/ui/pill';
import { BlockSheet } from '../components/timeline/block-sheet';
import type { TimeEvent } from '../db/schema';
import { getBucket } from '../utils/buckets';
import { useLocation } from 'preact-iso';
import { elapsedMs } from '../hooks/use-timer';
import './today.css';

export function TodayScreen() {
  const { route } = useLocation();
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedBlock, setSelectedBlock] = useState<TimeEvent | null>(null);
  const [viewMode, setViewModeState] = useState<'list'|'agenda'>(
    (localStorage.getItem('tempo-timeline-view') as 'list'|'agenda') || 'list'
  );

  const setViewMode = (mode: 'list'|'agenda') => {
    setViewModeState(mode);
    localStorage.setItem('tempo-timeline-view', mode);
  };

  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = today.getTime();

  const { events, totals, liveEvent } = useDay(dayStart);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const visibleBuckets = BUCKETS.filter(b => ['deep-study', 'work', 'body', 'leak'].includes(b.id));

  return (
    <div className="today-screen">
      <div className="today-screen__header-row">
        <div className="today-screen__title-col">
          <h1 className="today-screen__date">{formatDate(today).split(',')[0]}</h1>
          <span className="today-screen__date-sub">{formatDate(today).split(',')[1]?.trim() || ''}</span>
        </div>
        <Pill color="#FF9F0A">🔥 12-day</Pill>
      </div>

      <div className="today-screen__metrics">
        {liveEvent && (
          <div className="today-screen__live-card">
            <SessionCard
              compact
              bucketColor={getBucket(liveEvent.bucket).color}
              bucketLabel={getBucket(liveEvent.bucket).label}
              elapsedMs={elapsedMs.value}
              averageMs={BUCKETS.find(b => b.id === liveEvent.bucket)?.defaultAvgMs || 0}
              onClick={() => route('/tracker')}
            />
          </div>
        )}
        {visibleBuckets.map(bucket => {
          const totalMs = totals[bucket.id] || 0;
          const targetMs = bucket.defaultAvgMs * 2; 
          const isLeak = bucket.id === 'leak';
          const progress = isLeak ? 100 : Math.min((totalMs / targetMs) * 100, 100);

          return (
            <MetricCard
              key={bucket.id}
              label={bucket.label}
              valueText={isLeak ? formatDuration(totalMs) : formatDuration(totalMs)}
              targetText={isLeak ? undefined : formatDuration(targetMs)}
              progressPercent={progress}
              bucketColor={bucket.color}
              isLeak={isLeak}
            />
          );
        })}
      </div>

      <div className="today-screen__view-toggle">
        <button 
          className={`today-screen__toggle-btn ${viewMode === 'list' ? 'today-screen__toggle-btn--active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          Lista
        </button>
        <button 
          className={`today-screen__toggle-btn ${viewMode === 'agenda' ? 'today-screen__toggle-btn--active' : ''}`}
          onClick={() => setViewMode('agenda')}
        >
          Agenda
        </button>
      </div>

      <div className="today-screen__agenda-wrapper">
        {viewMode === 'list' ? (
          <DayList 
            events={events}
            liveEvent={liveEvent}
            onBlockTap={setSelectedBlock}
          />
        ) : (
          <DayAgenda 
            events={events}
            liveEvent={liveEvent}
            nowMs={nowMs}
            dayStartMs={dayStart}
            onBlockTap={setSelectedBlock}
          />
        )}
      </div>

      {selectedBlock && (
        <BlockSheet event={selectedBlock} onClose={() => setSelectedBlock(null)} />
      )}
    </div>
  );
}
