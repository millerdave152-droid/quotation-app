import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../services/authFetch';
import {
  LayoutDashboard,
  Users,
  Package,
  Image,
  FileText,
  Receipt,
  Warehouse,
  DollarSign,
  BarChart3,
  Brain,
  GraduationCap,
  ShoppingCart,
  ClipboardList,
  Zap,
  Rocket,
  UserCog,
  Wrench,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Settings,
  TrendingUp,
  FileBarChart,
  PieChart,
  Tag,
  ClipboardCheck,
  Truck,
  Shield,
  Database,
  Activity
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Navigation items with Lucide icons
const navItems = {
  dashboard: { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  customers: { path: '/customers', icon: Users, label: 'Customers' },
  leads: { path: '/leads', icon: ClipboardCheck, label: 'Leads' },
  products: { path: '/products', icon: Package, label: 'Products' },
  'product-visualization': { path: '/product-visualization', icon: Image, label: 'Product Gallery' },
  quotes: { path: '/quotes', icon: FileText, label: 'Quotations', hasBadge: true },
  'sales-performance': { path: '/sales-performance', icon: TrendingUp, label: 'Sales Performance' },
  invoices: { path: '/invoices', icon: Receipt, label: 'Invoices' },
  inventory: { path: '/inventory', icon: Warehouse, label: 'Inventory' },
  pricing: { path: '/pricing', icon: DollarSign, label: 'Pricing Rules' },
  'manufacturer-promotions': { path: '/manufacturer-promotions', icon: Tag, label: 'Mfr Promotions' },
  insights: { path: '/insights', icon: BarChart3, label: 'Insights' },
  'purchasing-intelligence': { path: '/purchasing-intelligence', icon: Brain, label: 'Purchasing AI' },
  'report-builder': { path: '/report-builder', icon: FileBarChart, label: 'Report Builder' },
  'executive-dashboard': { path: '/executive-dashboard', icon: PieChart, label: 'Executive Dashboard' },
  'training-center': { path: '/training-center', icon: GraduationCap, label: 'Training Center' },
  marketplace: { path: '/marketplace', icon: ShoppingCart, label: 'Marketplace' },
  reports: { path: '/reports', icon: ClipboardList, label: 'Reports' },
  'bulk-ops': { path: '/bulk-ops', icon: Zap, label: 'Bulk Ops' },
  features: { path: '/features', icon: Rocket, label: '2026 Features', isSpecial: true },
  'admin-deliveries': { path: '/admin/deliveries', icon: Truck, label: 'Delivery Management', isAdmin: true },
  'admin-users': { path: '/admin/users', icon: UserCog, label: 'User Management', isAdmin: true },
  'admin-nomenclature': { path: '/admin/nomenclature', icon: Wrench, label: 'Nomenclature Admin', isAdmin: true },
  'admin-fraud': { path: '/admin/fraud', icon: Shield, label: 'Fraud & Audit', isAdmin: true },
  'admin-monitoring': { path: '/admin/monitoring', icon: Activity, label: 'Monitoring', isAdmin: true },
  'admin-data-import': { path: '/admin/data-import', icon: Database, label: 'Data Import', isAdmin: true },
};

// Section configuration
const navSections = [
  {
    id: 'analytics',
    title: 'Analytics',
    icon: BarChart3,
    items: ['dashboard', 'insights', 'purchasing-intelligence', 'report-builder', 'executive-dashboard']
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: Users,
    items: ['customers', 'leads', 'quotes', 'sales-performance', 'invoices']
  },
  {
    id: 'inventory',
    title: 'Inventory',
    icon: Package,
    items: ['products', 'product-visualization', 'inventory', 'pricing', 'manufacturer-promotions']
  },
  {
    id: 'operations',
    title: 'Operations',
    icon: Settings,
    items: ['marketplace', 'bulk-ops', 'reports', 'training-center', 'features']
  }
];

const adminSection = {
  id: 'admin',
  title: 'Admin',
  icon: UserCog,
  items: ['admin-deliveries', 'admin-users', 'admin-nomenclature', 'admin-fraud', 'admin-monitoring', 'admin-data-import']
};

/**
 * 10x Sidebar Navigation Component
 * Features: Lucide icons, collapsible sections, smooth animations
 */
const Sidebar = ({ children, isLayoutMode = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [expandedSections, setExpandedSections] = useState(() => {
    // Load from localStorage or default all expanded
    const saved = localStorage.getItem('sidebar_sections');
    return saved ? JSON.parse(saved) : { analytics: true, sales: true, inventory: true, operations: true, admin: true };
  });
  const location = useLocation();
  const { isAdmin, canApproveQuotes } = useAuth();

  // Save expanded sections to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar_sections', JSON.stringify(expandedSections));
  }, [expandedSections]);

  // Fetch pending approvals count
  const fetchPendingApprovals = useCallback(async () => {
    if (!canApproveQuotes) return;
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      const response = await authFetch(`${API_URL}/api/counter-offers/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setPendingApprovalsCount(data.data?.counterOffers?.length || 0);
      }
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
    }
  }, [canApproveQuotes]);

  useEffect(() => {
    fetchPendingApprovals();
    const interval = setInterval(fetchPendingApprovals, 60000);
    return () => clearInterval(interval);
  }, [fetchPendingApprovals]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) setIsOpen(false);
  }, [location.pathname, isMobile]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setIsOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    document.body.style.overflow = isOpen && isMobile ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, isMobile]);

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // Build sections list based on role
  const sections = useMemo(() => {
    const result = [...navSections];
    if (isAdmin) result.push(adminSection);
    return result;
  }, [isAdmin]);

  // Styles
  const styles = {
    navLink: (isActive, isSpecial = false) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      marginLeft: '12px',
      borderRadius: '8px',
      textDecoration: 'none',
      fontSize: '14px',
      fontWeight: isActive ? '600' : '500',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      background: isActive
        ? isSpecial
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        : 'transparent',
      color: isActive ? 'white' : '#4b5563',
      boxShadow: isActive
        ? '0 4px 15px rgba(102, 126, 234, 0.35), inset 0 1px 0 rgba(255,255,255,0.15)'
        : 'none',
      transform: isActive ? 'translateX(4px)' : 'translateX(0)',
      borderLeft: isActive ? 'none' : '3px solid transparent',
    }),
    navLinkHover: {
      background: 'rgba(102, 126, 234, 0.08)',
      transform: 'translateX(4px)',
    },
    sectionHeader: (isExpanded) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 16px',
      cursor: 'pointer',
      userSelect: 'none',
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#9ca3af',
      transition: 'all 0.2s ease',
      borderRadius: '6px',
      margin: '4px 8px',
    }),
    sectionContent: (isExpanded) => ({
      overflow: 'hidden',
      maxHeight: isExpanded ? '500px' : '0',
      opacity: isExpanded ? 1 : 0,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }),
    badge: {
      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      color: 'white',
      fontSize: '10px',
      fontWeight: 'bold',
      padding: '2px 6px',
      borderRadius: '6px',
      minWidth: '18px',
      textAlign: 'center',
      boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
      animation: 'pulse 2s infinite',
    },
    icon: (isActive) => ({
      width: '18px',
      height: '18px',
      strokeWidth: 2,
      flexShrink: 0,
      transition: 'transform 0.2s ease',
    }),
  };

  // Render nav item
  const renderNavItem = (itemKey) => {
    const item = navItems[itemKey];
    if (!item) return null;
    const Icon = item.icon;

    return (
      <li key={item.path} role="none">
        <NavLink
          to={item.path}
          role="menuitem"
          aria-label={item.hasBadge && canApproveQuotes && pendingApprovalsCount > 0
            ? `${item.label}, ${pendingApprovalsCount} pending approvals`
            : item.label}
          style={({ isActive }) => styles.navLink(isActive, item.isSpecial)}
          onMouseEnter={(e) => {
            if (!e.currentTarget.classList.contains('active')) {
              Object.assign(e.currentTarget.style, styles.navLinkHover);
            }
          }}
          onMouseLeave={(e) => {
            const isActive = location.pathname === item.path;
            if (!isActive) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.transform = 'translateX(0)';
            }
          }}
        >
          <Icon style={styles.icon(location.pathname === item.path)} />
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.hasBadge && canApproveQuotes && pendingApprovalsCount > 0 && (
            <span style={styles.badge}>{pendingApprovalsCount}</span>
          )}
        </NavLink>
      </li>
    );
  };

  // Render section
  const renderSection = (section) => {
    const isExpanded = expandedSections[section.id];
    const SectionIcon = section.icon;

    return (
      <div key={section.id} style={{ marginBottom: '8px' }}>
        <div
          style={styles.sectionHeader(isExpanded)}
          onClick={() => toggleSection(section.id)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(156, 163, 175, 0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          role="button"
          aria-expanded={isExpanded}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection(section.id); }}
        >
          <SectionIcon style={{ width: '14px', height: '14px', strokeWidth: 2.5 }} />
          <span style={{ flex: 1 }}>{section.title}</span>
          {isExpanded ? (
            <ChevronDown style={{ width: '14px', height: '14px', transition: 'transform 0.2s' }} />
          ) : (
            <ChevronRight style={{ width: '14px', height: '14px', transition: 'transform 0.2s' }} />
          )}
        </div>
        <div style={styles.sectionContent(isExpanded)}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="menu">
            {section.items.map(renderNavItem)}
          </ul>
        </div>
      </div>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <>
      {/* Navigation Sections */}
      <nav aria-label="Primary navigation" style={{ padding: '12px 4px', flex: 1, overflowY: 'auto' }}>
        {sections.map(renderSection)}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid #e5e7eb',
        fontSize: '11px',
        color: '#9ca3af',
        background: 'linear-gradient(to top, rgba(249,250,251,1) 0%, rgba(255,255,255,0) 100%)',
      }}>
        <div style={{ fontWeight: '600' }}>TeleTime Solutions</div>
        <div style={{ marginTop: '2px', opacity: 0.7 }}>Enterprise v2.0.0</div>
      </div>
    </>
  );

  // Layout Mode: Render only the sidebar panel
  if (isLayoutMode) {
    return (
      <aside
        role="navigation"
        aria-label="Main navigation"
        style={{
          position: 'sticky',
          top: '64px',
          height: 'calc(100vh - 64px)',
          width: '260px',
          background: 'white',
          boxShadow: '2px 0 12px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          borderRight: '1px solid #f3f4f6',
        }}
      >
        {sidebarContent}
      </aside>
    );
  }

  // Legacy Mode: Full wrapper with mobile support
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile Header */}
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
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
            style={{
              width: '44px',
              height: '44px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '8px',
              transition: 'background 0.2s',
            }}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 style={{
            margin: '0 0 0 12px',
            fontSize: '18px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            TeleTime Solutions
          </h1>
        </header>
      )}

      {/* Mobile Overlay */}
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
        role="navigation"
        aria-label="Main navigation"
        aria-hidden={isMobile && !isOpen}
        style={{
          position: isMobile ? 'fixed' : 'sticky',
          top: isMobile ? 0 : 0,
          left: 0,
          height: '100vh',
          width: '260px',
          background: 'white',
          boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
          transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 1002,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Desktop Logo */}
        {!isMobile && (
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #f3f4f6',
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
          }}>
            <h1 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              TeleTime Solutions
            </h1>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              Quotation Management
            </div>
          </div>
        )}

        {/* Mobile spacer */}
        {isMobile && <div style={{ height: '64px' }} />}

        {sidebarContent}
      </aside>

      {/* Main Content */}
      <main
        role="main"
        aria-label="Main content"
        style={{
          flex: 1,
          marginTop: isMobile ? '64px' : 0,
          minHeight: isMobile ? 'calc(100vh - 64px)' : '100vh',
          background: '#f9fafb',
        }}
      >
        {children}
      </main>

      {/* Pulse animation for badge */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default Sidebar;
