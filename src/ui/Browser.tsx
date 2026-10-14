import { useCallback, useEffect, useRef, useState } from 'react';
import { clearQueue, dequeue, enqueue, loadAuto, loadTrack, moveQueue } from '../engine/engine';
import { useDJ } from '../engine/store';
import { loadMetas } from '../lib/db';
import { ApiError, likedTracks, myPlaylists, playlistTracks, searchTracks, type Page, type Playlist, type Track } from '../lib/spotify';
import { TRACK_MIME, fmtBpm, fmtClock, fmtTime } from './util';

type Source =
  | { kind: 'search'; q: string }
  | { kind: 'liked' }
  | { kind: 'playlist'; id: string; name: string; owned: boolean };

const sourceKey = (s: Source) => (s.kind === 'search' ? `s:${s.q}` : s.kind === 'liked' ? 'liked' : `p:${s.id}`);

function fetchPage(src: Source, offset: number): Promise<Page<Track>> {
  if (src.kind === 'search') return searchTracks(src.q, offset);
  if (src.kind === 'liked') return likedTracks(offset);
  return playlistTracks(src.id, offset);
}

function useMetaPreload(tracks: Track[]) {
  useEffect(() => {
    const cache = useDJ.getState().metaCache;
    const missing = tracks.map((t) => t.id).filter((id) => !(id in cache));
    if (!missing.length) return;
    void loadMetas(missing).then((found) => {
      if (Object.keys(found).length) useDJ.setState((s) => ({ metaCache: { ...s.metaCache, ...found } }));
    });
  }, [tracks]);
}

function TrackRow({ t, i, onPlay }: { t: Track; i: number; onPlay: (t: Track) => void }) {
  const bpm = useDJ((s) => s.metaCache[t.id]?.bpm ?? null);
  const inA = useDJ((s) => s.decks.A.track?.id === t.id);
  const inB = useDJ((s) => s.decks.B.track?.id === t.id);
  return (
    <div
      className={`row ${inA ? 'in-a' : ''} ${inB ? 'in-b' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TRACK_MIME, JSON.stringify(t));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => onPlay(t)}
    >
      <span className="c-n">{i + 1}</span>
      <span className="c-img">{t.image && <img src={t.image} alt="" loading="lazy" />}</span>
      <span className="c-title" title={t.name}>{t.name}</span>
      <span className="c-artist" title={t.artists}>{t.artists}</span>
      <span className="c-bpm">{bpm ? fmtBpm(bpm) : ''}</span>
      <span className="c-time">{fmtTime(t.durationMs)}</span>
      <span className="c-act">
        <button className="ld a" onClick={() => void loadTrack('A', t)} title="Cargar en deck A">A</button>
        <button className="ld b" onClick={() => void loadTrack('B', t)} title="Cargar en deck B">B</button>
        <button className="ld q" onClick={() => enqueue(t)} title="Agregar a la cola de Automix">+</button>
      </span>
    </div>
  );
}

function TrackList({ src }: { src: Source }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = sourceKey(src);
  const reqId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (offset: number) => {
      const my = ++reqId.current;
      setLoading(true);
      setError('');
      try {
        const page = await fetchPage(src, offset);
        if (my !== reqId.current) return;
        setTracks((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
        setMore(page.next);
      } catch (e) {
        if (my !== reqId.current) return;
        if (e instanceof ApiError && e.status === 403 && src.kind === 'playlist')
          setError('Spotify no deja leer los temas de playlists que no son tuyas (modo desarrollo).');
        else setError((e as Error).message);
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    setTracks([]);
    setMore(false);
    scroller.current?.scrollTo(0, 0);
    if (src.kind === 'playlist' && !src.owned) {
      setError('Spotify no deja leer los temas de playlists que no son tuyas (modo desarrollo).');
      return;
    }
    void load(0);
  }, [load, key]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && more && !loading) void load(tracks.length);
    }, { root: scroller.current, rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading, tracks.length, load]);

  useMetaPreload(tracks);

  const title = src.kind === 'search' ? `Búsqueda: “${src.q}”` : src.kind === 'liked' ? 'Me gusta' : src.name;

  return (
    <div className="list">
      <div className="list-head">
        <span className="lh-title">{title}</span>
        <span className="lh-count">{total ? `${tracks.length} de ${total}` : ''}</span>
      </div>
      <div className="row header">
        <span className="c-n">#</span>
        <span className="c-img" />
        <span className="c-title">Título</span>
        <span className="c-artist">Artista</span>
        <span className="c-bpm">BPM</span>
        <span className="c-time">Dur.</span>
        <span className="c-act" />
      </div>
      <div className="rows" ref={scroller}>
        {tracks.map((t, i) => (
          <TrackRow key={`${t.id}-${i}`} t={t} i={i} onPlay={loadAuto} />
        ))}
        {error && <div className="list-msg err">{error}</div>}
        {!error && !loading && !tracks.length && <div className="list-msg">Sin resultados</div>}
        {loading && <div className="list-msg">Cargando…</div>}
        <div ref={sentinel} style={{ height: 1 }} />
      </div>
    </div>
  );
}

function Sideview() {
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const queue = useDJ((s) => s.queue);
  const history = useDJ((s) => s.history);
  const [over, setOver] = useState(false);
  const dragFrom = useRef<number | null>(null);

  return (
    <aside className="sideview">
      <div className="tabs">
        <button className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>
          Automix <small>{queue.length || ''}</small>
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Historial</button>
      </div>
      {tab === 'queue' ? (
        <div
          className={`side-list ${over ? 'drop' : ''}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(TRACK_MIME)) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            setOver(false);
            const raw = e.dataTransfer.getData(TRACK_MIME);
            if (raw && dragFrom.current === null) enqueue(JSON.parse(raw));
          }}
        >
          {queue.map((t, i) => (
            <div
              key={`${t.id}-${i}`}
              className="side-row"
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragEnd={() => (dragFrom.current = null)}
              onDragOver={(e) => dragFrom.current !== null && e.preventDefault()}
              onDrop={(e) => {
                if (dragFrom.current === null) return;
                e.stopPropagation();
                moveQueue(dragFrom.current, i);
                dragFrom.current = null;
              }}
              onDoubleClick={() => loadAuto(t)}
            >
              <span className="sr-n">{i + 1}</span>
              <div className="sr-txt">
                <div className="sr-t">{t.name}</div>
                <div className="sr-a">{t.artists}</div>
              </div>
              <span className="sr-time">{fmtTime(t.durationMs)}</span>
              <button className="sr-x" onClick={() => dequeue(i)} title="Quitar">✕</button>
            </div>
          ))}
          {!queue.length && <div className="list-msg">Arrastrá temas acá o usá “+” en la lista</div>}
          {queue.length > 0 && (
            <button className="side-clear" onClick={clearQueue}>Vaciar cola</button>
          )}
        </div>
      ) : (
        <div className="side-list">
          {history.map((h, i) => (
            <div key={`${h.track.id}-${h.at}`} className="side-row" draggable onDragStart={(e) => e.dataTransfer.setData(TRACK_MIME, JSON.stringify(h.track))}>
              <span className="sr-n">{history.length - i}</span>
              <div className="sr-txt">
                <div className="sr-t">{h.track.name}</div>
                <div className="sr-a">{h.track.artists}</div>
              </div>
              <span className="sr-time">{fmtClock(h.at)}</span>
            </div>
          ))}
          {!history.length && <div className="list-msg">Todavía no sonó nada</div>}
        </div>
      )}
    </aside>
  );
}

