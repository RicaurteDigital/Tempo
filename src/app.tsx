import { useEffect, useRef, useCallback } from 'preact/hooks';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import { activeSession, initTimer } from './hooks/use-timer';
import { initTokens } from './hooks/use-tokens';
import { requestPersistentStorage } from './db/database';
import { LiveSession } from './screens/live-session';
import { Transition } from './screens/transition';
import { TodayScreen } from './screens/today';
import { TabBar } from './components/ui/tab-bar';
import type { TimeEvent } from './db/schema';
import { signal } from '@preact/signals';
import './app.css';

const lastEvent = signal<TimeEvent | null>(null);

function SettingsPlaceholder() {
  return (
    <div style={{ padding: 'var(--section-gap)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
      <h2>Próximamente</h2>
    </div>
  );
}

function MainApp() {
  const { route } = useLocation();

  // Handle session end → show transition
  const handleSessionEnd = useCallback((event: TimeEvent) => {
    lastEvent.value = event;
    route('/transition');
  }, [route]);

  // Handle new session start → show live session
  const handleSessionStart = useCallback(() => {
    route('/tracker');
  }, [route]);

  return (
    <div className="app__content">
      <Router>
        <TodayScreen path="/" />
        <LiveSession path="/tracker" onSessionEnd={handleSessionEnd} />
        <Transition path="/transition" lastEvent={lastEvent.value} onSessionStart={handleSessionStart} />
        <SettingsPlaceholder path="/settings" />
        <TodayScreen default />
      </Router>
      <TabBar />
    </div>
  );
}

export function App() {
  const [booted, setBooted] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Boot sequence
  useEffect(() => {
    const boot = async () => {
      await initTokens();
      await initTimer();
      await requestPersistentStorage();
      setBooted(true);
    };
    boot();
  }, []);

  // Set initial route outside of render
  useEffect(() => {
    if (booted) {
      if (activeSession.value && window.location.pathname === '/') {
        // Use history.replaceState to not trigger an extra render loop before LocationProvider mounts
        window.history.replaceState(null, '', '/tracker');
      }
    }
  }, [booted]);

  // 5-rapid-tap detection on title (for future Dev Panel)
  const handleTitleTap = useCallback(() => {
    tapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      console.log('[Tempo] Dev panel access triggered — will be built in next step');
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 800);
  }, []);

  if (!booted) {
    return (
      <div className="app">
        <div className="app__loading">
          <span>Cargando…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Invisible title bar for dev panel access */}
      <div className="app__title" onClick={handleTitleTap}>
        <span className="app__title-text">Tempo</span>
      </div>

      <LocationProvider>
        <MainApp />
      </LocationProvider>
    </div>
  );
}

// Added useState to fix missing import
import { useState } from 'preact/hooks';
