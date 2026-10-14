import { getToken } from './auth';

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  image: string;
  imageLarge: string;
  durationMs: number;
}

export interface Playlist {
  id: string;
  name: string;
  total: number;
  image: string;
  owned: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  next: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = 'https://api.spotify.com/v1';

async function api<T>(path: string, init: RequestInit = {}, retry = 0): Promise<T> {
  const token = await getToken(retry > 0 && retry < 2);
  const res = await fetch(path.startsWith('http') ? path : BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && retry === 0) return api(path, init, 1);
  if (res.status === 429 && retry < 3) {
    const wait = Number(res.headers.get('Retry-After') ?? 1);
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api(path, init, retry + 2);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.message ?? `Spotify respondió ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTrack(t: any): Track | null {
  if (!t || t.type !== 'track' || !t.id) return null;
  const imgs: any[] = t.album?.images ?? [];
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name).join(', '),
    album: t.album?.name ?? '',
    image: imgs[imgs.length - 1]?.url ?? imgs[0]?.url ?? '',
    imageLarge: imgs[0]?.url ?? '',
    durationMs: t.duration_ms,
  };
}

const compact = <T>(arr: (T | null)[]) => arr.filter((x): x is T => x !== null);

export async function getMe() {
  const me = await api<any>('/me');
  return { id: me.id as string, name: (me.display_name || me.id) as string };
}

/** En modo desarrollo Spotify limita la búsqueda a 10 resultados por página. */
export const SEARCH_PAGE = 10;

export async function searchTracks(q: string, offset = 0): Promise<Page<Track>> {
  const p = new URLSearchParams({ q, type: 'track', limit: String(SEARCH_PAGE), offset: String(offset) });
  const r = await api<any>(`/search?${p}`);
  return {
    items: compact((r.tracks?.items ?? []).map(mapTrack)),
    total: r.tracks?.total ?? 0,
    next: !!r.tracks?.next,
  };
}

export async function likedTracks(offset = 0): Promise<Page<Track>> {
  const r = await api<any>(`/me/tracks?limit=50&offset=${offset}`);
  return { items: compact(r.items.map((i: any) => mapTrack(i.track))), total: r.total, next: !!r.next };
}

export async function myPlaylists(userId: string): Promise<Playlist[]> {
  const out: Playlist[] = [];
  let url: string | null = '/me/playlists?limit=50';
  while (url) {
    const r: any = await api<any>(url);
    for (const p of r.items ?? []) {
      if (!p) continue;
      const imgs: any[] = p.images ?? [];
      out.push({
        id: p.id,
        name: p.name,
        // Desde feb/2026 el campo "tracks" pasó a llamarse "items".
        total: p.items?.total ?? p.tracks?.total ?? 0,
        image: imgs[imgs.length - 1]?.url ?? '',
        owned: p.owner?.id === userId || !!p.collaborative,
      });
    }
    url = r.next;
  }
  return out;
}

export async function playlistTracks(id: string, offset = 0): Promise<Page<Track>> {
  const r = await api<any>(`/playlists/${id}/items?limit=50&offset=${offset}`);
  return {
    items: compact((r.items ?? []).map((i: any) => mapTrack(i.item ?? i.track))),
    total: r.total ?? 0,
    next: !!r.next,
  };
}

export async function playOnDevice(deviceId: string, uri: string, positionMs: number) {
  await api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
  });
}
