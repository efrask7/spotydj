import { useEffect, useRef } from 'react';
import { getPosition, outputGain, seek } from '../engine/engine';
import { useDJ, type DeckId } from '../engine/store';
import { DECK_COLOR, HOT_COLORS, fmtTime } from './util';

const WINDOW_MS = 12000;

/**
 * Vista con scroll centrada en el cabezal. Spotify no expone el audio ni el análisis,
 * así que en lugar de forma de onda se dibuja la grilla de beats (desde el CUE con el BPM),
 * cues, loop y la zona final del tema.
 */
export function TrackView({ id }: { id: DeckId }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const color = DECK_COLOR[id];

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== W * dpr || cv.height !== H * dpr) {
        cv.width = W * dpr;
        cv.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const s = useDJ.getState();
      const d = s.decks[id];
      const mid = H / 2;
      if (!d.track) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`DECK ${id} — vacío`, W / 2, mid + 4);
        return;
      }

      const pos = getPosition(id);
      const dur = d.track.durationMs;
      const pxPerMs = W / WINDOW_MS;
      const x0 = pos - WINDOW_MS / 2;
      const X = (ms: number) => (ms - x0) * pxPerMs;

      // Fuera del tema
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (X(0) > 0) ctx.fillRect(0, 0, X(0), H);
      if (X(dur) < W) ctx.fillRect(X(dur), 0, W - X(dur), H);

      // Últimos 30 s: aviso
      const warnStart = Math.max(0, dur - 30000);
      if (X(warnStart) < W && X(dur) > 0) {
        ctx.fillStyle = 'rgba(255,59,92,0.08)';
        ctx.fillRect(X(warnStart), 0, X(dur) - X(warnStart), H);
      }

      // Loop
      const L = d.loop;
      if (L.in != null) {
        const xe = L.out != null ? X(L.out) : X(pos);
        ctx.fillStyle = L.active ? 'rgba(61,220,132,0.22)' : 'rgba(61,220,132,0.08)';
        ctx.fillRect(X(L.in), 0, Math.max(1, xe - X(L.in)), H);
      }

      // Grilla de beats (o segundos si no hay BPM)
      const bpm = d.meta.bpm;
      const live = s.live === id;
      const level = live ? Math.max(0.25, Math.min(1, outputGain(id) * 1.2)) : 0.25;
      if (bpm) {
        const beat = 60000 / bpm;
        const anchor = d.meta.cue;
        const first = Math.ceil((x0 - anchor) / beat);
        const last = Math.floor((x0 + WINDOW_MS - anchor) / beat);
        for (let n = first; n <= last; n++) {
          const ms = anchor + n * beat;
          if (ms < 0 || ms > dur) continue;
          const x = X(ms);
          const bar = n % 4 === 0;
          const h = bar ? H * 0.78 : H * 0.42;
          ctx.fillStyle = bar ? color : 'rgba(255,255,255,0.5)';
          ctx.globalAlpha = (bar ? 0.9 : 0.45) * level + 0.1;
          ctx.fillRect(Math.round(x) - (bar ? 1 : 0.5), mid - h / 2, bar ? 2 : 1, h);
          if (bar && n % 16 === 0) {
            ctx.globalAlpha = 0.55;
            ctx.font = '9px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(String(n / 4 + 1), x + 3, 10);
          }
        }
        ctx.globalAlpha = 1;
      } else {
        for (let ms = Math.ceil(x0 / 1000) * 1000; ms < x0 + WINDOW_MS; ms += 1000) {
          if (ms < 0 || ms > dur) continue;
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(Math.round(X(ms)), mid - H * 0.2, 1, H * 0.4);
        }
      }

      // Línea central
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, mid, W, 1);

      // CUE
      const cx = X(d.meta.cue);
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(cx - 1, 0, 2, H);
      ctx.beginPath();
      ctx.moveTo(cx - 6, 0);
      ctx.lineTo(cx + 6, 0);
      ctx.lineTo(cx, 8);
      ctx.fill();

      // Hot cues
      d.meta.hotCues.forEach((hc, i) => {
        if (hc == null) return;
        const x = X(hc);
        if (x < -20 || x > W + 20) return;
        ctx.fillStyle = HOT_COLORS[i];
        ctx.fillRect(x - 1, 0, 2, H);
        ctx.fillRect(x - 1, H - 13, 13, 13);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), x + 2, H - 3);
      });

      // Cabezal
      ctx.fillStyle = '#fff';
      ctx.fillRect(W / 2 - 1, 0, 2, H);
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(W / 2 - 1, 0, 2, H);
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  // Arrastrar la vista mueve la posición (como scratch en la waveform).
  const onDown = (e: React.PointerEvent) => {
    const d = useDJ.getState().decks[id];
    if (!d.track) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const W = el.clientWidth;
    const startX = e.clientX;
    const startPos = getPosition(id);
    let last = 0;
    let target = startPos;
    const move = (ev: PointerEvent) => {
      target = startPos - ((ev.clientX - startX) / W) * WINDOW_MS;
      if (performance.now() - last > 120) {
        last = performance.now();
        seek(id, target);
      }
    };
    const up = () => {
      seek(id, target);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div className={`trackview tv-${id}`} onPointerDown={onDown}>
      <span className="tv-label" style={{ color: DECK_COLOR[id] }}>{id}</span>
      <canvas ref={canvas} />
    </div>
  );
}

/** Barra con el tema completo: progreso, cues y loop. Click para saltar. */
export function Overview({ id }: { id: DeckId }) {
  const fill = useRef<HTMLDivElement>(null);
  const track = useDJ((s) => s.decks[id].track);
  const meta = useDJ((s) => s.decks[id].meta);
  const loop = useDJ((s) => s.decks[id].loop);

  useEffect(() => {
    let raf = 0;
    const loopFn = () => {
      const d = useDJ.getState().decks[id];
      if (fill.current && d.track) fill.current.style.width = `${(getPosition(id) / d.track.durationMs) * 100}%`;
      raf = requestAnimationFrame(loopFn);
    };
    raf = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const dur = track?.durationMs ?? 1;
  const pct = (ms: number) => `${(ms / dur) * 100}%`;
  const onClick = (e: React.MouseEvent) => {
    if (!track) return;
    const r = e.currentTarget.getBoundingClientRect();
    seek(id, ((e.clientX - r.left) / r.width) * dur);
  };

  return (
    <div className="overview" onClick={onClick} title={track ? `Duración ${fmtTime(dur)}` : undefined}>
      {track && (
        <>
          <div className="ov-fill" ref={fill} style={{ background: DECK_COLOR[id] }} />
          <div className="ov-warn" style={{ left: pct(Math.max(0, dur - 30000)) }} />
          {loop.in != null && loop.out != null && (
            <div
              className={`ov-loop ${loop.active ? 'on' : ''}`}
              style={{ left: pct(loop.in), width: pct(loop.out - loop.in) }}
            />
          )}
          <i className="ov-cue" style={{ left: pct(meta.cue) }} />
          {meta.hotCues.map((h, i) =>
            h == null ? null : <i key={i} className="ov-hot" style={{ left: pct(h), background: HOT_COLORS[i] }} />,
          )}
        </>
      )}
    </div>
  );
}
