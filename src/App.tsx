import { useEffect, useState } from 'react';
import { activateAudio, connect } from './engine/engine';
import { useDJ } from './engine/store';
import { handleCallback, hasSession } from './lib/auth';
import { Browser } from './ui/Browser';
import { Deck } from './ui/Deck';
import { Login } from './ui/Login';
import { Mixer } from './ui/Mixer';
import { Settings } from './ui/Settings';
import { TrackView } from './ui/TrackView';

function TopBar({ onSettings }: { onSettings: () => void }) {
  const status = useDJ((s) => s.status);
  const msg = useDJ((s) => s.statusMsg);
  const user = useDJ((s) => s.user);
  const label = status === 'ready' ? 'Conectado' : status === 'error' ? msg : msg || 'Conectando…';
  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 64 64" className="brand-mark">
          <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="5" />
          <circle cx="32" cy="32" r="15" fill="none" stroke="#2f8cff" strokeWidth="5" />
          <circle cx="32" cy="32" r="5" fill="#ff6a2b" />
        </svg>
        <span>Spoty<b>DJ</b></span>
      </div>
      <div className={`conn ${status}`} title={label}>
        <i />
        <span>{label}</span>
      </div>
      <div className="topbar-right">
        {user && <span className="user">{user.name}</span>}
        <button className="icon-btn" onClick={onSettings} title="Ajustes">
          <svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 00-1.7-1L14.9 3h-4l-.4 2.9a7.6 7.6 0 00-1.7 1l-2.5-1-2 3.5L6.4 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.9h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM12.9 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" /></svg>
        </button>
      </div>
    </header>
  );
}

function Toasts() {
  const toasts = useDJ((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

function Console() {
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    void connect();
    const once = () => activateAudio();
    window.addEventListener('pointerdown', once, { capture: true });
    return () => window.removeEventListener('pointerdown', once, { capture: true });
  }, []);

  return (
    <div className="app">
      <TopBar onSettings={() => setSettings(true)} />
      <div className="views">
        <TrackView id="A" />
        <TrackView id="B" />
      </div>
      <div className="console">
        <Deck id="A" />
        <Mixer />
        <Deck id="B" />
      </div>
      <Browser />
      <Toasts />
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<'boot' | 'login' | 'app'>('boot');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void handleCallback().then((err) => {
      setError(err);
      setPhase(!err && hasSession() ? 'app' : 'login');
    });
  }, []);

  if (phase === 'boot') return null;
  if (phase === 'login') return <Login error={error} />;
  return <Console />;
}
