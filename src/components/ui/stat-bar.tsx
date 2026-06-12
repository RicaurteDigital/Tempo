import './stat-bar.css';

interface StatBarProps {
  label: string;
  valueText: string;
  progressPercent: number;
  color: string;
  isLeak?: boolean;
  caption?: string;
}

export function StatBar({ label, valueText, progressPercent, color, isLeak, caption }: StatBarProps) {
  const clampedProgress = Math.min(Math.max(progressPercent, 0), 100);

  return (
    <div className="stat-bar">
      <div className="stat-bar__header">
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__value">{valueText}</span>
      </div>
      <div className="stat-bar__track">
        <div 
          className="stat-bar__fill" 
          style={{ 
            width: `${clampedProgress}%`, 
            backgroundColor: isLeak ? 'var(--color-leak)' : color 
          }} 
        />
      </div>
      {caption && (
        <span className="stat-bar__caption">{caption}</span>
      )}
    </div>
  );
}
