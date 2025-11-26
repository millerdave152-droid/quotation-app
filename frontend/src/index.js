import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);

// Register service worker for PWA functionality (only in production)
if (process.env.NODE_ENV === 'production') {
  serviceWorkerRegistration.register({
    onSuccess: (registration) => {
      console.log('✅ Service worker registered successfully');
    },
    onUpdate: (registration) => {
      console.log('🔄 New version available! Please refresh.');
      // Show a non-blocking notification instead of confirm dialog
      const updateAvailable = document.createElement('div');
      updateAvailable.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        cursor: pointer;
        font-family: system-ui, -apple-system, sans-serif;
      `;
      updateAvailable.textContent = '🔄 Update available! Click to refresh';
      updateAvailable.onclick = () => window.location.reload();
      document.body.appendChild(updateAvailable);
    },
  });
} else {
  console.log('⚠️ Service worker disabled in development mode');
}