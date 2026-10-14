/**
 * Motor de SpotyDJ.
 *
 * Spotify permite un solo stream por cuenta, así que hay UN reproductor (Web Playback SDK)
 * y dos decks lógicos. El deck "en vivo" es el que está cargado en el SDK; el otro guarda
 * su tema, cue y posición. El crossfader controla la ganancia del deck en vivo y, al cruzar
 * el centro hacia el otro deck, cambia el tema en el SDK (transición secuencial).
 */
import { getToken } from '../lib/auth';
import { emptyMeta, loadMeta, saveMeta, type TrackMeta } from '../lib/db';
import { fetchBpm } from '../lib/bpm';
import { loadSdk } from '../lib/sdk';
import { getMe, playOnDevice, type Track } from '../lib/spotify';
import { useSettings } from '../store/settings';
import { deck, dj, emptyLoop, other, setDeck, toast, useDJ, type DeckId } from './store';

let player: Spotify.Player | null = null;
/** URI que el SDK reporta como cargada (null si no coincide con el deck en vivo). */
let sdkUri: string | null = null;
/** Mientras arranca un tema nuevo se ignoran estados viejos del SDK. */
let pending: { uri: string; until: number } | null = null;
const clock = { pos: 0, ts: 0, paused: true };
let lastLivePos = 0;

const now = () => performance.now();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ───────────── Posición ───────────── */

export function getPosition(id: DeckId): number {
  const s = dj();
  const d = s.decks[id];
  if (!d.track) return 0;
  if (s.live === id && sdkUri === d.track.uri) {
    const p = clock.paused ? clock.pos : clock.pos + (now() - clock.ts);
    return clamp(p, 0, d.track.durationMs);
  }
  return d.position;
}

/* ───────────── Volumen / crossfader ───────────── */

export function xGain(id: DeckId, x: number): number {
  const w = useSettings.getState().curve === 'corte' ? 0.12 : 0.5;
  const t = clamp((id === 'A' ? 0.5 - x : x - 0.5) / w, 0, 1);
  return Math.sin((t * Math.PI) / 2);
}

export function outputGain(id: DeckId): number {
  const s = dj();
  if (s.live !== id) return 0;
  return useSettings.getState().masterVolume * s.decks[id].volume * xGain(id, s.xfader);
}

let volSent = -1;
let volTimer: number | null = null;
export function applyVolume() {
  if (volTimer !== null) return;
  volTimer = window.setTimeout(() => {
    volTimer = null;
    const s = dj();
    if (!player || !s.live) return;
    const g = Math.round(outputGain(s.live) * 1000) / 1000;
    if (Math.abs(g - volSent) < 0.003) return;
    volSent = g;
    player.setVolume(g).catch(() => undefined);
  }, 50);
}

export function setXfader(x: number) {
  const s = dj();
  x = clamp(x, 0, 1);
  useDJ.setState({ xfader: x });
  if (s.live) {
    const o = other(s.live);
    const od = s.decks[o];
    // Histéresis alrededor del centro para no rebotar entre decks.
    const crossed = o === 'B' ? x >= 0.52 : x <= 0.48;
    if (crossed && s.deviceId && od.track && (s.decks[s.live].playing || od.armed)) {
      void startLive(o);
    }
  }
  applyVolume();
}

let anim: number | null = null;
function animateXfader(target: number, ms: number, onDone?: () => void) {
  cancelXfaderAnim();
  const from = dj().xfader;
  const t0 = now();
  const step = () => {
    const k = ms <= 0 ? 1 : clamp((now() - t0) / ms, 0, 1);
    setXfader(from + (target - from) * k);
    if (k < 1) anim = requestAnimationFrame(step);
    else {
      anim = null;
      onDone?.();
    }
  };
  anim = requestAnimationFrame(step);
}

export function cancelXfaderAnim() {
  if (anim !== null) cancelAnimationFrame(anim);
  anim = null;
  if (dj().transitioning) useDJ.setState({ transitioning: false });
}

