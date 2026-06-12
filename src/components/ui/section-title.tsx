import { ComponentChildren } from 'preact';
import './section-title.css';

interface SectionTitleProps {
  children: ComponentChildren;
}

export function SectionTitle({ children }: SectionTitleProps) {
  return <h2 className="ui-section-title">{children}</h2>;
}
