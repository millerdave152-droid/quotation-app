import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * Responsive Sidebar Navigation Component
 * - Desktop: Always visible sidebar or top navigation
 * - Tablet/Mobile: Hamburger menu with slide-out drawer
 */

const navItems = [
  { path: '/dashboard', icon: '📈', label: 'Dashboard' },
  { path: '/customers', icon: '👥', label: 'Customers' },
  { path: '/products', icon: '🏷️', label: 'Products' },
  { path: '/quotes', icon: '📋', label: 'Quotations' },
  { path: '/analytics', icon: '📊', label: 'Analytics' },
  { path: '/marketplace', icon: '🛒', label: 'Marketplace' },
  { path: '/reports', icon: '📑', label: 'Reports' },
  { path: '/bulk-ops', icon: '⚡', label: 'Bulk Ops' },
  { path: '/features', icon: '🚀', label: '2026 Features', isSpecial: true },
];

const Sidebar = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const location = useLocation();

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsOpen(false); // Reset on desktop
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMobile]);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const navLinkStyle = (isActive, isSpecial = false) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    borderRadius: '10px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minHeight: '48px', // Touch-friendly
    background: isActive
      ? isSpecial
        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      : 'transparent',
    color: isActive ? 'white' : '#4b5563',
    boxShadow: isActive ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile Header with Hamburger */}
      {isMobile && (
        <header style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '64px',
          background: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          zIndex: 1000,
        }}>
          {/* Hamburger Button */}
          <button
            onClick={toggleSidebar}
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
            style={{
              width: '48px',
              height: '48px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '5px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
            }}
          >
            <span style={{
              width: '24px',
              height: '3px',
              background: '#374151',
              borderRadius: '2px',
              transition: 'all 0.3s ease',
              transform: isOpen ? 'rotate(45deg) translateY(8px)' : 'none',
            }} />
            <span style={{
              width: '24px',
              height: '3px',
              background: '#374151',
              borderRadius: '2px',
              transition: 'all 0.3s ease',
              opacity: isOpen ? 0 : 1,
            }} />
            <span style={{
              width: '24px',
              height: '3px',
              background: '#374151',
              borderRadius: '2px',
              transition: 'all 0.3s ease',
              transform: isOpen ? 'rotate(-45deg) translateY(-8px)' : 'none',
            }} />
          </button>

          {/* Logo */}
          <h1 style={{
            margin: '0 0 0 12px',
            fontSize: '18px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Quotation Pro
          </h1>
        </header>
      )}

      {/* Overlay for mobile */}
      {isMobile && isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1001,
            transition: 'opacity 0.3s ease',
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          position: isMobile ? 'fixed' : 'sticky',
          top: isMobile ? 0 : 0,
          left: 0,
          height: '100vh',
          width: '280px',
          background: 'white',
          boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
          transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          transition: 'transform 0.3s ease',
          zIndex: 1002,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Desktop Logo */}
        {!isMobile && (
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <h1 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Customer Quotation
              <br />
              <span style={{ fontSize: '16px' }}>System Pro</span>
            </h1>
          </div>
        )}

        {/* Mobile: Add top padding for header */}
        {isMobile && <div style={{ height: '64px' }} />}

        {/* Navigation Links */}
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => navLinkStyle(isActive, item.isSpecial)}
              >
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e5e7eb',
          fontSize: '12px',
          color: '#9ca3af',
        }}>
          <div>Enterprise Edition</div>
          <div style={{ marginTop: '4px' }}>v2.0.0</div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{
        flex: 1,
        marginTop: isMobile ? '64px' : 0,
        minHeight: isMobile ? 'calc(100vh - 64px)' : '100vh',
        background: '#f9fafb',
      }}>
        {children}
      </main>
    </div>
  );
};

export default Sidebar;
