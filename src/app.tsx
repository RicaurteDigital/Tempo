import { useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import { activeSession, initTimer } from './hooks/use-timer';
import { initTokens } from './hooks/use-tokens';
import { requestPersistentStorage } from './db/database';
import { LiveSession } from './screens/live-session';
import { Transition } from './screens/transition';
import { TodayScreen } from './screens/today';
import { PlaceholderScreen } from './screens/placeholder';
import { TabBar } from './components/ui/tab-bar';
import type { TimeEvent } from './db/schema';
import { signal } from '@preact/signals';
import './app.css';

const lastEvent = signal<TimeEvent | null>(null);


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

  // Handle discarded session (<30s) -> show Hoy
  const handleDiscard = useCallback(() => {
    route('/');
  }, [route]);

  return (
    <div className="app__content">
      <Router>
        <Route path="/" component={TodayScreen} />
        <Route path="/tracker" component={() => <LiveSession onSessionEnd={handleSessionEnd} onDiscard={handleDiscard} />} />
        <Route path="/transition" component={() => <Transition lastEvent={lastEvent.value} onSessionStart={handleSessionStart} />} />
        <Route path="/metas" component={() => <PlaceholderScreen title="Metas" icon="🎯" description="Definición de promedios semanales y objetivos de vida." />} />
        <Route path="/review" component={() => <PlaceholderScreen title="Review" icon="📊" description="Análisis profundo y retrospectiva semanal brutal." />} />
        <Route path="/ajustes" component={() => <PlaceholderScreen title="Ajustes" icon="⚙️" description="Configuración de diseño y comportamiento." />} />
        <Route default component={TodayScreen} />
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
      {/* Invisible hit area for dev panel access */}
      <div className="app__title-hit-area" onClick={handleTitleTap} />

      <LocationProvider>
        <MainApp />
      </LocationProvider>
    </div>
  );
}

