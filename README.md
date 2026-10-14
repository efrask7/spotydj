# SpotyDJ

Consola de DJ estilo VirtualDJ que reproduce desde Spotify con la API oficial (Web API + Web Playback SDK). Requiere Spotify Premium.

Datos de BPM provistos por [GetSongBPM.com](https://getsongbpm.com).

## Setup

1. Creá una app en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
   - APIs: **Web API** y **Web Playback SDK**.
   - Redirect URI: `http://127.0.0.1:5173/callback` (Spotify no acepta `localhost`).
2. `cp .env.example .env` y poné tu `VITE_SPOTIFY_CLIENT_ID`. También podés cargarlo en la pantalla de login.
3. Opcional: key gratuita de [GetSongBPM](https://getsongbpm.com/api) en `VITE_GETSONGBPM_KEY` o en Ajustes.
4. `npm install` y `npm run dev`. Abrí `http://127.0.0.1:5173` en Chrome o Edge.

`npm run build` + `npm run preview` sirve la versión compilada en el mismo puerto (el proxy de GetSongBPM funciona en ambos).

## Cómo funciona

Spotify permite **un solo stream por cuenta**, así que hay un único reproductor y dos decks lógicos:

- El deck **en vivo** es el que suena. El otro tiene su tema, cue y posición listos.
- **Crossfader:** baja el volumen del deck en vivo; al cruzar el centro entra el otro deck desde su posición (transición secuencial, no superpuesta).
- **Play en el deck que no suena:** lo deja **EN ESPERA**; entra al cruzar el crossfader o con **MIX**.
- **MIX:** transición automática con la duración configurada (2–30 s).
- **Automix:** toma temas de la cola y mezcla automáticamente antes de que termine cada tema. Los temas arrancan en su punto CUE.
- **CUE:** pausado fija el cue; sonando vuelve al cue y pausa. **Hot cues** 1–8: click guarda/salta, click derecho borra.
- **Loops** (experimental): por beats con BPM o IN/OUT manual. Usan saltos de posición, pueden tener una pequeña demora.
- **BPM:** TAP manual o búsqueda en GetSongBPM. Cues, hot cues y BPM se guardan en IndexedDB.
- La vista superior muestra la **grilla de beats** anclada al CUE (Spotify no expone audio para dibujar la forma de onda).

## Límites de la API (modo desarrollo, 2026)

- Sin audio crudo (DRM): no hay pitch, EQ, efectos, key lock ni grabación.
- `audio-features` / `audio-analysis` no disponibles para apps nuevas: el BPM viene de TAP o GetSongBPM.
- Solo se pueden leer los temas de playlists propias o colaborativas.
- Búsqueda limitada a 10 resultados por página (se cargan más al hacer scroll).
- Máximo 5 usuarios por app y el dueño necesita Premium.
