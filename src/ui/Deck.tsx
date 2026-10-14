import { useRef, useState } from 'react';
import {
  autoLoop,
  clearLoop,
  cue,
  getPosition,
  hotCue,
  loadTrack,
  loopIn,
  loopOut,
  lookupBpm,
  play,
  reloop,
  updateMeta,
} from '../engine/engine';
import { useDJ, type DeckId } from '../engine/store';
import { TapTempo } from '../lib/bpm';
import { useSettings } from '../store/settings';
import { Jog } from './Jog';
import { Overview } from './TrackView';
import { DECK_COLOR, HOT_COLORS, TRACK_MIME, fmtBpm, fmtTime, useTicker } from './util';

function DeckClock({ id }: { id: DeckId }) {
  const track = useDJ((s) => s.decks[id].track);
  const playing = useDJ((s) => s.decks[id].playing);
  useTicker(20, playing);
  const pos = track ? getPosition(id) : 0;
  const remain = track ? track.durationMs - pos : 0;
  const warn = !!track && remain < 30000;
  return (
    <div className="deck-clock">
      <span className="dc-elapsed">{fmtTime(pos, true)}</span>
      <span className={`dc-remain ${warn ? 'warn' : ''}`}>{track ? fmtTime(-remain, true) : '-0:00.0'}</span>
    </div>
  );
}

function StatusChip({ id }: { id: DeckId }) {
  const live = useDJ((s) => s.live === id);
  const d = useDJ((s) => s.decks[id]);
  if (!d.track) return <span className="chip">VACÍO</span>;
  if (live && d.playing) return <span className="chip live">EN VIVO</span>;
  if (d.armed) return <span className="chip armed">EN ESPERA</span>;
  if (live) return <span className="chip paused">PAUSA</span>;
  return <span className="chip">CARGADO</span>;
}

export function Deck({ id }: { id: DeckId }) {
  const d = useDJ((s) => s.decks[id]);
  const isLive = useDJ((s) => s.live === id);
  const loopsEnabled = useSettings((s) => s.loopsEnabled);
  const tapper = useRef(new TapTempo());
  const [taps, setTaps] = useState(0);
  const [over, setOver] = useState(false);
  const color = DECK_COLOR[id];
  const t = d.track;

  const onTap = () => {
    const bpm = tapper.current.tap();
    setTaps(tapper.current.count);
    if (bpm && t) void updateMeta(id, { bpm, bpmSource: 'tap' });
  };

  const onDrop = (e: React.DragEvent) => {
    setOver(false);
    const raw = e.dataTransfer.getData(TRACK_MIME);
    if (!raw) return;
    e.preventDefault();
    void loadTrack(id, JSON.parse(raw));
  };

  return (
    <section
      className={`deck deck-${id} ${isLive ? 'is-live' : ''} ${d.playing ? 'is-playing' : ''} ${over ? 'drop' : ''}`}
      style={{ '--accent': color } as React.CSSProperties}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TRACK_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="deck-head">
        <div className="deck-letter">{id}</div>
        <div className="deck-cover">{t?.image ? <img src={t.image} alt="" /> : null}</div>
        <div className="deck-title">
          <div className="dt-name" title={t?.name}>{t?.name ?? 'Arrastrá un tema acá'}</div>
          <div className="dt-artist" title={t?.artists}>{t ? t.artists : 'o doble click en la lista'}</div>
        </div>
        <div className="deck-bpm" title={d.meta.bpmSource === 'api' ? 'BPM de GetSongBPM' : d.meta.bpmSource === 'tap' ? 'BPM por TAP' : 'Sin BPM'}>
          <span className="bpm-val">{fmtBpm(d.meta.bpm)}</span>
          <span className="bpm-lbl">BPM{d.meta.key ? ` · ${d.meta.key}` : ''}</span>
        </div>
      </header>

      <Overview id={id} />

      <div className="deck-status">
        <StatusChip id={id} />
        <DeckClock id={id} />
      </div>

      <div className="deck-body">
        <div className="deck-col">
          <div className="group-lbl">TEMPO</div>
          <div className="btn-row">
            <button className={`pad tap ${taps > 0 && taps < 3 ? 'blink' : ''}`} onClick={onTap} disabled={!t} title="Tocá al ritmo (mínimo 3 toques)">
              TAP
            </button>
            <button
              className={`pad ${d.bpmLoading ? 'loading' : ''}`}
              onClick={() => void lookupBpm(id)}
              disabled={!t || d.bpmLoading}
              title="Buscar BPM en GetSongBPM"
            >
              {d.bpmLoading ? '···' : 'AUTO'}
            </button>
          </div>
          {loopsEnabled && (
            <>
              <div className="group-lbl">
                LOOP <span className="exp" title="Los loops usan saltos de posición del SDK: pueden tener una pequeña demora">EXP</span>
              </div>
              <div className="btn-row">
                {[1, 2, 4, 8].map((b) => (
                  <button
                    key={b}
                    className={`pad sm ${d.loop.active && d.loop.beats === b ? 'on' : ''}`}
                    onClick={() => autoLoop(id, b)}
                    disabled={!t || !d.meta.bpm}
                    title={d.meta.bpm ? `Loop de ${b} beat${b > 1 ? 's' : ''}` : 'Necesita BPM'}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <div className="btn-row">
                <button className={`pad sm ${d.loop.in != null && d.loop.out == null ? 'on' : ''}`} onClick={() => loopIn(id)} disabled={!t}>IN</button>
                <button className="pad sm" onClick={() => loopOut(id)} disabled={!t || d.loop.in == null}>OUT</button>
                <button className={`pad sm ${d.loop.active ? 'on' : ''}`} onClick={() => reloop(id)} disabled={d.loop.out == null} title="Activar / salir del loop">⟲</button>
                <button className="pad sm" onClick={() => clearLoop(id)} disabled={d.loop.in == null} title="Borrar loop">✕</button>
              </div>
            </>
          )}
        </div>

        <Jog id={id} />

        <div className="deck-col">
          <div className="group-lbl">HOT CUES</div>
          <div className="hotcues">
            {d.meta.hotCues.map((h, i) => (
              <button
                key={i}
                className={`hot ${h != null ? 'set' : ''}`}
                style={{ '--hc': HOT_COLORS[i] } as React.CSSProperties}
                disabled={!t}
                onClick={(e) => hotCue(id, i, e.shiftKey)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  hotCue(id, i, true);
                }}
                title={h != null ? `${fmtTime(h, true)} — click: saltar · click derecho: borrar` : 'Click: guardar posición actual'}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="deck-transport">
        <button className="tbtn cue" onClick={() => cue(id)} disabled={!t} title="Pausado: fija el CUE · Sonando: vuelve al CUE">
          CUE
        </button>
        <button
          className={`tbtn play ${d.playing ? 'on' : ''} ${d.armed ? 'armed' : ''}`}
          onClick={() => play(id)}
          disabled={!t}
          title={d.armed ? 'En espera: entra al cruzar el crossfader' : 'Play / Pausa'}
        >
          {d.playing ? (
            <svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg>
          )}
        </button>
      </div>
    </section>
  );
}