export function Browser() {
  const user = useDJ((s) => s.user);
  const [src, setSrc] = useState<Source>({ kind: 'liked' });
  const [q, setQ] = useState('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [plOpen, setPlOpen] = useState(true);

  useEffect(() => {
    if (!user) return;
    myPlaylists(user.id).then(setPlaylists, () => setPlaylists([]));
  }, [user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v) setSrc({ kind: 'search', q: v });
  };

  return (
    <div className="browser">
      <nav className="folders">
        <form className="search" onSubmit={submit}>
          <svg viewBox="0 0 24 24"><path d="M10 4a6 6 0 104.47 10l4.27 4.27 1.41-1.41-4.27-4.27A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en Spotify…" />
        </form>
        <button className={`folder ${src.kind === 'search' ? 'on' : ''}`} disabled={src.kind !== 'search'}>
          <span className="fi">⌕</span> Resultados
        </button>
        <button className={`folder ${src.kind === 'liked' ? 'on' : ''}`} onClick={() => setSrc({ kind: 'liked' })}>
          <span className="fi heart">♥</span> Me gusta
        </button>
        <button className="folder group" onClick={() => setPlOpen(!plOpen)}>
          <span className={`fi caret ${plOpen ? 'open' : ''}`}>▸</span> Playlists <small>{playlists.length || ''}</small>
        </button>
        <div className={`pl-list ${plOpen ? 'open' : ''}`}>
          {playlists.map((p) => (
            <button
              key={p.id}
              className={`folder sub ${src.kind === 'playlist' && src.id === p.id ? 'on' : ''} ${p.owned ? '' : 'locked'}`}
              onClick={() => setSrc({ kind: 'playlist', id: p.id, name: p.name, owned: p.owned })}
              title={p.owned ? `${p.total} temas` : 'Playlist de otro usuario: Spotify no permite leer sus temas en modo desarrollo'}
            >
              <span className="fi">{p.owned ? '♪' : '🔒'}</span>
              <span className="fl">{p.name}</span>
            </button>
          ))}
        </div>
        <a className="credit" href="https://getsongbpm.com" target="_blank" rel="noreferrer">
          BPM por GetSongBPM.com
        </a>
      </nav>
      <TrackList src={src} />
      <Sideview />
    </div>
  );
}
