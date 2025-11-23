import React, { useState, useEffect } from 'react';

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('offline'); // 'offline' or 'online'

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNotificationType('online');
      setShowNotification(true);

      // Auto-hide the "back online" notification after 3 seconds
      setTimeout(() => {
        setShowNotification(false);
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNotificationType('offline');
      setShowNotification(true);
      // Keep offline notification visible until back online
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
            <span style={{ fontSize: '20px' }}>📡</span>
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
          <span style={{ fontSize: '24px' }}>✅</span>
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
