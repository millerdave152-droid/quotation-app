import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  // Handle logout event from apiClient (triggered on token refresh failure)
  useEffect(() => {
    const handleLogoutEvent = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('auth:logout', handleLogoutEvent);
    return () => window.removeEventListener('auth:logout', handleLogoutEvent);
  }, []);

  // Fetch current user from API to get latest data (including approval threshold)
  const fetchCurrentUser = useCallback(async (authToken) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.user) {
          const updatedUser = data.data.user;
          setUser(updatedUser);
          localStorage.setItem('auth_user', JSON.stringify(updatedUser));
          return updatedUser;
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
    return null;
  }, [API_URL]);

  // Load user from localStorage on mount and optionally refresh from API
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('auth_user');

      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);

          // Refresh user data from API in background
          fetchCurrentUser(storedToken);
        } catch (error) {
          console.error('Error parsing stored user data:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [fetchCurrentUser]);

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Login failed');
      }

      // API returns { success, data: { user, accessToken, refreshToken } }
      const { user: userData, accessToken, refreshToken } = result.data;

      setToken(accessToken);
      setUser(userData);
      if (typeof window !== 'undefined') {
        window.__authExpired = false;
      }

      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('auth_user', JSON.stringify(userData));
      if (refreshToken) {
        localStorage.setItem('auth_refresh_token', refreshToken);
      }

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_refresh_token');
    if (typeof window !== 'undefined') {
      window.__authExpired = false;
    }
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('auth_user', JSON.stringify(updatedUser));
  };

  // Role helper functions
  const hasRole = useCallback((requiredRole) => {
    if (!user?.role) return false;
    const userRole = user.role.toLowerCase();
    const required = requiredRole.toLowerCase();
    return userRole === required;
  }, [user]);

  const hasAnyRole = useCallback((roles) => {
    if (!user?.role) return false;
    const userRole = user.role.toLowerCase();
    return roles.some(role => role.toLowerCase() === userRole);
  }, [user]);

  // Check if user can approve quotes (manager, supervisor, or admin)
  const canApproveQuotes = useMemo(() => {
    if (!user?.role) return false;
    const approverRoles = ['admin', 'manager', 'supervisor'];
    return approverRoles.includes(user.role.toLowerCase()) || user.canApproveQuotes === true;
  }, [user]);

  // Get user's approval threshold (for margin-based auto-approval)
  const approvalThreshold = useMemo(() => {
    return user?.approvalThresholdPercent || user?.approval_threshold_percent || null;
  }, [user]);

  // Check if user is admin
  const isAdmin = useMemo(() => {
    return user?.role?.toLowerCase() === 'admin';
  }, [user]);

  // Check if user is manager or above
  const isManagerOrAbove = useMemo(() => {
    if (!user?.role) return false;
    const managerRoles = ['admin', 'manager', 'supervisor'];
    return managerRoles.includes(user.role.toLowerCase());
  }, [user]);

  const value = useMemo(() => ({
    user,
    token,
    loading,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
    // Role helpers
    hasRole,
    hasAnyRole,
    canApproveQuotes,
    approvalThreshold,
    isAdmin,
    isManagerOrAbove,
    // Utility
    refreshUser: () => token && fetchCurrentUser(token)
  }), [user, token, loading, hasRole, hasAnyRole, canApproveQuotes, approvalThreshold, isAdmin, isManagerOrAbove, fetchCurrentUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
