/** Tap tempo: promedia los intervalos de los últimos toques. */
export class TapTempo {
  private taps: number[] = [];

  tap(now = performance.now()): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last && now - last > 2000) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 3) return null;
    const span = this.taps[this.taps.length - 1] - this.taps[0];
    const bpm = (60000 * (this.taps.length - 1)) / span;
    return Math.round(bpm * 10) / 10;
  }

  get count() {
    return this.taps.length;
  }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*[-(\[].*(remaster|version|edit|mix|live|feat).*$/i, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();

/**
 * Busca BPM y tonalidad en GetSongBPM (vía proxy de Vite por CORS).
 * Devuelve null si no hay coincidencia razonable.
 */
export async function fetchBpm(
  title: string,
  artist: string,
  apiKey: string,
): Promise<{ bpm: number; key: string | null } | null> {
  const firstArtist = artist.split(',')[0].trim();
  const p = new URLSearchParams({
    api_key: apiKey,
    type: 'both',
    lookup: `song:${normalize(title)} artist:${firstArtist}`,
  });
  const res = await fetch(`/gsbpm/search/?${p}`);
  if (!res.ok) throw new Error(`GetSongBPM respondió ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.search) ? data.search : [];
  const want = normalize(firstArtist);
  const hit =
    list.find((s: { artist?: { name?: string } }) => normalize(s.artist?.name ?? '') === want) ?? list[0];
  const bpm = Number(hit?.tempo);
  if (!hit || !Number.isFinite(bpm) || bpm <= 0) return null;
  return { bpm, key: hit.key_of || null };
}
