import './timer-ring.css';

interface TimerRingProps {
  elapsed: number;     // ms
  average: number;     // ms (for progress ring fill)
  color: string;       // bucket color
  timeDisplay: string; // formatted time string
  label: string;       // bucket label
}

export function TimerRing({ elapsed, average, color, timeDisplay, label }: TimerRingProps) {
  // Ring geometry — fixed viewBox, CSS handles actual size
  const size = 300;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = average > 0 ? Math.min(elapsed / average, 1) : 0;
  const dashoffset = circumference * (1 - progress);

  return (
    <div className="timer-ring" style={{ '--ring-color': color } as Record<string, string>}>
      <svg
        className="timer-ring__svg"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          className="timer-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          className="timer-ring__progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{ stroke: color }}
        />
      </svg>

      <div className="timer-ring__content">
        <span
          className="timer-ring__time"
          role="timer"
          aria-live="polite"
          aria-label={`Tiempo transcurrido: ${timeDisplay}`}
        >
          {timeDisplay}
        </span>
        <span className="timer-ring__label">{label}</span>
      </div>
    </div>
  );
}
