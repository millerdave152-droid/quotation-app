import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import MobileTabNavigation from './MobileTabNavigation';
import Sidebar from '../Sidebar';

const MOBILE_BREAKPOINT = 1024;

const MainLayout = ({ children }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: '#f9fafb',
    }}>
      {/* Sticky Header */}
      <Header isMobile={isMobile} />

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
