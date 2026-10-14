import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Spotify solo acepta redirect URIs loopback con IP explícita (no "localhost").
// GetSongBPM no expone CORS, así que se proxea desde el server de Vite (dev y preview).
const proxy = {
  '/gsbpm': {
    target: 'https://api.getsong.co',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/gsbpm/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
});
