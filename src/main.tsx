import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useDJ } from './engine/store';
import './styles.css';

if (import.meta.env.DEV) (window as unknown as { __dj: typeof useDJ }).__dj = useDJ;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
