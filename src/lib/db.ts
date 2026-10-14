import { createStore, get, getMany, set } from 'idb-keyval';

export const HOT_CUES = 8;

export interface TrackMeta {
  cue: number;
  hotCues: (number | null)[];
  bpm: number | null;
  bpmSource: 'tap' | 'api' | null;
  key: string | null;
  /** Para no reconsultar la API externa si no encontró nada. */
  apiChecked: boolean;
}

export const emptyMeta = (): TrackMeta => ({
  cue: 0,
  hotCues: Array(HOT_CUES).fill(null),
  bpm: null,
  bpmSource: null,
  key: null,
  apiChecked: false,
});

const store = createStore('spotydj', 'tracks');

export async function loadMeta(id: string): Promise<TrackMeta> {
  const m = await get<Partial<TrackMeta>>(id, store).catch(() => undefined);
  return { ...emptyMeta(), ...m };
}

export async function loadMetas(ids: string[]): Promise<Record<string, TrackMeta>> {
  const res = await getMany<Partial<TrackMeta> | undefined>(ids, store).catch(() => []);
  const out: Record<string, TrackMeta> = {};
  ids.forEach((id, i) => {
    if (res[i]) out[id] = { ...emptyMeta(), ...res[i] };
  });
  return out;
}

export const saveMeta = (id: string, meta: TrackMeta) => set(id, meta, store).catch(() => undefined);