/** Transición automática hacia el otro deck usando la duración de fade configurada. */
export function transition() {
  const s = dj();
  if (s.transitioning) return cancelXfaderAnim();
  if (!s.live) return toast('No hay ningún deck sonando');
  const o = other(s.live);
  if (!s.decks[o].track) return toast(`Cargá un tema en el deck ${o}`);
  if (!s.decks[s.live].playing) setDeck(o, { armed: true });
  const target = o === 'B' ? 1 : 0;
  const ms = useSettings.getState().fadeSeconds * 1000 * Math.abs(target - s.xfader);
  useDJ.setState({ transitioning: true });
  animateXfader(target, ms, () => useDJ.setState({ transitioning: false }));
}

/* ───────────── Conexión ───────────── */

let started = false;

export async function connect() {
  if (started) return;
  started = true;
  useDJ.setState({ status: 'connecting', statusMsg: 'Conectando con Spotify…' });
  try {
    const [user] = await Promise.all([getMe(), loadSdk()]);
    useDJ.setState({ user });
  } catch (e) {
    useDJ.setState({ status: 'error', statusMsg: (e as Error).message });
    started = false;
    return;
  }
  player = new Spotify.Player({
    name: 'SpotyDJ',
    volume: 0,
    getOAuthToken: (cb) => {
      getToken().then(cb, () => useDJ.setState({ status: 'error', statusMsg: 'La sesión venció' }));
    },
  });
  volSent = 0;
  player.addListener('ready', ({ device_id }) => {
    useDJ.setState({ deviceId: device_id, status: 'ready', statusMsg: '' });
  });
  player.addListener('not_ready', () => {
    useDJ.setState({ deviceId: null, status: 'connecting', statusMsg: 'Reconectando reproductor…' });
  });
  player.addListener('initialization_error', ({ message }) =>
    useDJ.setState({ status: 'error', statusMsg: `Tu navegador no soporta el reproductor: ${message}` }),
  );
  player.addListener('authentication_error', ({ message }) =>
    useDJ.setState({ status: 'error', statusMsg: `Error de autenticación: ${message}` }),
  );
  player.addListener('account_error', () =>
    useDJ.setState({ status: 'error', statusMsg: 'Spotify Premium es necesario para reproducir' }),
  );
  player.addListener('playback_error', ({ message }) => toast(`Error de reproducción: ${message}`, 'error'));
  player.addListener('player_state_changed', onState);
  const ok = await player.connect();
  if (!ok) useDJ.setState({ status: 'error', statusMsg: 'No se pudo conectar el reproductor' });
  window.setInterval(tick, 25);
}

/** El navegador exige un gesto del usuario para habilitar audio. */
export function activateAudio() {
  player?.activateElement().catch(() => undefined);
}

export const debugInfo = () => ({ sdkUri, pending, clock: { ...clock }, volSent });

function onState(state: Spotify.PlaybackState | null) {
  const s = dj();
  const live = s.live;
  if (!state) {
    // Otro dispositivo tomó la reproducción.
    if (live) setDeck(live, { playing: false, position: getPosition(live) });
    sdkUri = null;
    clock.paused = true;
    return;
  }
  const cur = state.track_window.current_track as Spotify.Track & { linked_from?: { uri?: string } };
  const d = live ? s.decks[live] : null;
  const matches =
    !!d?.track && !!cur && (cur.uri === d.track.uri || cur.linked_from?.uri === d.track.uri || cur.id === d.track.id);

  if (pending) {
    if (matches) pending = null;
    else if (now() < pending.until) return;
    else pending = null;
  }

  if (!live || !matches || !d?.track) {
    // Spotify arrancó otra cosa (autoplay, otra app): no es nuestro, se frena.
    sdkUri = null;
    if (!state.paused) player?.pause().catch(() => undefined);
    if (live) setDeck(live, { playing: false });
    clock.paused = true;
    return;
  }

  sdkUri = d.track.uri;
  const ended = state.paused && state.position === 0 && lastLivePos > d.track.durationMs - 2500;
  clock.pos = state.position;
  clock.ts = now();
  clock.paused = state.paused;
  if (ended) return onTrackEnded(live);
  setDeck(live, { playing: !state.paused, position: state.position });
}

