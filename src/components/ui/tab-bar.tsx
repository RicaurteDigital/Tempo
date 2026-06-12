import { useLocation } from 'preact-iso';
import { activeSession } from '../../hooks/use-timer';
import { getBucket } from '../../utils/buckets';
import './tab-bar.css';

export function TabBar() {
  const { url, route } = useLocation();
  const session = activeSession.value;

  const currentBucketColor = session ? getBucket(session.bucket).color : 'var(--color-text-primary)';

  const tabs = [
    { path: '/', label: 'Hoy', icon: '📅' },
    { path: '/tracker', label: 'Tracker', icon: '⏱️' },
    { path: '/settings', label: 'Ajustes', icon: '⚙️' }
  ];

  return (
    <div className="tab-bar">
      {tabs.map(tab => {
        const isActive = url === tab.path || (tab.path !== '/' && url.startsWith(tab.path));
        return (
          <button 
            key={tab.path}
            className={`tab-bar__item ${isActive ? 'tab-bar__item--active' : ''}`}
            onClick={() => route(tab.path)}
            style={{ '--active-color': currentBucketColor } as Record<string, string>}
          >
            <span className="tab-bar__icon">{tab.icon}</span>
            <span className="tab-bar__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
