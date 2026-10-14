import { useEffect, useRef } from 'react';
import { getPosition, seek } from '../engine/engine';
import { useDJ, type DeckId } from '../engine/store';
import { DECK_COLOR } from './util';

/** ms de tema por vuelta completa del plato (33⅓ rpm ≈ 1,8 s). */
const MS_PER_REV = 1800;

export function Jog({ id }: { id: DeckId }) {
  const platter = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const drag = useRef<{ angle: number; pos: number; lastSeek: number } | null>(null);
  const loaded = useDJ((s) => !!s.decks[id].track);
  const cover = useDJ((s) => s.decks[id].track?.imageLarge);

  // La rotación se dibuja fuera de React para no re-renderizar a 60 fps.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = useDJ.getState();
      const d = s.decks[id];
      if (platter.current && d.track) {
        const pos = drag.current ? drag.current.pos : getPosition(id);
        const deg = ((pos % MS_PER_REV) / MS_PER_REV) * 360;
        platter.current.style.transform = `rotate(${deg}deg)`;
        if (ring.current) {
          const pct = Math.min(1, pos / d.track.durationMs) * 100;
          ring.current.style.setProperty('--p', `${pct}%`);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const angleOf = (e: PointerEvent | React.PointerEvent) => {
    const r = platter.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };

  const onDown = (e: React.PointerEvent) => {
    if (!loaded) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    drag.current = { angle: angleOf(e), pos: getPosition(id), lastSeek: 0 };
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const a = angleOf(ev);
      let delta = a - g.angle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      g.angle = a;
      g.pos = Math.max(0, g.pos + (delta / (2 * Math.PI)) * MS_PER_REV);
      // Los seeks al SDK se espacian para no saturarlo.
      if (performance.now() - g.lastSeek > 120) {
        g.lastSeek = performance.now();
        seek(id, g.pos);
      }
    };
    const up = () => {
      if (drag.current) seek(id, drag.current.pos);
      drag.current = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={ring}
      className={`jog ${loaded ? '' : 'empty'}`}
      style={{ '--accent': DECK_COLOR[id] } as React.CSSProperties}
      onPointerDown={onDown}
      title="Arrastrá en círculo para mover la posición"
    >
      <div className="jog-ring" />
      <div className="jog-platter" ref={platter}>
        {cover ? <img src={cover} alt="" draggable={false} /> : <div className="jog-blank" />}
        <i className="jog-marker" />
      </div>
      <div className="jog-hub" />
    </div>
  );
}
