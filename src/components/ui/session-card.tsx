import { Card } from './card';
import { Button } from './button';
import { TimerRing } from '../timer-ring';
import { formatTimerDisplay } from '../../utils/format';
import './session-card.css';

interface SessionCardProps {
  bucketColor: string;
  bucketLabel: string;
  elapsedMs: number;
  averageMs: number;
  onEnd?: () => void;
  onClick?: () => void;
  compact?: boolean;
}

export function SessionCard({ bucketColor, bucketLabel, elapsedMs, averageMs, onEnd, onClick, compact }: SessionCardProps) {
  const percent = averageMs > 0 ? Math.min(Math.round((elapsedMs / averageMs) * 100), 999) : 0;

  return (
    <Card 
      bucketColor={bucketColor} 
      className={`ui-session-card ${compact ? 'ui-session-card--compact' : ''}`}
      onClick={onClick}
    >
      <div className="ui-session-card__header">
        <span className="ui-session-card__label">CURRENT SESSION</span>
        {!compact && <span className="ui-session-card__percent">{percent}% vs avg</span>}
      </div>
      
      <div className="ui-session-card__body">
        <div className="ui-session-card__info">
          <h2 className="ui-session-card__bucket">{bucketLabel}</h2>
          <span className="ui-session-card__timer">
            {formatTimerDisplay(elapsedMs)}
          </span>
        </div>
        
        {/* We can place the TimerRing on the right side. The requirements say:
            "ring with percent label vs. average at top-right". 
            I'll use a small version of TimerRing if compact, else larger. */}
        <div className="ui-session-card__ring-wrapper" style={{ width: compact ? 48 : 80, height: compact ? 48 : 80 }}>
           <TimerRing 
            elapsed={elapsedMs} 
            average={averageMs} 
            color={bucketColor} 
            timeDisplay="" 
            label=""
          />
        </div>
      </div>

      {!compact && onEnd && (
        <div className="ui-session-card__footer">
          <Button variant="primary" size="lg" full color={bucketColor} onClick={(e) => { e.stopPropagation(); onEnd(); }}>
            Terminar bloque
          </Button>
        </div>
      )}
    </Card>
  );
}