function onTrackEnded(id: DeckId) {
  lastLivePos = 0;
  setDeck(id, { playing: false, position: 0 });
  const s = dj();
  const o = other(id);
  if (s.automix && s.decks[o].track && !s.decks[o].played) {
    useDJ.setState({ xfader: o === 'B' ? 1 : 0 });
    void startLive(o);
  }
}

/* ───────────── Transporte ───────────── */

async function startLive(id: DeckId) {
  const s = dj();
  const d = s.decks[id];
  if (!d.track) return;
  if (!s.deviceId || !player) return toast('El reproductor todavía no está listo', 'error');
  const prev = s.live;
  const sameLoaded = prev === id && sdkUri === d.track.uri;
  if (prev && prev !== id) setDeck(prev, { playing: false, armed: false, position: getPosition(prev) });

  const startAt = sameLoaded ? getPosition(id) : d.position;
  useDJ.setState({ live: id });
  setDeck(id, { playing: true, armed: false, played: true, position: startAt });
  lastLivePos = startAt;
  addHistory(d.track);
  applyVolume();

  try {
    if (sameLoaded) {
      clock.paused = false;
      clock.ts = now();
      await player.resume();
    } else {
      sdkUri = null;
      pending = { uri: d.track.uri, until: now() + 5000 };
      await playOnDevice(s.deviceId, d.track.uri, startAt);
      // Optimista hasta que llegue el primer estado del SDK.
      sdkUri = d.track.uri;
      clock.pos = startAt;
      clock.ts = now();
      clock.paused = false;
    }
  } catch (e) {
    pending = null;
    setDeck(id, { playing: false });
    toast(`No se pudo reproducir: ${(e as Error).message}`, 'error');
  }
}

function addHistory(track: Track) {
  const h = dj().history;
  if (h[0]?.track.id === track.id) return;
  useDJ.setState({ history: [{ track, at: Date.now() }, ...h].slice(0, 200) });
}

export function play(id: DeckId) {
  const s = dj();
  const d = s.decks[id];
  if (!d.track) return;
  if (s.live === id) {
    if (d.playing) pause(id);
    else void startLive(id);
    return;
  }
  const liveDeck = s.live ? s.decks[s.live] : null;
  if (!liveDeck || !liveDeck.playing) {
    void startLive(id).then(() => {
      // Si el crossfader lo tenía muteado, se lo lleva a su lado.
      if (xGain(id, dj().xfader) < 0.05) animateXfader(id === 'A' ? 0 : 1, 250);
    });
  } else {
    setDeck(id, { armed: !d.armed });
    if (!d.armed) toast(`Deck ${id} en espera: entra al cruzar el crossfader`);
  }
}

export function pause(id: DeckId) {
  const s = dj();
  const d = s.decks[id];
  if (d.armed) setDeck(id, { armed: false });
  if (s.live !== id || !d.playing) return;
  const pos = getPosition(id);
  clock.pos = pos;
  clock.ts = now();
  clock.paused = true;
  setDeck(id, { playing: false, position: pos });
  player?.pause().catch(() => undefined);
}

export function seek(id: DeckId, ms: number) {
  const s = dj();
  const d = s.decks[id];
  if (!d.track) return;
  ms = clamp(ms, 0, Math.max(0, d.track.durationMs - 500));
  if (s.live === id && sdkUri === d.track.uri && player) {
    clock.pos = ms;
    clock.ts = now();
    lastLivePos = ms;
    player.seek(Math.round(ms)).catch(() => undefined);
  }
  setDeck(id, { position: ms });
}

