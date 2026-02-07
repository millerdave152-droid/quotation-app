import { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(0);
  const [toast, setToast] = useState(null);

  // Listen for online/offline events
  useState(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <AppContext.Provider value={{ online, pendingSyncs, setPendingSyncs, toast, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
