import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('offline');

  // Actual connectivity check — ping the backend health endpoint
  const checkConnectivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let intervalId;

    const updateStatus = async () => {
      const online = await checkConnectivity();

      if (online && !isOnline) {
        // Was offline, now online
        setIsOnline(true);
        setNotificationType('online');
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
      } else if (!online && isOnline) {
        // Was online, now offline
        setIsOnline(false);
        setNotificationType('offline');
        setShowNotification(true);
      }
    };

    // Listen for browser online/offline events as hints, then verify
    const handleOnline = () => updateStatus('event');
    const handleOffline = () => updateStatus('event');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 30 seconds
    intervalId = setInterval(() => updateStatus('poll'), 30000);

    // Initial check
    updateStatus('init');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [checkConnectivity, isOnline]);

  // Don't show anything if online and notification is hidden
  if (isOnline && !showNotification) {
    return null;
  }

  return (
    <>
      {/* Persistent offline banner */}
      {!isOnline && (
        <div
          style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            padding: '12px 20px',
            textAlign: 'center',
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            animation: 'slideDown 0.3s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>&#128225;</span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                You're Offline
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                Some features may be limited. Changes will sync when you're back online.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification for coming back online */}
      {showNotification && notificationType === 'online' && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            padding: '16px 24px',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            zIndex: 10000,
            animation: 'slideInRight 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: '300px'
          }}
        >
          <span style={{ fontSize: '24px' }}>&#9989;</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
              You're Back Online!
            </div>
            <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
              Connection restored. Syncing changes...
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};

export default OfflineIndicator;
