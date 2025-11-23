import React, { useState, useEffect } from 'react';
import { isStandalone, isIOS, canInstallPWA } from '../serviceWorkerRegistration';

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (isStandalone()) {
      return;
    }

    // Check if user has dismissed the prompt before
    const hasDismissed = localStorage.getItem('pwa-install-dismissed');
    if (hasDismissed) {
      setDismissed(true);
      return;
    }

    // Handle iOS devices
    if (isIOS()) {
      // Show iOS instructions after a delay
      const timer = setTimeout(() => {
        setShowIOSInstructions(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Handle beforeinstallprompt event for other browsers
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Show the install prompt
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response to the install prompt: ${outcome}`);

    // Clear the deferredPrompt for next time
    setDeferredPrompt(null);
    setShowPrompt(false);

    if (outcome === 'dismissed') {
      // User dismissed, don't show again for 7 days
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSInstructions(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setDismissed(true);
  };

  const handleRemindLater = () => {
    setShowPrompt(false);
    setShowIOSInstructions(false);
    // Don't set dismissed, will show again on next visit
  };

  if (dismissed || isStandalone()) {
    return null;
  }

  // iOS Install Instructions
  if (showIOSInstructions) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '0',
          left: '0',
          right: '0',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px',
          boxShadow: '0 -4px 6px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
              📱 Install QuoteApp
            </h3>
            <button
              onClick={handleDismiss}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px'
              }}
            >
              ×
            </button>
          </div>

          <p style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: '1.5' }}>
            Install this app on your iPhone for quick access and offline use:
          </p>

          <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '16px', borderRadius: '8px', fontSize: '14px' }}>
            <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>
                Tap the <strong>Share</strong> button{' '}
                <span style={{ display: 'inline-block', fontSize: '18px' }}>⎋</span> at the bottom of Safari
              </li>
              <li>
                Scroll down and tap <strong>"Add to Home Screen"</strong>{' '}
                <span style={{ display: 'inline-block', fontSize: '18px' }}>➕</span>
              </li>
              <li>
                Tap <strong>"Add"</strong> in the top right corner
              </li>
            </ol>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={handleRemindLater}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              Maybe Later
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'white',
                border: 'none',
                color: '#667eea',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              Got It!
            </button>
          </div>
        </div>

        <style>{`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  // Android/Desktop Install Prompt
  if (showPrompt && deferredPrompt) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px 24px',
          borderRadius: '12px',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
          zIndex: 9999,
          maxWidth: '500px',
          width: '90%',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ fontSize: '32px' }}>📱</div>

          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>
              Install QuoteApp
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: '1.5', opacity: 0.95 }}>
              Install this app for quick access, offline use, and push notifications for quote updates.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handleInstallClick}
                style={{
                  background: 'white',
                  border: 'none',
                  color: '#667eea',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
              >
                Install Now
              </button>
              <button
                onClick={handleRemindLater}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Maybe Later
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  opacity: 0.8
                }}
              >
                Don't Show Again
              </button>
            </div>
          </div>

          <button
            onClick={handleRemindLater}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1',
              opacity: 0.8
            }}
          >
            ×
          </button>
        </div>

        <style>{`
          @keyframes slideUp {
            from {
              transform: translateX(-50%) translateY(100px);
              opacity: 0;
            }
            to {
              transform: translateX(-50%) translateY(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  return null;
};

export default InstallPrompt;
