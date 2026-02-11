/**
 * TeleTime POS - Main Application
 * Routes and authentication flow
 */

import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useRegister } from './context/RegisterContext';

// Critical pages loaded immediately
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Lazy-loaded pages for code-splitting (reduces initial bundle size)
const POSMain = lazy(() => import('./pages/POSMain'));
const Reports = lazy(() => import('./pages/Reports'));
const OverrideAuditReport = lazy(() => import('./pages/OverrideAuditReport'));
const AdminFinancingPage = lazy(() => import('./pages/AdminFinancingPage'));
const CustomerFinancingPage = lazy(() => import('./pages/CustomerFinancingPage'));
const MyCommissionsPage = lazy(() => import('./pages/MyCommissionsPage'));
const TeamCommissionsPage = lazy(() => import('./pages/TeamCommissionsPage'));
const ReturnInitiation = lazy(() => import('./pages/ReturnInitiation'));
const TransactionsPage = lazy(() => import('./pages/Transactions'));

// Lazy-loaded report components
const ShiftReportPage = lazy(() =>
  import('./components/Reports').then(mod => ({ default: mod.ShiftReportPage }))
);

// Lazy-loaded admin components
const ApprovalRulesPage = lazy(() =>
  import('./components/Admin').then(mod => ({ default: mod.ApprovalRulesPage }))
);

// Register Management Components (needed for shift flow, loaded eagerly)
import {
  RegisterSelect,
  OpenRegister,
  CloseRegister,
  PrintableShiftReport,
} from './components/Register';

// Notifications
import { ExpiringQuotesToast } from './components/Notifications';

// ============================================================================
// ENVIRONMENT BADGE
// ============================================================================

/**
 * Development mode badge
 */
function DevBadge() {
  const isDev = import.meta.env.DEV;
  const mode = import.meta.env.MODE;

  if (!isDev) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] pointer-events-none">
      <div className="bg-yellow-500 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold uppercase shadow-lg">
        {mode === 'development' ? 'DEV' : mode.toUpperCase()}
      </div>
    </div>
  );
}

// ============================================================================
// LOADING SPINNER
// ============================================================================

function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-800">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">{message}</p>
      </div>
    </div>
  );
}

// ============================================================================
// ROUTE GUARDS
// ============================================================================

/**
 * Protected Route - requires authentication
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Manager Route - requires manager or admin role
 */
