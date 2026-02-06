import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import MobileTabNavigation from './MobileTabNavigation';
import Sidebar from '../Sidebar';
import { useAuth } from '../../contexts/AuthContext';

const MOBILE_BREAKPOINT = 1024;

const MainLayout = ({ children }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [authExpired, setAuthExpired] = useState(false);
  const [authExpiredMessage, setAuthExpiredMessage] = useState('');
  const authExpiredHandledRef = useRef(false);
  const redirectTimerRef = useRef(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleAuthExpired = (event) => {
      if (authExpiredHandledRef.current) return;
      authExpiredHandledRef.current = true;

      setAuthExpired(true);
      setAuthExpiredMessage('Your session has expired. Please log in again.');

      redirectTimerRef.current = setTimeout(() => {
        logout();
        navigate('/login', { replace: true, state: { reason: 'expired' } });
      }, 1500);
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [logout, navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: '#f9fafb',
    }}>
      {/* Sticky Header */}
      <Header isMobile={isMobile} />

      {authExpired && (
        <div style={{
          background: '#fef2f2',
          borderBottom: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '10px 16px',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ fontWeight: 600 }}>{authExpiredMessage}</div>
          <button
            onClick={() => {
              if (redirectTimerRef.current) {
                clearTimeout(redirectTimerRef.current);
              }
              logout();
              navigate('/login', { replace: true, state: { reason: 'expired' } });
            }}
            style={{
              padding: '6px 10px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Log In Again
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{
        display: 'flex',
        flex: 1,
      }}>
        {/* Desktop Sidebar */}
        {!isMobile && (
          <Sidebar isLayoutMode={true} />
        )}

        {/* Page Content */}
        <main style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          paddingBottom: isMobile ? '80px' : '0', // Space for mobile nav
        }}>
          {children || <Outlet />}
        </main>
      </div>

      {/* Footer - Only show on desktop or when scrolled to bottom on mobile */}
      {!isMobile && <Footer />}

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileTabNavigation />}
    </div>
  );
};

export default MainLayout;
