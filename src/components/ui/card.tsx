import { ComponentChildren } from 'preact';
import './card.css';

interface CardProps {
  children: ComponentChildren;
  bucketColor?: string;
  onClick?: () => void;
  className?: string;
  style?: Record<string, string>;
}

export function Card({ children, bucketColor, onClick, className = '', style }: CardProps) {
  return (
    <div 
      className={`ui-card ${bucketColor ? 'ui-card--themed' : ''} ${onClick ? 'ui-card--clickable' : ''} ${className}`}
      style={{
        ...style,
        ...(bucketColor ? { '--card-theme-color': bucketColor } as any : {})
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
