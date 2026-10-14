import { useState } from 'react';
import { login, redirectUri } from '../lib/auth';
import { useSettings } from '../store/settings';

export function Login({ error }: { error: string | null }) {
  const clientId = useSettings((s) => s.clientId);
  const set = useSettings((s) => s.set);
  const [id, setId] = useState(clientId);
  const [err, setErr] = useState(error);
  const [copied, setCopied] = useState(false);

  const go = async () => {
    const v = id.trim();
    if (!/^[0-9a-f]{32}$/i.test(v)) return setErr('El Client ID tiene 32 caracteres hexadecimales');
    set({ clientId: v });
    try {
      await login();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand big">
          <svg viewBox="0 0 64 64" className="brand-mark">
            <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="4" />
            <circle cx="32" cy="32" r="15" fill="none" stroke="#2f8cff" strokeWidth="4" />
            <circle cx="32" cy="32" r="4" fill="#ff6a2b" />
          </svg>
          <span>Spoty<b>DJ</b></span>
        </div>
        <p className="login-sub">Dos decks, crossfader y automix sobre tu Spotify Premium.</p>

        <label className="lbl">Client ID de tu app de Spotify</label>
        <input
          className="input"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          placeholder="32 caracteres del dashboard"
          spellCheck={false}
        />

        <label className="lbl">Redirect URI a registrar en el dashboard</label>
        <div className="copy-field">
          <code>{redirectUri()}</code>
          <button
            className="btn ghost"
            onClick={() => {
              void navigator.clipboard.writeText(redirectUri());
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? '✓' : 'Copiar'}
          </button>
        </div>

        {err && <div className="login-err">{err}</div>}

        <button className="btn spotify" onClick={go}>Conectar con Spotify</button>
        <a className="login-help" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
          Abrir Spotify Developer Dashboard ↗
        </a>
      </div>
    </div>
  );
}
