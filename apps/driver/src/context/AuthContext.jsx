import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import { db } from '../lib/db';

const AuthContext = createContext(null);

const TOKEN_KEY = 'driver_token';
const REMEMBER_KEY = 'driver_remember';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const expiryTimerRef = useRef(null);

  // On mount: restore session
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      // Check if token is expired client-side
      if (isTokenExpired(token)) {
        await clearSession();
        setLoading(false);
        return;
      }

      // Use cached profile immediately (offline support)
      const cached = await db.get('meta', 'driverProfile');
      if (cached) setUser(cached);

      // Validate with server
      try {
        const res = await api.get('/api/auth/driver-login/me');
        const driver = res.data.driver || res.data;
        setUser(driver);
        await db.put('meta', driver, 'driverProfile');
        scheduleAutoLogout(token);
      } catch {
        // Network error — keep cached profile if available
        if (!cached) await clearSession();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, []);

  const login = useCallback(async (employeeId, pin, remember = false) => {
    const res = await api.post('/api/auth/driver-login', {
      employee_id: employeeId,
      pin,
      remember,
    });

    const { token, driver } = res.data;

    localStorage.setItem(TOKEN_KEY, token);
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, 'true');
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    setUser(driver);
    await db.put('meta', driver, 'driverProfile');
    scheduleAutoLogout(token);
    return driver;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/driver-login/logout');
    } catch { /* ignore network errors on logout */ }
    await clearSession();
  }, []);

  async function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    setUser(null);
    await db.delete('meta', 'driverProfile');
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
  }

  function scheduleAutoLogout(token) {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    const exp = getTokenExp(token);
    if (!exp) return;
    const msUntilExpiry = exp * 1000 - Date.now() - 60_000; // 1 min before
    if (msUntilExpiry > 0) {
      expiryTimerRef.current = setTimeout(() => clearSession(), msUntilExpiry);
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      isAuthenticated: !!user,
      isRemembered: localStorage.getItem(REMEMBER_KEY) === 'true',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function getTokenExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp || null;
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const exp = getTokenExp(token);
  if (!exp) return true;
  return Date.now() >= exp * 1000;
}
