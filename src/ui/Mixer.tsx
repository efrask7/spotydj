import { applyVolume, cancelXfaderAnim, outputGain, setDeckVolume, setXfader, toggleAutomix, transition } from '../engine/engine';
import { useDJ, type DeckId } from '../engine/store';
import { useSettings } from '../store/settings';
import { Slider } from './Slider';
import { DECK_COLOR, useTicker } from './util';

function Meter({ id }: { id: DeckId }) {
  const playing = useDJ((s) => s.live === id && s.decks[id].playing);
  useTicker(30, playing);
  const g = playing ? outputGain(id) : 0;
  const segs = 14;
  const lit = Math.round(g * segs);
  return (
    <div className="meter" title="Nivel enviado al reproductor">
      {Array.from({ length: segs }, (_, i) => {
        const n = segs - i;
        return <i key={i} className={n <= lit ? (n > 12 ? 'r' : n > 9 ? 'y' : 'g') : ''} />;
      })}
    </div>
  );
}

function Channel({ id }: { id: DeckId }) {
  const vol = useDJ((s) => s.decks[id].volume);
  const live = useDJ((s) => s.live === id && s.decks[id].playing);
  const armed = useDJ((s) => s.decks[id].armed);
  return (
    <div className={`channel ch-${id}`}>
      <div className={`ch-led ${live ? 'on' : armed ? 'armed' : ''}`} style={{ '--accent': DECK_COLOR[id] } as React.CSSProperties}>
        {id}
      </div>
      <div className="ch-faders">
        {id === 'A' && <Meter id={id} />}
        <Slider vertical value={vol} defaultValue={1} onChange={(v) => setDeckVolume(id, v)} color={DECK_COLOR[id]} title={`Volumen deck ${id}`} ticks={[0.25, 0.5, 0.75]} />
        {id === 'B' && <Meter id={id} />}
      </div>
    </div>
  );
}

export function Mixer() {
  const xfader = useDJ((s) => s.xfader);
  const transitioning = useDJ((s) => s.transitioning);
  const automix = useDJ((s) => s.automix);
  const live = useDJ((s) => s.live);
  const queueLen = useDJ((s) => s.queue.length);
  const fade = useSettings((s) => s.fadeSeconds);
  const master = useSettings((s) => s.masterVolume);
  const setS = useSettings((s) => s.set);
  const dir = live === 'B' ? '◀' : '▶';

  return (
    <section className="mixer">
      <div className="mixer-top">
        <Channel id="A" />
        <div className="master">
          <div className="group-lbl">MASTER</div>
          <Slider
            vertical
            className="master-fader"
            value={master}
            defaultValue={0.9}
            onChange={(v) => {
              setS({ masterVolume: v });
              applyVolume();
            }}
            color="#e8e8e8"
            title="Volumen general"
          />
          <span className="master-val">{Math.round(master * 100)}</span>
        </div>
        <Channel id="B" />
      </div>

      <div className="mixer-actions">
        <button className={`mbtn mix ${transitioning ? 'on' : ''}`} onClick={transition} title="Transición automática al otro deck">
          {transitioning ? 'CANCELAR' : `MIX ${dir}`}
        </button>
        <div className="fade-sel" title="Duración de la transición">
          <button onClick={() => setS({ fadeSeconds: Math.max(2, fade - 1) })}>−</button>
          <span>{fade}s</span>
          <button onClick={() => setS({ fadeSeconds: Math.min(30, fade + 1) })}>+</button>
        </div>
        <button className={`mbtn automix ${automix ? 'on' : ''}`} onClick={toggleAutomix} title="Mezcla automática usando la cola">
          AUTOMIX{queueLen ? <small>{queueLen}</small> : null}
        </button>
      </div>

      <div className="xfader-wrap">
        <span className="xf-lbl" style={{ color: DECK_COLOR.A }}>A</span>
        <Slider
          className="xfader"
          value={xfader}
          onGrab={cancelXfaderAnim}
          onChange={setXfader}
          ticks={[0.25, 0.5, 0.75]}
          title="Crossfader: al cruzar el centro entra el otro deck"
        />
        <span className="xf-lbl" style={{ color: DECK_COLOR.B }}>B</span>
      </div>
    </section>
  );
}
