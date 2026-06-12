import { type JSX } from 'preact';
import './button.css';

interface ButtonProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'lg';
  full?: boolean;
  color?: string;
}

export function Button({
  variant = 'primary',
  size = 'default',
  full = false,
  color,
  className = '',
  style,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'lg' && 'btn--lg',
    full && 'btn--full',
    className,
  ].filter(Boolean).join(' ');

  const btnStyle = color
    ? { ...((style as Record<string, string>) ?? {}), '--btn-color': color }
    : style;

  return (
    <button className={classes} style={btnStyle} {...rest}>
      {children}
    </button>
  );
}
