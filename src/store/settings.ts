import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type XfaderCurve = 'suave' | 'corte';

export interface Settings {
  clientId: string;
  bpmApiKey: string;
  fadeSeconds: number;
  curve: XfaderCurve;
  loopsEnabled: boolean;
  autoBpm: boolean;
  masterVolume: number;
  debug: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
      bpmApiKey: import.meta.env.VITE_GETSONGBPM_KEY ?? '',
      fadeSeconds: 8,
      curve: 'suave',
      loopsEnabled: true,
      autoBpm: true,
      masterVolume: 0.9,
      debug: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'spotydj.settings',
      version: 1,
      // Si hay valores en .env y el usuario no cargó nada, se usan esos.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return {
          ...current,
          ...p,
          clientId: p.clientId || current.clientId,
          bpmApiKey: p.bpmApiKey || current.bpmApiKey,
        };
      },
    },
  ),
);
