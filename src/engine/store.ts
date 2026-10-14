import { create } from 'zustand';
import type { Track } from '../lib/spotify';
import { emptyMeta, type TrackMeta } from '../lib/db';

export type DeckId = 'A' | 'B';
export const DECKS: DeckId[] = ['A', 'B'];
export const other = (id: DeckId): DeckId => (id === 'A' ? 'B' : 'A');

export interface Loop {
  in: number | null;
  out: number | null;
  active: boolean;
  beats: number | null;
}

export interface DeckState {
  track: Track | null;
  meta: TrackMeta;
  /** Posición en ms. Para el deck en vivo la fuente de verdad es el reloj del engine. */
  position: number;
  playing: boolean;
  /** Play presionado mientras el otro deck suena: entra al cruzar el crossfader. */
  armed: boolean;
  /** Ya sonó en vivo desde que se cargó (automix lo reemplaza). */
  played: boolean;
  volume: number;
  loop: Loop;
  bpmLoading: boolean;
}

export const emptyLoop = (): Loop => ({ in: null, out: null, active: false, beats: null });

const emptyDeck = (): DeckState => ({
  track: null,
  meta: emptyMeta(),
  position: 0,
  playing: false,
  armed: false,
  played: false,
  volume: 1,
  loop: emptyLoop(),
  bpmLoading: false,
});

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface DJState {
  status: 'idle' | 'connecting' | 'ready' | 'error';
  statusMsg: string;
  deviceId: string | null;
  user: { id: string; name: string } | null;
  decks: Record<DeckId, DeckState>;
  live: DeckId | null;
  /** 0 = todo A, 1 = todo B. */
  xfader: number;
  transitioning: boolean;
  automix: boolean;
  queue: Track[];
  history: { track: Track; at: number }[];
  metaCache: Record<string, TrackMeta>;
  toasts: Toast[];
}

export const useDJ = create<DJState>()(() => ({
  status: 'idle',
  statusMsg: '',
  deviceId: null,
  user: null,
  decks: { A: emptyDeck(), B: emptyDeck() },
  live: null,
  xfader: 0,
  transitioning: false,
  automix: false,
  queue: [],
  history: [],
  metaCache: {},
  toasts: [],
}));

export const dj = () => useDJ.getState();
export const deck = (id: DeckId) => useDJ.getState().decks[id];

export function setDeck(id: DeckId, patch: Partial<DeckState>) {
  useDJ.setState((s) => ({ decks: { ...s.decks, [id]: { ...s.decks[id], ...patch } } }));
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  useDJ.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => useDJ.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
}
