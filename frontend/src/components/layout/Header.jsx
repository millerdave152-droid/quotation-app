import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import companyConfig from '../../config/companyConfig';
import NotificationBadge from './NotificationBadge';
import NotificationDropdown from './NotificationDropdown';
import ThemeToggle from '../ui/ThemeToggle';

import WhatsNewPanel, { getUnreadCount } from '../ui/WhatsNewPanel';
import UniversalSearch from '../ui/UniversalSearch';
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

// Keyboard Shortcuts Modal
const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: ['Ctrl', 'K'], description: 'Open command palette' },
        { keys: ['Ctrl', 'Shift', 'F'], description: 'Global search' },
        { keys: ['Esc'], description: 'Close modal / cancel' },
      ]
    },
    {
      title: 'Quotes',
      shortcuts: [
        { keys: ['Ctrl', 'N'], description: 'New quote (on quotes page)' },
        { keys: ['Ctrl', 'S'], description: 'Save current form' },
        { keys: ['Ctrl', 'P'], description: 'Print / PDF preview' },
      ]
    },
    {
      title: 'Products',
      shortcuts: [
        { keys: ['Ctrl', 'Shift', 'F'], description: 'Search products globally' },
        { keys: ['Enter'], description: 'Confirm inline edit' },
        { keys: ['Esc'], description: 'Cancel inline edit' },
      ]
    }
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 14, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⌨️</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: 4,
          }}>✕</button>
        </div>
        <div style={{ padding: '16px 24px' }}>
          {shortcutGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: gi < shortcutGroups.length - 1 ? 20 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {group.title}
              </div>
              {group.shortcuts.map((s, si) => (
                <div key={si} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: si < group.shortcuts.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}>
                  <span style={{ fontSize: 14, color: '#374151' }}>{s.description}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {s.keys.map((key, ki) => (
                      <kbd key={ki} style={{
                        padding: '2px 8px', background: '#f3f4f6', borderRadius: 6, fontSize: 12,
                        fontWeight: 600, color: '#374151', border: '1px solid #d1d5db',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      }}>{key}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Contact Support Modal
const ContactSupportModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 14, width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Contact Support</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: 4,
          }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>Phone Support</div>
            <a href="tel:+19058907171" style={{ fontSize: 18, fontWeight: 700, color: '#111827', textDecoration: 'none' }}>
              (905) 890-7171
            </a>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Mon–Sat 10AM–7PM EST</div>
          </div>
          <div style={{ padding: 16, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', marginBottom: 4 }}>Email Support</div>
            <a href="mailto:support@teletime.ca" style={{ fontSize: 15, fontWeight: 600, color: '#111827', textDecoration: 'none' }}>
              support@teletime.ca
            </a>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Response within 24 hours</div>
          </div>
          <div style={{ padding: 16, background: '#fefce8', borderRadius: 10, border: '1px solid #fef08a' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a16207', marginBottom: 4 }}>Store Location</div>
            <div style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>Teletime Superstore</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Mississauga, Ontario</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Report a Bug Modal
const ReportBugModal = ({ isOpen, onClose }) => {
  const [bugData, setBugData] = useState({ subject: '', description: '', severity: 'medium' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!bugData.subject.trim() || !bugData.description.trim()) return;
    setSending(true);
    try {
      const mailtoBody = `Severity: ${bugData.severity}\n\nDescription:\n${bugData.description}\n\nPage: ${window.location.href}\nBrowser: ${navigator.userAgent}`;
      window.location.href = `mailto:bugs@teletime.ca?subject=${encodeURIComponent(`[Bug] ${bugData.subject}`)}&body=${encodeURIComponent(mailtoBody)}`;
      setSent(true);
      setTimeout(() => { setSent(false); setBugData({ subject: '', description: '', severity: 'medium' }); onClose(); }, 1500);
    } catch {
      /* fallback — email client will open */
    }
    setSending(false);
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 14, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🐛</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Report a Bug</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: 4,
          }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sent ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#15803d' }}>Bug report prepared!</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Your email client should open with the report details.</div>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Subject *</label>
                <input style={inputStyle} value={bugData.subject} onChange={e => setBugData(p => ({ ...p, subject: e.target.value }))} placeholder="Brief description of the issue" />
              </div>
              <div>
                <label style={labelStyle}>Severity</label>
                <select style={inputStyle} value={bugData.severity} onChange={e => setBugData(p => ({ ...p, severity: e.target.value }))}>
                  <option value="low">Low — Cosmetic issue</option>
                  <option value="medium">Medium — Feature not working correctly</option>
                  <option value="high">High — Blocking my work</option>
                  <option value="critical">Critical — Data loss or security issue</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>What happened? *</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} value={bugData.description} onChange={e => setBugData(p => ({ ...p, description: e.target.value }))} placeholder="Steps to reproduce, what you expected, what actually happened..." rows={4} />
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', background: '#f9fafb', padding: '8px 12px', borderRadius: 8 }}>
                Page URL and browser info will be included automatically.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSubmit} disabled={sending || !bugData.subject.trim() || !bugData.description.trim()} style={{
                  padding: '10px 20px', background: (!bugData.subject.trim() || !bugData.description.trim()) ? '#9ca3af' : '#ef4444', color: 'white',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: (!bugData.subject.trim() || !bugData.description.trim()) ? 'not-allowed' : 'pointer',
                }}>
                  {sending ? 'Sending...' : 'Submit Bug Report'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Help Panel Dropdown
const HelpPanel = ({ isOpen, onClose, dropdownRef, onWhatsNew, onShortcuts, onContact, onBugReport }) => {
  const navigate = useNavigate();

  const helpItems = [
    { icon: '📖', label: 'Documentation', action: () => { navigate('/training-center'); } },
    { icon: '⌨️', label: 'Keyboard Shortcuts', action: onShortcuts },
    { icon: '🆕', label: "What's New", action: onWhatsNew },
    { divider: true },
    { icon: '💬', label: 'Contact Support', action: onContact },
    { icon: '🐛', label: 'Report a Bug', action: onBugReport },
    { divider: true },
    { icon: '🔧', label: 'System Status', action: () => { navigate('/admin/monitoring'); } },
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
                color: '#374151',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
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
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewUnread, setWhatsNewUnread] = useState(getUnreadCount);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);

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
            height: '38px',
            width: 'auto',
            objectFit: 'contain',
          }}
          onError={(e) => {
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
              fontSize: '12px',
              color: '#6b7280',
              fontWeight: '500',
            }}>
              Quotation System
            </div>
          </div>
        )}
      </div>

      {/* Center: Search Bar */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        {isMobile ? (
          <GlobalSearch isMobile={isMobile} />
        ) : (
          <UniversalSearch surface="quotation" />
        )}
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
                badge={whatsNewUnread > 0 ? whatsNewUnread : undefined}
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
                onWhatsNew={() => {
                  setHelpOpen(false);
                  setWhatsNewOpen(true);
                }}
                onShortcuts={() => {
                  setHelpOpen(false);
                  setShortcutsOpen(true);
                }}
                onContact={() => {
                  setHelpOpen(false);
                  setContactOpen(true);
                }}
                onBugReport={() => {
                  setHelpOpen(false);
                  setBugReportOpen(true);
                }}
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

      {/* What's New Panel */}
      <WhatsNewPanel
        isOpen={whatsNewOpen}
        onClose={() => {
          setWhatsNewOpen(false);
          setWhatsNewUnread(getUnreadCount());
        }}
      />

      {/* Help Modals */}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ContactSupportModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
      <ReportBugModal isOpen={bugReportOpen} onClose={() => setBugReportOpen(false)} />
    </header>
  );
};

export default Header;
