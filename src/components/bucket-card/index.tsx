import { type JSX } from 'preact';
import type { Bucket } from '../../utils/buckets';
import './bucket-card.css';

interface BucketCardProps {
  bucket: Bucket;
  meta?: string;          // e.g., "Tu promedio: 1h 30m"
  onSelect: (id: string) => void;
}

/** Converts hex color to rgba with given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function BucketCard({ bucket, meta, onSelect }: BucketCardProps) {
  const handleClick = () => onSelect(bucket.id);

  const style = {
    '--bucket-color': bucket.color,
    '--bucket-color-tint': hexToRgba(bucket.color, 0.13),
  } as JSX.CSSProperties;

  return (
    <button
      className="bucket-card"
      style={style}
      onClick={handleClick}
      aria-label={`Iniciar ${bucket.label}`}
    >
      <div className="bucket-card__icon" aria-hidden="true">
        {bucket.icon}
      </div>
      <div className="bucket-card__info">
        <span className="bucket-card__name">{bucket.label}</span>
        {meta && <span className="bucket-card__meta">{meta}</span>}
      </div>
      <span className="bucket-card__chevron" aria-hidden="true">›</span>
    </button>
  );
}
