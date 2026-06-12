import { Card } from './card';
import './metric-card.css';

interface MetricCardProps {
  label: string;
  valueText: string;
  targetText?: string;
  progressPercent: number;
  bucketColor: string;
  isLeak?: boolean;
}

export function MetricCard({ label, valueText, targetText, progressPercent, bucketColor, isLeak }: MetricCardProps) {
  const clampedProgress = Math.min(Math.max(progressPercent, 0), 100);

  return (
    <Card bucketColor={bucketColor} className="ui-metric-card">
      <span className="ui-metric-card__label">{label}</span>
      <div className="ui-metric-card__value-row">
        <span className="ui-metric-card__value">{valueText}</span>
        {targetText && (
          <span className="ui-metric-card__target">/ {targetText}</span>
        )}
      </div>
      <div className="ui-metric-card__track">
        <div 
          className="ui-metric-card__fill" 
          style={{ 
            width: `${clampedProgress}%`, 
            backgroundColor: isLeak ? 'var(--color-leak)' : bucketColor 
          }} 
        />
      </div>
    </Card>
  );
}
