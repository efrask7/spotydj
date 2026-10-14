import { useRef } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  onGrab?: () => void;
  vertical?: boolean;
  defaultValue?: number;
  className?: string;
  color?: string;
  title?: string;
  /** Marcas de escala (0..1). */
  ticks?: number[];
}

/** Fader estilo consola: arrastrable, con rueda del mouse y doble click para resetear. */
export function Slider({ value, onChange, onGrab, vertical, defaultValue, className = '', color, title, ticks }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const fromEvent = (e: PointerEvent | React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const v = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    return Math.min(1, Math.max(0, v));
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    onGrab?.();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    onChange(fromEvent(e));
    const move = (ev: PointerEvent) => onChange(fromEvent(ev));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onWheel = (e: React.WheelEvent) => {
    onGrab?.();
    const step = e.shiftKey ? 0.01 : 0.04;
    onChange(Math.min(1, Math.max(0, value + (e.deltaY < 0 ? step : -step))));
  };

  const pct = `${value * 100}%`;
  return (
    <div
      ref={ref}
      className={`slider ${vertical ? 'v' : 'h'} ${className}`}
      onPointerDown={onDown}
      onWheel={onWheel}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      title={title}
      style={{ '--accent': color } as React.CSSProperties}
    >
      <div className="slider-track">
        {ticks?.map((t) => (
          <i key={t} className="slider-tick" style={vertical ? { bottom: `${t * 100}%` } : { left: `${t * 100}%` }} />
        ))}
        <div className="slider-fill" style={vertical ? { height: pct } : { width: pct }} />
      </div>
      <div className="slider-cap" style={vertical ? { bottom: pct } : { left: pct }} />
    </div>
  );
}
