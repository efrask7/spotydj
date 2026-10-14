let loading: Promise<void> | null = null;

/** Carga el Web Playback SDK de Spotify una sola vez. */
export function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => reject(new Error('No se pudo cargar el SDK de Spotify'));
    document.head.appendChild(s);
  });
  return loading;
}
