import { ComponentChildren } from 'preact';
import './pill.css';

interface PillProps {
  children: ComponentChildren;
  color: string;
}

export function Pill({ children, color }: PillProps) {
  return (
    <div 
      className="ui-pill"
      style={{ '--pill-color': color } as Record<string, string>}
    >
      {children}
    </div>
  );
}