function ManagerRoute({ children }) {
  const { isAuthenticated, loading, isAdminOrManager } = useAuth();

  if (loading) {
    return <LoadingScreen message="Checking permissions..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminOrManager()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * Shift Required - requires active shift
 */
function ShiftRequired({ children }) {
  const { hasActiveShift, loading, isInitialized } = useRegister();

  if (loading || !isInitialized) {
    return <LoadingScreen message="Loading register..." />;
  }

  if (!hasActiveShift) {
    return <Navigate to="/open-shift" replace />;
  }

  return children;
}

/**
 * Guest Route - redirects authenticated users to home
 */
function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// ============================================================================
// OPEN SHIFT FLOW
// ============================================================================

/**
 * Open Shift Page - handles register selection and opening
 */
function OpenShiftPage() {
  const navigate = useNavigate();
  const { hasActiveShift, selectedRegister, selectRegister } = useRegister();
  const [step, setStep] = useState('select'); // 'select' | 'open'

  // If already has active shift, redirect to main
  if (hasActiveShift) {
    return <Navigate to="/" replace />;
  }

  // Handle register selection
  const handleSelectRegister = (register) => {
    selectRegister(register);
    setStep('open');
  };

  // Handle back from open register
  const handleBack = () => {
    setStep('select');
  };

  // Handle shift opened successfully
  const handleShiftOpened = () => {
    navigate('/', { replace: true });
  };

  // Show register selection
  if (step === 'select' || !selectedRegister) {
    return <RegisterSelect onSelectRegister={handleSelectRegister} />;
  }

  // Show open register form
  return (
    <OpenRegister
      register={selectedRegister}
      onBack={handleBack}
      onComplete={handleShiftOpened}
    />
  );
}

// ============================================================================
// CLOSE SHIFT FLOW
// ============================================================================

/**
 * Close Shift Page - handles closing register
 */
function CloseShiftPage() {
  const navigate = useNavigate();
  const { hasActiveShift, currentShift, shiftSummary, getExpectedCash } = useRegister();
  const [showReport, setShowReport] = useState(false);
  const [closingData, setClosingData] = useState(null);

  // If no active shift, redirect to open shift
  if (!hasActiveShift) {
    return <Navigate to="/open-shift" replace />;
  }

  // Handle back to main register
  const handleBack = () => {
    navigate('/', { replace: true });
  };

  // Handle shift closed successfully
  const handleComplete = (data) => {
    setClosingData(data);
  };

  // Handle print report
  const handlePrintReport = (data) => {
    setClosingData(data);
    setShowReport(true);
  };

  // Calculate variance for report
  const expectedCash = getExpectedCash();
  const variance = closingData?.closingCash
    ? closingData.closingCash - expectedCash
    : 0;

  return (
    <>
      <CloseRegister
        onBack={handleBack}
        onComplete={handleComplete}
        onPrintReport={handlePrintReport}
      />

      {/* Shift Report Modal */}
      {showReport && (
        <PrintableShiftReport
          shift={currentShift}
          summary={shiftSummary?.summary}
          closingCash={closingData?.closingCash}
          variance={variance}
          onClose={() => {
            setShowReport(false);
            navigate('/open-shift', { replace: true });
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* DEV Badge */}
      <DevBadge />

      {/* Expiring Quotes Toast - Shows on page load for authenticated users */}
      {isAuthenticated && (
        <ExpiringQuotesToast
          salesRepId={user?.id}
          showOnLoad={true}
          onViewQuotes={(filter) => {
            window.location.href = `/quotes?filter=expiring&view=${filter}`;
          }}
        />
      )}

      <Suspense fallback={<LoadingScreen message="Loading page..." />}>
      <Routes>
        {/* ============================================ */}
        {/* PUBLIC ROUTES */}
        {/* ============================================ */}

        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />

        {/* ============================================ */}
        {/* PROTECTED ROUTES - Require Authentication */}
        {/* ============================================ */}

        {/* Register Selection / Opening */}
        <Route
          path="/open-shift"
          element={
            <ProtectedRoute>
              <OpenShiftPage />
            </ProtectedRoute>
          }
        />

        {/* Register Closing */}
        <Route
          path="/close-shift"
          element={
            <ProtectedRoute>
              <CloseShiftPage />
            </ProtectedRoute>
          }
        />

        {/* Legacy route for backward compatibility */}
        <Route
          path="/close-register"
          element={<Navigate to="/close-shift" replace />}
        />
        <Route
          path="/shift-close"
          element={<Navigate to="/close-shift" replace />}
        />

        {/* ============================================ */}
        {/* MANAGER ROUTES - Require Manager/Admin Role */}
        {/* ============================================ */}

        <Route
          path="/reports"
          element={
            <ManagerRoute>
              <Reports />
            </ManagerRoute>
          }
        />

        <Route
          path="/reports/overrides"
          element={
            <ManagerRoute>
              <OverrideAuditReport />
            </ManagerRoute>
          }
        />

        <Route
          path="/reports/shift"
          element={
            <ManagerRoute>
              <ShiftReportPage onBack={() => window.history.back()} />
            </ManagerRoute>
          }
        />

        <Route
          path="/transactions"
          element={
            <ManagerRoute>
              <TransactionsPage />
            </ManagerRoute>
          }
        />

        {/* ============================================ */}
        {/* ADMIN SETTINGS - Require Manager/Admin Role */}
        {/* ============================================ */}

        <Route
          path="/admin/approval-rules"
          element={
            <ManagerRoute>
              <ApprovalRulesPage />
            </ManagerRoute>
          }
        />

        <Route
          path="/admin/financing"
          element={
            <ManagerRoute>
              <AdminFinancingPage />
            </ManagerRoute>
          }
        />

        {/* ============================================ */}
        {/* COMMISSION PAGES */}
        {/* ============================================ */}

        {/* My Commissions - Any authenticated user */}
        <Route
          path="/commissions/my"
          element={
            <ProtectedRoute>
              <MyCommissionsPage />
            </ProtectedRoute>
          }
        />

        {/* Team Commissions - Manager only */}
        <Route
          path="/commissions/team"
          element={
            <ManagerRoute>
              <TeamCommissionsPage />
            </ManagerRoute>
          }
        />

        {/* ============================================ */}
        {/* CUSTOMER PAGES */}
        {/* ============================================ */}

        <Route
          path="/customer/:customerId/financing"
          element={
            <ProtectedRoute>
              <CustomerFinancingPage />
            </ProtectedRoute>
          }
        />

        {/* ============================================ */}
        {/* RETURNS */}
        {/* ============================================ */}

        <Route
          path="/returns"
          element={
            <ProtectedRoute>
              <ShiftRequired>
                <ReturnInitiation />
              </ShiftRequired>
            </ProtectedRoute>
          }
        />

        {/* ============================================ */}
        {/* MAIN POS - Requires Active Shift */}
        {/* ============================================ */}

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ShiftRequired>
                <POSMain />
              </ShiftRequired>
            </ProtectedRoute>
          }
        />

        {/* ============================================ */}
        {/* 404 - NOT FOUND */}
        {/* ============================================ */}

        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </div>
  );
}

export default App;
