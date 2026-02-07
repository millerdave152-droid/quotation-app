import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import companyConfig from '../../config/companyConfig';
import NotificationBadge from './NotificationBadge';
import NotificationDropdown from './NotificationDropdown';
import ThemeToggle from '../ui/ThemeToggle';

import { authFetch } from '../../services/authFetch';
// Header Action Button Component
const HeaderButton = ({ icon, badge, onClick, title, ariaExpanded, ariaHaspopup }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={badge > 0 ? `${title}, ${badge} notifications` : title}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        border: 'none',
        background: isHovered ? '#f3f4f6' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        transition: 'background 0.2s ease',
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {badge > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            minWidth: '16px',
            height: '16px',
            borderRadius: '8px',
            background: '#ef4444',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
          }}
          aria-hidden="true"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
};

// User Dropdown Component
const UserDropdown = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (user) => {
    if (!user) return 'U';
    // Handle both firstName/lastName and name formats
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) return user.firstName[0].toUpperCase();
    if (user.name) return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    if (user.email) return user.email[0].toUpperCase();
    return 'U';
  };

  const getDisplayName = (user) => {
    if (!user) return 'User';
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    if (user.firstName) return user.firstName;
    if (user.name) return user.name;
    if (user.email) return user.email.split('@')[0];
    return 'User';
  };

  const menuItems = [
    { label: 'Profile Settings', icon: '👤', action: () => navigate('/settings/profile') },
    { label: 'Preferences', icon: '⚙️', action: () => navigate('/settings/preferences') },
    { divider: true },
    { label: 'Logout', icon: '🚪', action: onLogout, danger: true },
  ];

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`User menu for ${getDisplayName(user)}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          background: 'white',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
          aria-hidden="true"
        >
          {getInitials(user)}
        </div>
        <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
          {getDisplayName(user)}
        </span>
        <span style={{ fontSize: '12px', color: '#9ca3af' }} aria-hidden="true">▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          minWidth: '200px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          zIndex: 1001,
        }}>
          {/* User Info Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: '600', color: '#111827' }}>
              {getDisplayName(user)}
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
              {user?.email || 'user@company.com'}
            </div>
            {user?.role && (
              <div style={{
                fontSize: '11px',
                color: '#667eea',
                marginTop: '4px',
                textTransform: 'capitalize',
                fontWeight: '500'
              }}>
                {user.role}
              </div>
            )}
          </div>

          {/* Menu Items */}
          <div style={{ padding: '8px' }} role="menu" aria-label="User actions">
            {menuItems.map((item, index) => (
              item.divider ? (
                <div key={index} role="separator" style={{ height: '1px', background: '#e5e7eb', margin: '8px 0' }} />
              ) : (
                <button
                  key={index}
                  role="menuitem"
                  onClick={() => {
                    item.action();
                    setIsOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'transparent',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: item.danger ? '#dc2626' : '#374151',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Global Search Component
const GlobalSearch = ({ isMobile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'products', label: 'Products' },
    { value: 'customers', label: 'Customers' },
    { value: 'quotes', label: 'Quotes' },
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      // Navigate to search results page or filter current page
      navigate(`/search?q=${encodeURIComponent(searchTerm)}&type=${category}`);
    }
  };

  if (isMobile && !isExpanded) {
    return (
      <HeaderButton
        icon="🔍"
        onClick={() => setIsExpanded(true)}
        title="Search"
        ariaExpanded={false}
      />
    );
  }

  return (
    <form
      onSubmit={handleSearch}
      role="search"
      aria-label="Global search"
      style={{
        display: 'flex',
        alignItems: 'center',
        flex: isMobile ? 1 : '0 1 500px',
        maxWidth: '500px',
        background: '#f3f4f6',
        borderRadius: '10px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        color: '#9ca3af',
      }} aria-hidden="true">
        🔍
      </div>

      <label htmlFor="global-search" className="sr-only">Search</label>
      <input
        id="global-search"
        type="search"
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        aria-label="Search products, customers, and quotes"
        style={{
          flex: 1,
          padding: '10px 0',
          border: 'none',
          background: 'transparent',
          fontSize: '14px',
          outline: 'none',
          minWidth: '100px',
        }}
      />

      <label htmlFor="search-category" className="sr-only">Search category</label>
      <select
        id="search-category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Select search category"
        style={{
          padding: '10px 12px',
          border: 'none',
          borderLeft: '1px solid #e5e7eb',
          background: 'transparent',
          fontSize: '14px',
          color: '#6b7280',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {categories.map(cat => (
          <option key={cat.value} value={cat.value}>{cat.label}</option>
        ))}
      </select>

      {isMobile && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          aria-label="Close search"
          style={{
            padding: '10px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#6b7280',
          }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </form>
  );
};

// Notification Panel Dropdown
const NotificationPanel = ({ isOpen, onClose, dropdownRef }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const res = await authFetch(`${API_URL}/api/activities/recent?limit=10`);
      const data = await res.json();
      setNotifications(data.data?.activities || data.activities || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (notif) => {
    // Use the icon from the API if available
    if (notif.icon) return notif.icon;

    const icons = {
      CREATED: '✨',
      UPDATED: '✏️',
      STATUS_CHANGED: '🔄',
      SENT: '📤',
      WON: '🎉',
      LOST: '😔',
      NOTE_ADDED: '📝',
      CUSTOMER_CONTACTED: '📞',
    };
    return icons[notif.event_type] || '🔔';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '360px',
        maxHeight: '480px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        zIndex: 1001,
      }}
    >
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontWeight: '600', color: '#111827' }}>Notifications</div>
        <button
          onClick={() => navigate('/activities')}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            color: '#3b82f6',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          View All
        </button>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
            No notifications yet
          </div>
        ) : (
          notifications.map((notif, index) => (
            <div
              key={notif.id || index}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                if (notif.quotation_id) navigate(`/quotes/${notif.quotation_id}`);
                onClose();
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ fontSize: '20px' }}>{getActivityIcon(notif)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#111827', lineHeight: '1.4' }}>
                    {notif.description || notif.event_type?.replace(/_/g, ' ')}
                  </div>
                  {notif.quote_number && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                      {notif.quote_number} • {notif.customer_name || 'No customer'}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                    {formatTime(notif.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Help Panel Dropdown
const HelpPanel = ({ isOpen, onClose, dropdownRef }) => {
  const helpItems = [
    { icon: '📖', label: 'Documentation', action: () => window.open('https://docs.teletime.ca', '_blank') },
    { icon: '⌨️', label: 'Keyboard Shortcuts', action: null, disabled: true },
    { icon: '🆕', label: "What's New", action: null, disabled: true },
    { divider: true },
    { icon: '💬', label: 'Contact Support', action: () => window.location.href = 'mailto:support@teletime.ca' },
    { icon: '🐛', label: 'Report a Bug', action: () => window.location.href = 'mailto:bugs@teletime.ca' },
  ];

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      role="menu"
      aria-label="Help and support options"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '220px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        zIndex: 1001,
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        fontWeight: '600',
        color: '#111827',
      }} id="help-panel-title">
        Help & Support
      </div>
      <div style={{ padding: '8px' }} aria-labelledby="help-panel-title">
        {helpItems.map((item, index) => (
          item.divider ? (
            <div key={index} role="separator" style={{ height: '1px', background: '#e5e7eb', margin: '8px 0' }} />
          ) : (
            <button
              key={index}
              role="menuitem"
              onClick={() => {
                if (item.action) item.action();
                onClose();
              }}
              disabled={item.disabled}
              aria-disabled={item.disabled}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: 'transparent',
                borderRadius: '8px',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                color: item.disabled ? '#9ca3af' : '#374151',
                opacity: item.disabled ? 0.6 : 1,
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => !item.disabled && (e.target.style.background = '#f3f4f6')}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.disabled && <span style={{ marginLeft: 'auto', fontSize: '10px' }} aria-label="Coming soon">Soon</span>}
            </button>
          )
        ))}
      </div>
    </div>
  );
};

// Apps Menu Dropdown
const AppsMenu = ({ isOpen, onClose, dropdownRef }) => {
  const navigate = useNavigate();

  const apps = [
    { icon: '📝', label: 'New Quote', path: '/quotes/new', color: '#3b82f6' },
    { icon: '📦', label: 'Products', path: '/products', color: '#8b5cf6' },
    { icon: '👥', label: 'Customers', path: '/customers', color: '#10b981' },
    { icon: '📊', label: 'Analytics', path: '/analytics', color: '#f59e0b' },
    { icon: '🏪', label: 'Marketplace', path: '/marketplace', color: '#ec4899' },
    { icon: '📋', label: 'Reports', path: '/reports', color: '#6366f1' },
  ];

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      role="menu"
      aria-label="Quick access applications"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '280px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        zIndex: 1001,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: '600',
          color: '#111827',
        }}
        id="apps-menu-title"
      >
        Quick Access
      </div>
      <div
        style={{
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}
        aria-labelledby="apps-menu-title"
      >
        {apps.map((app, index) => (
          <button
            key={index}
            role="menuitem"
            aria-label={`Go to ${app.label}`}
            onClick={() => {
              navigate(app.path);
              onClose();
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: `${app.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
              aria-hidden="true"
            >
              {app.icon}
            </div>
            <span style={{ fontSize: '11px', color: '#374151', fontWeight: '500' }}>
              {app.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Main Header Component
const Header = ({ isMobile }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Dropdown states
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

  // Refs for click-outside detection
  const helpRef = useRef(null);
  const appsRef = useRef(null);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (helpRef.current && !helpRef.current.contains(event.target)) {
        setHelpOpen(false);
      }
      if (appsRef.current && !appsRef.current.contains(event.target)) {
        setAppsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header
      role="banner"
      aria-label="Main header"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: 'linear-gradient(to right, #f8fafc, #ffffff)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        zIndex: 1000,
        gap: '16px',
      }}
    >
      {/* Left: Logo and Title */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        {/* TELETIME Logo */}
        <img
          src="/teletime-logo.png"
          alt="TELETIME"
          style={{
            height: '40px',
            width: 'auto',
            objectFit: 'contain',
          }}
          onError={(e) => {
            // Fallback to icon if logo not found
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        {/* Fallback logo icon */}
        <div style={{
          display: 'none',
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #0066b2 0%, #0096d6 100%)',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold',
        }}>
          TT
        </div>

        {/* Title - Hide on mobile */}
        {!isMobile && (
          <div>
            <div style={{
              fontSize: '18px',
              fontWeight: '700',
              color: '#0066b2',
              letterSpacing: '-0.02em',
            }}>
              {companyConfig.name || 'TELETIME'}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '-2px',
              fontWeight: '500',
            }}>
              Quotation System
            </div>
          </div>
        )}
      </div>

      {/* Center: Search Bar */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <GlobalSearch isMobile={isMobile} />
      </div>

      {/* Right: Action Buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
      }}>
        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <NotificationBadge
            onClick={() => {
              setNotificationOpen(!notificationOpen);
              setHelpOpen(false);
              setAppsOpen(false);
            }}
            isOpen={notificationOpen}
          />
          <NotificationDropdown
            isOpen={notificationOpen}
            onClose={() => setNotificationOpen(false)}
          />
        </div>

        {!isMobile && (
          <>
            {/* Help */}
            <div ref={helpRef} style={{ position: 'relative' }}>
              <HeaderButton
                icon="❓"
                title="Help"
                ariaExpanded={helpOpen}
                ariaHaspopup="menu"
                onClick={() => {
                  setHelpOpen(!helpOpen);
                  setNotificationOpen(false);
                  setAppsOpen(false);
                }}
              />
              <HelpPanel
                isOpen={helpOpen}
                onClose={() => setHelpOpen(false)}
                dropdownRef={helpRef}
              />
            </div>

            {/* Apps */}
            <div ref={appsRef} style={{ position: 'relative' }}>
              <HeaderButton
                icon="⊞"
                title="Quick Access Apps"
                ariaExpanded={appsOpen}
                ariaHaspopup="menu"
                onClick={() => {
                  setAppsOpen(!appsOpen);
                  setNotificationOpen(false);
                  setHelpOpen(false);
                }}
              />
              <AppsMenu
                isOpen={appsOpen}
                onClose={() => setAppsOpen(false)}
                dropdownRef={appsRef}
              />
            </div>
          </>
        )}

        {/* Theme Toggle */}
        <ThemeToggle size="default" />

        <div style={{ width: '1px', height: '24px', background: '#e5e7eb', margin: '0 8px' }} />
        <UserDropdown user={user} onLogout={handleLogout} />
      </div>
    </header>
  );
};

export default Header;
