import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';

// Client access performs an isolated auth handoff before any account services start.
if (window.location.pathname !== '/client-access') {
  void import('./background/processor').then(({ default: backgroundProcessor }) => {
    console.log('Background processor initialized:', backgroundProcessor.isRunning ? 'running' : 'not running');
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
