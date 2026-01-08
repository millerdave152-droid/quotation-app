import React, { useState, useCallback, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const MobileTabNavigation = () => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const location = useLocation();

  // Memoize tab close handler to prevent re-renders
  const closeMoreMenu = useCallback(() => {
    setShowMoreMenu(false);
  }, []);

  const toggleMoreMenu = useCallback(() => {
    setShowMoreMenu(prev => !prev);
  }, []);

  const primaryTabs = [
    { path: '/dashboard', icon: '📈', label: 'Dashboard' },
    { path: '/customers', icon: '👥', label: 'Customers' },
    { path: '/products', icon: '🏷️', label: 'Products' },
    { path: '/quotes', icon: '📋', label: 'Quotes' },
  ];

  const moreTabs = [
    { path: '/analytics', icon: '📊', label: 'Analytics' },
    { path: '/marketplace', icon: '🛒', label: 'Marketplace' },
    { path: '/reports', icon: '📑', label: 'Reports' },
    { path: '/bulk-ops', icon: '⚡', label: 'Bulk Ops' },
    { path: '/features', icon: '🚀', label: '2026 Features' },
  ];

  // Memoize isMoreActive to prevent recalculation on every render
  const isMoreActive = useMemo(() =>
    moreTabs.some(tab => location.pathname.startsWith(tab.path)),
    [location.pathname]
  );

  // Memoize tab style function
  const tabStyle = useCallback((isActive) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '8px 4px',
    textDecoration: 'none',
    color: isActive ? '#667eea' : '#6b7280',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    minHeight: '56px',
    transition: 'color 0.2s ease',
  }), []);

  return (
    <>
      {/* More Menu Modal */}
      {showMoreMenu && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeMoreMenu}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1100,
            }}
          />

          {/* Menu */}
          <div style={{
            position: 'fixed',
            bottom: '72px',
            left: '16px',
            right: '16px',
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
            zIndex: 1101,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: '600',
              color: '#111827',
            }}>
              More Options
            </div>
            <div style={{ padding: '8px' }}>
              {moreTabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  onClick={closeMoreMenu}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    color: isActive ? '#667eea' : '#374151',
                    background: isActive ? '#f0f4ff' : 'transparent',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'all 0.2s ease',
                  })}
                >
                  <span style={{ fontSize: '20px' }}>{tab.icon}</span>
                  <span style={{ fontSize: '15px' }}>{tab.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bottom Tab Bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '72px',
        background: 'white',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 1000,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {primaryTabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => tabStyle(isActive)}
          >
            {({ isActive }) => (
              <>
                <span style={{
                  fontSize: '22px',
                  marginBottom: '4px',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.2s ease',
                }}>
                  {tab.icon}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: isActive ? '600' : '400',
                }}>
                  {tab.label}
                </span>
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    width: '40px',
                    height: '3px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '0 0 3px 3px',
                  }} />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* More Button */}
        <button
          onClick={toggleMoreMenu}
          style={{
            ...tabStyle(isMoreActive || showMoreMenu),
            position: 'relative',
          }}
        >
          <span style={{
            fontSize: '22px',
            marginBottom: '4px',
            transform: showMoreMenu ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
          }}>
            ☰
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: (isMoreActive || showMoreMenu) ? '600' : '400',
          }}>
            More
          </span>
          {(isMoreActive || showMoreMenu) && (
            <div style={{
              position: 'absolute',
              top: 0,
              width: '40px',
              height: '3px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '0 0 3px 3px',
            }} />
          )}
        </button>
      </nav>
    </>
  );
};

export default MobileTabNavigation;
