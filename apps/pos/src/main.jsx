/**
 * TeleTime POS - Entry Point
 * Application bootstrap with providers and error handling
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Providers
import { AuthProvider } from './context/AuthContext';
import { RegisterProvider } from './context/RegisterContext';
import { CartProvider } from './context/CartContext';
import { ManagerApprovalProvider } from './components/Checkout/ManagerApprovalProvider';
import { BatchEmailProvider } from './contexts/BatchEmailContext';

// Components
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Error tracking
import errorTracker from './services/ErrorTracker';

// Styles
import './index.css';

// ============================================================================
// ENVIRONMENT LOGGING
// ============================================================================

if (import.meta.env.DEV) {
  console.log('[TeleTime POS] Starting in development mode');
  console.log('[TeleTime POS] API URL:', import.meta.env.VITE_API_URL || '/api');
  console.log('[TeleTime POS] Environment:', import.meta.env.MODE);
}

// ============================================================================
// CLIENT ERROR TRACKING — install global listeners before React renders
// ============================================================================
errorTracker.install();

// Flush any queued errors when the page is about to unload
window.addEventListener('beforeunload', () => errorTracker.flush());

// ============================================================================
// SERVICE WORKER REGISTRATION (for future PWA support)
// ============================================================================

// Uncomment to enable service worker registration
// if ('serviceWorker' in navigator && import.meta.env.PROD) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js')
//       .then(registration => {
//         console.log('[TeleTime POS] SW registered:', registration.scope);
//       })
//       .catch(error => {
//         console.error('[TeleTime POS] SW registration failed:', error);
//       });
//   });
// }

// ============================================================================
// RENDER APPLICATION
// ============================================================================

/**
 * Application wrapper with all providers
 */
function AppWithProviders() {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <RegisterProvider>
              <CartProvider>
                <ManagerApprovalProvider>
                  <BatchEmailProvider>
                    <App />
                  </BatchEmailProvider>
                </ManagerApprovalProvider>
              </CartProvider>
            </RegisterProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Mount the application
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    '[TeleTime POS] Root element not found. Make sure there is a <div id="root"></div> in your index.html'
  );
}

const root = ReactDOM.createRoot(rootElement);
root.render(<AppWithProviders />);

// ============================================================================
// HOT MODULE REPLACEMENT (Development)
// ============================================================================

if (import.meta.hot) {
  import.meta.hot.accept();
}
