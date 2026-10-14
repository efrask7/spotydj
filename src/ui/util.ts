import { useEffect, useReducer } from 'react';

export function fmtTime(ms: number, tenths = false) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}${tenths ? `.${t}` : ''}`;
}

export const fmtBpm = (bpm: number | null) => (bpm ? bpm.toFixed(1) : '---.-');

export const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

/** Re-renderiza el componente a ~fps cuadros por segundo (para posiciones en vivo). */
export function useTicker(fps = 30, active = true) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last >= 1000 / fps) {
        last = t;
        force();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, active]);
}

export const HOT_COLORS = ['#ff3b5c', '#ff9f1a', '#ffe14d', '#3ddc84', '#29d3ff', '#4f7bff', '#b36bff', '#ff6bd6'];
export const DECK_COLOR = { A: '#2f8cff', B: '#ff6a2b' } as const;

export const TRACK_MIME = 'application/x-spotydj-track';
