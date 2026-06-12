import { Card } from '../components/ui/card';
import './placeholder.css';

interface PlaceholderScreenProps {
  title: string;
  icon: string;
  description: string;
}

export function PlaceholderScreen({ title, icon, description }: PlaceholderScreenProps) {
  return (
    <div className="placeholder-screen">
      <Card className="placeholder-screen__card">
        <div className="placeholder-screen__icon">{icon}</div>
        <h2 className="placeholder-screen__title">{title}</h2>
        <span className="placeholder-screen__badge">Próximamente en CP-3/CP-4</span>
        <p className="placeholder-screen__desc">{description}</p>
      </Card>
    </div>
  );
}
