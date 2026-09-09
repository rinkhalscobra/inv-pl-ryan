import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';

// Import background processor to start automated trading logic
import backgroundProcessor from './background/processor';

// Ensure background processor is initialized
console.log('Background processor initialized:', backgroundProcessor.isRunning ? 'running' : 'not running');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);