export function cue(id: DeckId) {
  const d = deck(id);
  if (!d.track) return;
  if (d.playing) {
    pause(id);
    seek(id, d.meta.cue);
  } else {
    const pos = getPosition(id);
    if (Math.abs(pos - d.meta.cue) < 40) return;
    void updateMeta(id, { cue: pos });
  }
}

export function hotCue(id: DeckId, i: number, remove = false) {
  const d = deck(id);
  if (!d.track) return;
  const hot = [...d.meta.hotCues];
  if (remove) hot[i] = null;
  else if (hot[i] == null) hot[i] = getPosition(id);
  else return seek(id, hot[i]!);
  void updateMeta(id, { hotCues: hot });
}

export function setDeckVolume(id: DeckId, v: number) {
  setDeck(id, { volume: clamp(v, 0, 1) });
  applyVolume();
}

/* ───────────── Loops (experimental: se resuelven con seek) ───────────── */

export function loopIn(id: DeckId) {
  if (!deck(id).track) return;
  setDeck(id, { loop: { in: getPosition(id), out: null, active: false, beats: null } });
}

export function loopOut(id: DeckId) {
  const d = deck(id);
  const pos = getPosition(id);
  if (d.loop.in == null) return toast('Marcá primero el inicio del loop (IN)');
  if (pos - d.loop.in < 300) return toast('El loop es demasiado corto');
  setDeck(id, { loop: { ...d.loop, out: pos, active: true, beats: null } });
}

export function reloop(id: DeckId) {
  const d = deck(id);
  if (d.loop.in == null || d.loop.out == null) return;
  const active = !d.loop.active;
  setDeck(id, { loop: { ...d.loop, active } });
  if (active) seek(id, d.loop.in);
}

export function autoLoop(id: DeckId, beats: number) {
  const d = deck(id);
  if (!d.track) return;
  if (!d.meta.bpm) return toast('Necesitás el BPM del tema (TAP) para loops por beats');
  if (d.loop.active && d.loop.beats === beats) return setDeck(id, { loop: { ...d.loop, active: false } });
  const start = d.loop.active && d.loop.in != null ? d.loop.in : getPosition(id);
  const len = (beats * 60000) / d.meta.bpm;
  setDeck(id, { loop: { in: start, out: start + len, active: true, beats } });
}

export function clearLoop(id: DeckId) {
  setDeck(id, { loop: emptyLoop() });
}

/* ───────────── Carga y metadatos ───────────── */

export async function loadTrack(id: DeckId, track: Track): Promise<boolean> {
  const s = dj();
  const d = s.decks[id];
  if (s.live === id && d.playing) {
    toast(`El deck ${id} está sonando. Pausalo para cargar otro tema.`, 'error');
    return false;
  }
  setDeck(id, {
    track,
    meta: s.metaCache[track.id] ?? emptyMeta(),
    position: 0,
    playing: false,
    armed: false,
    played: false,
    loop: emptyLoop(),
    bpmLoading: false,
  });
  const meta = await loadMeta(track.id);
  if (deck(id).track?.id !== track.id) return true;
  setDeck(id, { meta, position: meta.cue });
  if (dj().live === id && sdkUri) {
    // El SDK tiene el tema anterior: el próximo play arranca el nuevo.
    sdkUri = null;
  }
  cacheMeta(track.id, meta);
  void autoBpm(id, track, meta);
  return true;
}

/** Carga en el primer deck libre (que no esté sonando). */
export function loadAuto(track: Track) {
  const s = dj();
  const free = (['A', 'B'] as DeckId[]).find((id) => !s.decks[id].track && !(s.live === id && s.decks[id].playing))
    ?? (['A', 'B'] as DeckId[]).find((id) => !(s.live === id && s.decks[id].playing));
  if (free) void loadTrack(free, track);
}

function cacheMeta(trackId: string, meta: TrackMeta) {
  useDJ.setState((s) => ({ metaCache: { ...s.metaCache, [trackId]: meta } }));
}

