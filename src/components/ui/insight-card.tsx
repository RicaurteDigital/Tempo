import { Card } from './card';
import { Button } from './button';
import './insight-card.css';

interface InsightCardProps {
  icon: string;
  iconColor: string;
  bodyText: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function InsightCard({
  icon,
  iconColor,
  bodyText,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction
}: InsightCardProps) {
  return (
    <Card className="ui-insight-card">
      <div className="ui-insight-card__content">
        <div 
          className="ui-insight-card__icon"
          style={{ '--insight-color': iconColor } as Record<string, string>}
        >
          {icon}
        </div>
        <p className="ui-insight-card__text">{bodyText}</p>
      </div>
      <div className="ui-insight-card__actions">
        {secondaryActionLabel && onSecondaryAction && (
          <Button variant="ghost" onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
        )}
        <Button variant="primary" color="#38383A" onClick={onPrimaryAction}>{primaryActionLabel}</Button>
      </div>
    </Card>
  );
}
