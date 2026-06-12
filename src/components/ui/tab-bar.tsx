import { useLocation } from 'preact-iso';
import { activeSession } from '../../hooks/use-timer';
import { getBucket } from '../../utils/buckets';
import './tab-bar.css';

export function TabBar() {
  const { url, route } = useLocation();
  const session = activeSession.value;
  const isTransition = url === '/transition';

  // "Tab bar hidden on Transition and on PIN gate"
  // Assuming PIN gate is not built yet, but Transition is.
  if (isTransition) return null;

  // "Active tab tinted with the running bucket's color (gray if none)."
  const activeColor = session ? getBucket(session.bucket).color : 'var(--color-text-primary)';

  const tabs = [
    { path: '/', icon: '📅', label: 'Hoy' },
    { path: '/tracker', icon: '⏱️', label: 'Tracker' },
    { path: '/metas', icon: '🎯', label: 'Metas' },
    { path: '/review', icon: '📊', label: 'Review' },
    { path: '/ajustes', icon: '⚙️', label: 'Ajustes' },
  ];

  return (
    <nav className="tab-bar">
      {tabs.map((tab) => {
        const isActive = url === tab.path;
        return (
          <button
            key={tab.path}
            className={`tab-bar__item ${isActive ? 'tab-bar__item--active' : ''}`}
            onClick={() => route(tab.path)}
            style={{ '--tab-color': isActive ? activeColor : 'var(--color-text-secondary)' } as Record<string, string>}
          >
            <span className="tab-bar__icon">{tab.icon}</span>
            <span className="tab-bar__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
