/**
 * Commission Context
 * Manages commission visibility settings and permissions
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const CommissionContext = createContext(null);

/**
 * Default settings
 */
const DEFAULT_SETTINGS = {
  showCommission: true,
  showBreakdown: true,
  showConfirmation: true,
  showLeaderboard: true,
  showDailyWidget: true,
};

/**
 * Storage key for settings
 */
const STORAGE_KEY = 'pos_commission_settings';

/**
 * Commission Provider
 */
export function CommissionProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (err) {
      console.warn('[CommissionContext] Error loading settings:', err);
    }
    setLoading(false);
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[CommissionContext] Error saving settings:', err);
    }
  }, [settings]);

  /**
   * Check if user has permission to view commission
   * - Sales reps can see their own commissions
   * - Managers/admins can see all commissions
   */
  const hasPermission = useCallback((permission = 'view_own') => {
    if (!isAuthenticated || !user) return false;

    const role = user.role?.toLowerCase();
    const isManager = role === 'manager' || role === 'admin' || role === 'owner';

    switch (permission) {
      case 'view_own':
        // All authenticated users can view their own
        return settings.showCommission;

      case 'view_all':
        // Only managers can view all reps
        return isManager && settings.showCommission;

      case 'view_breakdown':
        return settings.showBreakdown && settings.showCommission;

      case 'view_leaderboard':
        return settings.showLeaderboard && settings.showCommission;

      case 'manage_rules':
        // Only admins can manage commission rules
        return role === 'admin' || role === 'owner';

      default:
        return false;
    }
  }, [isAuthenticated, user, settings]);

  /**
   * Check if commission features should be shown
   */
  const shouldShowCommission = useCallback(() => {
    return isAuthenticated && settings.showCommission;
  }, [isAuthenticated, settings.showCommission]);

  /**
   * Toggle a specific setting
   */
  const toggleSetting = useCallback((key) => {
    if (settings.hasOwnProperty(key)) {
      saveSettings({ [key]: !settings[key] });
    }
  }, [settings, saveSettings]);

  const value = {
    // Settings
    settings,
    saveSettings,
    toggleSetting,
    loading,

    // Permissions
    hasPermission,
    shouldShowCommission,

    // Convenience checks
    canViewOwn: hasPermission('view_own'),
    canViewAll: hasPermission('view_all'),
    canViewBreakdown: hasPermission('view_breakdown'),
    canViewLeaderboard: hasPermission('view_leaderboard'),
    canManageRules: hasPermission('manage_rules'),

    // User info
    userId: user?.id,
    isManager: ['manager', 'admin', 'owner'].includes(user?.role?.toLowerCase()),
  };

  return (
    <CommissionContext.Provider value={value}>
      {children}
    </CommissionContext.Provider>
  );
}

/**
 * useCommissionContext hook
 */
export function useCommissionContext() {
  const context = useContext(CommissionContext);
  if (!context) {
    throw new Error('useCommissionContext must be used within a CommissionProvider');
  }
  return context;
}

export default CommissionContext;
