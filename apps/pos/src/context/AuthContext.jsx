import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { del } from 'idb-keyval';
import api, { setAuthToken, clearAuth } from '../api/axios';
import errorTracker from '../services/ErrorTracker';

const AuthContext = createContext(null);

/**
 * Fallback permissions by role when backend hasn't returned permissions yet
 */
const FALLBACK_PERMISSIONS = {
  admin: [
    'pos.checkout.create', 'pos.checkout.discount', 'pos.checkout.price_override', 'pos.checkout.void',
    'pos.returns.create', 'pos.returns.process_refund',
    'pos.drawer.open', 'pos.drawer.close_shift',
    'pos.customers.create', 'pos.customers.edit', 'pos.reports.view',
  ],
  manager: [
    'pos.checkout.create', 'pos.checkout.discount', 'pos.checkout.price_override', 'pos.checkout.void',
    'pos.returns.create', 'pos.returns.process_refund',
    'pos.drawer.open', 'pos.drawer.close_shift',
    'pos.customers.create', 'pos.customers.edit', 'pos.reports.view',
  ],
  user: [
    'pos.checkout.create', 'pos.drawer.open', 'pos.customers.create', 'pos.reports.view',
  ],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen for auth-expired events from axios interceptor.
  // Checks window.__posCheckoutActive to avoid redirecting during active checkout.
  // The checkout error handler will display its own "session expired" message.
  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn('[Auth] Session expired event received');

      // If checkout is in progress, let it handle the error itself
      if (window.__posCheckoutActive) {
        console.warn('[Auth] Checkout active - suppressing redirect');
        return;
      }

      setUser(null);
      setPermissions([]);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    };

    // After token refresh, re-fetch permissions from /auth/me so cached
    // permissions stay in sync with the backend.
    const handleTokenRefreshed = async () => {
      try {
        const response = await api.get('/auth/me');
        if (response?.success && response.data?.user) {
          const freshPerms = response.data.permissions
            || FALLBACK_PERMISSIONS[response.data.user.role]
            || FALLBACK_PERMISSIONS.user;
          setUser(response.data.user);
          setPermissions(freshPerms);
          localStorage.setItem('pos_user', JSON.stringify(response.data.user));
          localStorage.setItem('pos_permissions', JSON.stringify(freshPerms));
          console.log('[Auth] Permissions refreshed after token refresh');
        }
      } catch (err) {
        console.warn('[Auth] Permission refresh failed:', err.message);
      }
    };

    window.addEventListener('pos:auth-expired', handleAuthExpired);
    window.addEventListener('pos:token-refreshed', handleTokenRefreshed);
    return () => {
      window.removeEventListener('pos:auth-expired', handleAuthExpired);
      window.removeEventListener('pos:token-refreshed', handleTokenRefreshed);
    };
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('pos_token');
      const savedUser = localStorage.getItem('pos_user');
      const savedPerms = localStorage.getItem('pos_permissions');

      // Restore cached permissions immediately so UI doesn't flash
      if (savedPerms) {
        try { setPermissions(JSON.parse(savedPerms)); } catch {}
      }

      if (token && savedUser) {
        try {
          // Verify token is still valid
          setAuthToken(token);
          const response = await api.get('/auth/me');

          // Note: axios interceptor already unwraps response.data
          if (response?.success && response.data?.user) {
            setUser(response.data.user);
            setPermissions(response.data.permissions || FALLBACK_PERMISSIONS[response.data.user.role] || FALLBACK_PERMISSIONS.user);
          } else {
            // Token invalid, clear auth
            clearAuth();
          }
        } catch (err) {
          console.error('Auth verification failed:', err);
          clearAuth();
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  // Login function
  const login = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);

    try {
      // Note: axios interceptor already unwraps response.data
      const response = await api.post('/auth/login', { email, password });

      if (response?.success) {
        const { accessToken, refreshToken, user: userData } = response.data;
        const perms = response.data.permissions || FALLBACK_PERMISSIONS[userData.role] || FALLBACK_PERMISSIONS.user;

        // Store auth data (including refresh token for session renewal)
        setAuthToken(accessToken);
        if (refreshToken) {
          localStorage.setItem('pos_refresh_token', refreshToken);
        }
        localStorage.setItem('pos_user', JSON.stringify(userData));
        localStorage.setItem('pos_permissions', JSON.stringify(perms));

        setUser(userData);
        setPermissions(perms);
        errorTracker.setMeta({ userId: userData.id });
        return { success: true };
      } else {
        throw new Error(response?.message || 'Login failed');
      }
    } catch (err) {
      const message = err.message || 'Invalid credentials';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Notify server (optional, for session tracking)
      await api.post('/auth/logout').catch(() => {});
    } finally {
      clearAuth();
      localStorage.removeItem('pos_refresh_token');
      localStorage.removeItem('pos_permissions');
      // Clear cached PIN hashes and offline approval queue
      del('manager-pin-cache').catch(() => {});
      del('offline-approval-queue').catch(() => {});
      errorTracker.setMeta({ userId: null, shiftId: null });
      setUser(null);
      setPermissions([]);
    }
  }, []);

  // Update user profile
  const updateProfile = useCallback(async (updates) => {
    try {
      const response = await api.put('/users/me', updates);

      if (response.data?.success) {
        const updatedUser = { ...user, ...response.data.data };
        setUser(updatedUser);
        localStorage.setItem('pos_user', JSON.stringify(updatedUser));
        return { success: true };
      }

      throw new Error(response.data?.message || 'Update failed');
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [user]);

  // Change password
  const changePassword = useCallback(async (currentPassword, newPassword, confirmPassword) => {
    try {
      const response = await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      return { success: response?.success || response?.data?.success };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  // Check if user has specific role
  const hasRole = useCallback(
    (...roles) => {
      if (!user?.role) return false;
      return roles.some((role) => role.toLowerCase() === user.role.toLowerCase());
    },
    [user]
  );

  // Check if user is admin or manager
  const isAdminOrManager = useCallback(() => {
    return hasRole('admin', 'manager');
  }, [hasRole]);

  // Check if user has a specific POS permission
  const hasPermission = useCallback(
    (...perms) => {
      if (!permissions || permissions.length === 0) return false;
      return perms.some((p) => permissions.includes(p));
    },
    [permissions]
  );

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    updateProfile,
    changePassword,
    hasRole,
    isAdminOrManager,
    hasPermission,
    permissions,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
