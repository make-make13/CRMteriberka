import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress console.error for these specific messages
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('WebSocket') || msg.includes('[vite] failed to connect') || msg.includes('closed without opened')) {
      return;
    }
    originalConsoleError(...args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
