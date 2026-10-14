import { useState } from 'react';
import { applyVolume, debugInfo } from '../engine/engine';
import { useDJ } from '../engine/store';
import { logout, redirectUri, tokenExpiresAt } from '../lib/auth';
import { useSettings } from '../store/settings';
import { useTicker } from './util';

function Help({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0}>
      ?<span className="help-pop">{text}</span>
    </span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Section({ title, children, open: initial = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`set-sec ${open ? 'open' : ''}`}>
      <button className="set-sec-h" onClick={() => setOpen(!open)}>
        <span className="caret">▸</span>
        {title}
      </button>
      <div className="set-sec-b">
        <div>{children}</div>
      </div>
    </section>
  );
}

function DebugPanel() {
  useTicker(4);
  const s = useDJ.getState();
  const info = debugInfo();
  const exp = tokenExpiresAt();
  return (
    <pre className="debug">
{`device_id   ${s.deviceId ?? '—'}
estado      ${s.status} ${s.statusMsg}
deck vivo   ${s.live ?? '—'}
sdk uri     ${info.sdkUri ?? '—'}
pending     ${info.pending ? info.pending.uri : '—'}
reloj       pos=${Math.round(info.clock.pos)} paused=${info.clock.paused}
volumen     ${info.volSent.toFixed(3)}
xfader      ${s.xfader.toFixed(3)}
token vence ${exp ? new Date(exp).toLocaleTimeString('es-UY') : '—'}`}
    </pre>
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  const st = useSettings();
  const user = useDJ((s) => s.user);
  const [key, setKey] = useState(st.bpmApiKey);

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Ajustes">
        <header className="modal-h">
          <span>Ajustes</span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
        </header>
        <div className="modal-b">
          <Section title="Mezcla">
            <div className="set-row">
              <label>
                Duración de la transición <Help text="Tiempo que tarda el botón MIX y el Automix en llevar el crossfader de un deck al otro." />
              </label>
              <div className="set-ctl range">
                <input type="range" min={2} max={30} value={st.fadeSeconds} onChange={(e) => st.set({ fadeSeconds: Number(e.target.value) })} />
                <span className="val">{st.fadeSeconds} s</span>
              </div>
            </div>
            <div className="set-row">
              <label>
                Curva del crossfader <Help text="Suave: el deck baja durante toda la mitad del recorrido. Corte: queda al máximo y cae cerca del centro, para cambios rápidos." />
              </label>
              <div className="seg">
                {(['suave', 'corte'] as const).map((c) => (
                  <button
                    key={c}
                    className={st.curve === c ? 'on' : ''}
                    onClick={() => {
                      st.set({ curve: c });
                      applyVolume();
                    }}
                  >
                    {c === 'suave' ? 'Suave' : 'Corte'}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <label>
                Loops (experimental) <Help text="Los loops se hacen saltando la posición en Spotify. Pueden tener un pequeño corte o demora en cada vuelta." />
              </label>
              <Toggle on={st.loopsEnabled} onChange={(v) => st.set({ loopsEnabled: v })} />
            </div>
          </Section>

          <Section title="BPM">
            <div className="set-row">
              <label>
                Buscar BPM al cargar <Help text="Al cargar un tema sin BPM guardado, lo consulta en GetSongBPM. Si no lo encuentra, usá TAP." />
              </label>
              <Toggle on={st.autoBpm} onChange={(v) => st.set({ autoBpm: v })} />
            </div>
            <div className="set-row col">
              <label>
                API key de GetSongBPM <Help text="Gratis en getsongbpm.com/api. Se guarda solo en este navegador." />
              </label>
              <div className="field-save">
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Pegá tu key" spellCheck={false} />
                <button className="btn" disabled={key === st.bpmApiKey} onClick={() => st.set({ bpmApiKey: key.trim() })}>
                  {key === st.bpmApiKey && key ? '✓ Guardada' : 'Guardar'}
                </button>
              </div>
            </div>
          </Section>

          <Section title="Cuenta">
            <div className="set-row">
              <label>Usuario</label>
              <span className="muted">{user?.name ?? '—'}</span>
            </div>
            <div className="set-row">
              <label>
                Redirect URI <Help text="Tiene que estar registrada tal cual en el dashboard de tu app de Spotify." />
              </label>
              <code className="muted">{redirectUri()}</code>
            </div>
            <div className="set-row">
              <label>Sesión</label>
              <button className="btn danger" onClick={logout}>Cerrar sesión</button>
            </div>
          </Section>

          <Section title="Avanzado" open={st.debug}>
            <div className="set-row">
              <label>
                Debug <Help text="Muestra el estado interno del reproductor para diagnosticar problemas." />
              </label>
              <Toggle on={st.debug} onChange={(v) => st.set({ debug: v })} />
            </div>
            {st.debug && <DebugPanel />}
          </Section>
        </div>
      </div>
    </div>
  );
}