export async function updateMeta(id: DeckId, patch: Partial<TrackMeta>) {
  const d = deck(id);
  if (!d.track) return;
  const meta = { ...d.meta, ...patch };
  setDeck(id, { meta });
  cacheMeta(d.track.id, meta);
  await saveMeta(d.track.id, meta);
}

async function autoBpm(id: DeckId, track: Track, meta: TrackMeta) {
  const { autoBpm: enabled, bpmApiKey } = useSettings.getState();
  if (!enabled || !bpmApiKey || meta.bpm || meta.apiChecked) return;
  await lookupBpm(id, track);
}

export async function lookupBpm(id: DeckId, track = deck(id).track) {
  const key = useSettings.getState().bpmApiKey;
  if (!track) return;
  if (!key) return toast('Cargá la API key de GetSongBPM en Ajustes');
  setDeck(id, { bpmLoading: true });
  try {
    const r = await fetchBpm(track.name, track.artists, key);
    if (deck(id).track?.id !== track.id) return;
    if (r) await updateMeta(id, { bpm: r.bpm, key: r.key, bpmSource: 'api', apiChecked: true });
    else {
      await updateMeta(id, { apiChecked: true });
      toast(`Sin BPM para "${track.name}". Usá TAP.`);
    }
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    if (deck(id).track?.id === track.id) setDeck(id, { bpmLoading: false });
  }
}

/* ───────────── Automix y cola ───────────── */

export function enqueue(track: Track) {
  useDJ.setState((s) => ({ queue: [...s.queue, track] }));
}
export function dequeue(index: number) {
  useDJ.setState((s) => ({ queue: s.queue.filter((_, i) => i !== index) }));
}
export function moveQueue(from: number, to: number) {
  useDJ.setState((s) => {
    const q = [...s.queue];
    const [t] = q.splice(from, 1);
    q.splice(clamp(to, 0, q.length), 0, t);
    return { queue: q };
  });
}
export const clearQueue = () => useDJ.setState({ queue: [] });

export function toggleAutomix() {
  const on = !dj().automix;
  useDJ.setState({ automix: on });
  if (!on) return;
  const s = dj();
  const anyPlaying = s.live && s.decks[s.live].playing;
  if (anyPlaying) return;
  // Arranca solo: usa lo cargado o el primer tema de la cola.
  const ready = (['A', 'B'] as DeckId[]).find((id) => s.decks[id].track && !s.decks[id].played);
  if (ready) return play(ready);
  const next = s.queue[0];
  if (!next) return toast('Agregá temas a la cola de Automix');
  dequeue(0);
  void loadTrack('A', next).then((ok) => ok && play('A'));
}

let automixLoading = false;

function tick() {
  const s = dj();
  const live = s.live;
  if (!live) return;
  const d = s.decks[live];
  if (!d.track || !d.playing) return;
  const pos = getPosition(live);
  lastLivePos = pos;

  // Fallback por si el SDK no avisa el final del tema.
  if (sdkUri && !clock.paused && clock.pos + (now() - clock.ts) > d.track.durationMs + 2000) {
    player?.pause().catch(() => undefined);
    clock.paused = true;
    return onTrackEnded(live);
  }

  // Loops
  const { loopsEnabled, fadeSeconds } = useSettings.getState();
  const L = d.loop;
  if (loopsEnabled && L.active && L.in != null && L.out != null && pos >= L.out - 15) {
    seek(live, L.in);
    return;
  }

  if (!s.automix) return;
  const o = other(live);
  const od = s.decks[o];
  if ((!od.track || od.played) && s.queue.length && !automixLoading && !(s.live === o && od.playing)) {
    automixLoading = true;
    const next = s.queue[0];
    dequeue(0);
    void loadTrack(o, next).finally(() => (automixLoading = false));
    return;
  }
  const remaining = d.track.durationMs - pos;
  if (od.track && !od.played && !s.transitioning && remaining <= fadeSeconds * 1000 + 400) {
    transition();
  }
}
