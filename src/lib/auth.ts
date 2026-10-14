import { useSettings } from '../store/settings';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const TOKEN_KEY = 'spotydj.token';
const VERIFIER_KEY = 'spotydj.pkce';

interface TokenSet {
  access: string;
  refresh: string;
  expiresAt: number;
}

export const redirectUri = () => `${location.origin}/callback`;

function readToken(): TokenSet | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as TokenSet) : null;
  } catch {
    return null;
  }
}

function saveToken(json: { access_token: string; refresh_token?: string; expires_in: number }) {
  const prev = readToken();
  const t: TokenSet = {
    access: json.access_token,
    refresh: json.refresh_token ?? prev?.refresh ?? '',
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  return t;
}

function base64url(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function login() {
  const clientId = useSettings.getState().clientId.trim();
  if (!clientId) throw new Error('Falta el Client ID de Spotify');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  localStorage.setItem(VERIFIER_KEY, verifier);
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });
  location.assign(`https://accounts.spotify.com/authorize?${q}`);
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || `Error de auth (${res.status})`);
  }
  return saveToken(await res.json());
}

let callbackOnce: Promise<string | null> | null = null;

/** Procesa /callback?code=... si corresponde. Devuelve un mensaje de error o null. */
export function handleCallback(): Promise<string | null> {
  return (callbackOnce ??= processCallback());
}

async function processCallback(): Promise<string | null> {
  if (location.pathname !== '/callback') return null;
  const params = new URLSearchParams(location.search);
  history.replaceState(null, '', '/');
  const error = params.get('error');
  if (error) return error === 'access_denied' ? 'Cancelaste el acceso a Spotify' : error;
  const code = params.get('code');
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!code || !verifier) return 'Respuesta de login inválida, probá de nuevo';
  localStorage.removeItem(VERIFIER_KEY);
  try {
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: useSettings.getState().clientId.trim(),
      code_verifier: verifier,
    });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

let refreshing: Promise<TokenSet> | null = null;

export async function getToken(force = false): Promise<string> {
  const t = readToken();
  if (!t) throw new Error('Sin sesión');
  if (!force && t.expiresAt - Date.now() > 60_000) return t.access;
  if (!t.refresh) throw new Error('Sesión vencida');
  refreshing ??= tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: t.refresh,
    client_id: useSettings.getState().clientId.trim(),
  }).finally(() => (refreshing = null));
  return (await refreshing).access;
}

export const hasSession = () => !!readToken();
export const tokenExpiresAt = () => readToken()?.expiresAt ?? 0;

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}
