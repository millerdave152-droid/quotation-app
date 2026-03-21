/**
 * TeleTime POS - Main Layout
 * Full POS interface with product browsing, cart, and checkout
 */

import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// Context hooks
import { useAuth } from '../context/AuthContext';
import { useRegister } from '../context/RegisterContext';
import { useCart } from '../hooks/useCart';

// Components
import { ProductSearch } from '../components/Products/ProductSearch';
import { ProductGrid } from '../components/Products/ProductGrid';
import { CategoryBar } from '../components/Products/CategoryBar';
import { BarcodeScanner } from '../components/Products/BarcodeScanner';
import { Cart } from '../components/Cart/Cart';
import { QuickAddFavorites } from '../components/Cart/QuickAddFavorites';
import { QuoteConversionBanner } from '../components/Quotes/QuoteConversionBanner';
import { EscalationToastContainer } from '../components/Discount/EscalationToast';
import { NotificationBell } from '../components/Notifications';

// Hooks
import { useEscalationPolling } from '../hooks/useEscalationPolling';
import { useApprovalFlow } from '../hooks/useApprovalFlow';
import { useBatchApprovalFlow } from '../hooks/useBatchApprovalFlow';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { useManagerPinCache } from '../hooks/useManagerPinCache';

// Components
import { ConnectionBanner } from '../components/ConnectionBanner';
import { ConnectionStatusDot } from '../components/ConnectionStatusDot';
import { PendingSyncBadge } from '../components/PendingSyncBadge';

// Hooks
import { useOfflineTransaction } from '../hooks/useOfflineTransaction';

// Offline queue
import { addOfflineApproval, syncToServer } from '../store/offlineApprovalQueue';

// API
import { getMyTier, initializeBudget } from '../api/discountAuthority';
import api from '../api/axios';

// Utils
import { formatCurrency } from '../utils/formatters';
import { Banknote, BarChart3, BellRing, Box, CircleUser, ClipboardList, Clock, DollarSign, FileText, Lock, LogIn, Menu, Pause, Settings, ShieldCheck, ShoppingCart, Table, Tag, Undo2, User, Users, X } from 'lucide-react';

const VariantPicker = lazy(() =>
  import('../components/Products/VariantPicker').then((module) => ({ default: module.VariantPicker }))
);
const CustomerLookup = lazy(() =>
  import('../components/Customer/CustomerLookup').then((module) => ({ default: module.CustomerLookup }))
);
const QuoteLookup = lazy(() =>
  import('../components/Quotes/QuoteLookup').then((module) => ({ default: module.QuoteLookup }))
);
const CheckoutModal = lazy(() =>
  import('../components/Checkout/CheckoutModal').then((module) => ({ default: module.CheckoutModal }))
);
const PriceOverrideModal = lazy(() =>
  import('../components/Pricing/PriceOverrideModal').then((module) => ({ default: module.PriceOverrideModal }))
);
const ShiftSummaryPanel = lazy(() =>
  import('../components/Register/ShiftSummary').then((module) => ({ default: module.ShiftSummaryPanel }))
);
const ShiftCommissionSummary = lazy(() => import('../components/Commission/ShiftCommissionSummary'));
const ManagerApprovalQueue = lazy(() =>
  import('../components/Discount/ManagerApprovalQueue').then((module) => ({ default: module.ManagerApprovalQueue }))
);
const DiscountEscalationModal = lazy(() =>
  import('../components/Discount/DiscountEscalationModal').then((module) => ({ default: module.DiscountEscalationModal }))
);
const ChangePasswordModal = lazy(() =>
  import('../components/Account/ChangePasswordModal').then((module) => ({ default: module.ChangePasswordModal }))
);
const NotificationPreferences = lazy(() =>
  import('../components/Account/NotificationPreferences').then((module) => ({ default: module.NotificationPreferences }))
);
const ManagerSelectionModal = lazy(() => import('../components/approvals/ManagerSelectionModal'));
const ApprovalStatusOverlay = lazy(() => import('../components/approvals/ApprovalStatusOverlay'));
const BatchManagerSelectionModal = lazy(() => import('../components/approvals/BatchManagerSelectionModal'));
const BatchApprovalStatusOverlay = lazy(() => import('../components/approvals/BatchApprovalStatusOverlay'));
const DelegationModal = lazy(() => import('../components/approvals/DelegationModal'));

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

function QuickAction({ icon: Icon, label, shortcut, onClick, disabled, variant = 'default' }) {
  const variants = {
    default: 'bg-slate-700 hover:bg-slate-600 text-white',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2
        h-12 px-4
        font-medium text-sm
        rounded-lg
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
      `}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
      {shortcut && (
        <kbd className="ml-1 px-1.5 py-0.5 bg-black/20 rounded text-xs font-mono">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function QuickActionsBar({
  onQuoteLookup,
  onCustomerLookup,
  onHold,
  onPriceCheck,
  onReturns,
  onDiscountApprovals,
  isEmpty,
  isManager,
}) {
  return (
    <div className="flex items-center gap-2 p-3 bg-slate-800 border-t border-slate-700">
      <QuickAction
        icon={FileText}
        label="Quote"
        shortcut="F5"
        onClick={onQuoteLookup}
      />
      <QuickAction
        icon={User}
        label="Customer"
        shortcut="F4"
        onClick={onCustomerLookup}
      />
      <QuickAction
        icon={Undo2}
        label="Returns"
        shortcut="F6"
        onClick={onReturns}
      />
      <QuickAction
        icon={Pause}
        label="Hold"
        shortcut="F7"
        onClick={onHold}
        disabled={isEmpty}
        variant="warning"
      />
      <QuickAction
        icon={Tag}
        label="Price Check"
        shortcut="F8"
        onClick={onPriceCheck}
      />
      {isManager && (
        <QuickAction
          icon={ShieldCheck}
          label="Discount Approvals"
          onClick={onDiscountApprovals}
        />
      )}
    </div>
  );
}

// ============================================================================
// HEADER
// ============================================================================

function Header({
  onMenuClick,
  onShiftSummaryClick,
  onCloseShift,
  onDiscountApprovals,
  onDelegateAuthority,
  onChangePassword,
  onNotificationSettings,
  badgeCount,
  badgeIsManager,
  connectionStatus,
  offlinePendingCount,
  offlineSyncing,
}) {
  const navigate = useNavigate();
  const { user, logout, isAdminOrManager } = useAuth();
  const { currentShift, shiftSummary, hasActiveShift } = useRegister();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCommissionSummary, setShowCommissionSummary] = useState(false);
  const isManager = isAdminOrManager();

  const userName = user?.name || user?.username || 'Staff';
  const registerName = currentShift?.registerName || currentShift?.register_name || 'Register';

  // Get shift duration
  const getShiftDuration = () => {
    const openedAt = currentShift?.openedAt || currentShift?.opened_at;
    if (!openedAt) return '0:00';
    const start = new Date(openedAt);
    const now = new Date();
    const diff = now - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  const summary = shiftSummary?.summary || {};

  return (
    <header className="bg-slate-800 text-white">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left - Logo and Menu */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden w-10 h-10 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3">
            <img
              src={new URL('../assets/logos/teletime-logo-white-200.png', import.meta.url).href}
              alt="Teletime"
              className="h-8 w-auto"
            />
            <div className="hidden md:block">
              <p className="text-xs text-slate-400">{registerName}</p>
            </div>
          </div>
        </div>

        {/* Center - Shift Summary */}
        {hasActiveShift && (
          <div className="hidden md:flex items-center gap-6">
            <button
              type="button"
              onClick={onShiftSummaryClick}
              className="flex items-center gap-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <div className="text-left">
                  <p className="text-sm font-semibold">
                    {summary.transactionCount || 0} sales
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatCurrency(summary.totalSales || 0)}
                  </p>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-600" />

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-300">{getShiftDuration()}</span>
              </div>
            </button>
          </div>
        )}

        {/* Right - Connection + Sync + Badge + User Menu */}
        <div className="flex items-center gap-2">
          {/* Connection Status Dot */}
          <ConnectionStatusDot status={connectionStatus} showLabel={false} />

          {/* Pending Offline Sync Badge */}
          <PendingSyncBadge count={offlinePendingCount} isSyncing={offlineSyncing} />

          {/* Pending Approvals Badge */}
          {badgeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (badgeIsManager) {
                  onDiscountApprovals?.();
                }
              }}
              className="relative w-10 h-10 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors"
              title={badgeIsManager ? 'Pending discount approvals' : 'Your pending escalations'}
            >
              <BellRing className="w-5 h-5 text-amber-400" />
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            </button>
          )}

          {/* Notification Bell */}
          <NotificationBell />

          <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <CircleUser className="w-8 h-8 text-slate-400" />
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-slate-400">Cashier</p>
            </div>
          </button>

          {/* User Dropdown Menu */}
          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-semibold text-gray-900">{userName}</p>
                  <p className="text-sm text-gray-500">{registerName}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onCloseShift();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Clock className="w-5 h-5 text-gray-500" />
                  <span>Close Shift</span>
                </button>

                {isManager && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Manager</p>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/transactions'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Table className="w-5 h-5 text-gray-500" />
                      <span>Transactions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/reports'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ClipboardList className="w-5 h-5 text-gray-500" />
                      <span>Reports</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/reports/shift'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Clock className="w-5 h-5 text-gray-500" />
                      <span>Shift Reports</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/reports/overrides'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ShieldCheck className="w-5 h-5 text-gray-500" />
                      <span>Override Audit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/commissions/team'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Users className="w-5 h-5 text-gray-500" />
                      <span>Team Commissions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/admin/approval-rules'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="w-5 h-5 text-gray-500" />
                      <span>Approval Rules</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/admin/financing'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Banknote className="w-5 h-5 text-gray-500" />
                      <span>Financing Admin</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); onDiscountApprovals?.(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Tag className="w-5 h-5 text-gray-500" />
                      <span>Discount Approvals</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); onDelegateAuthority?.(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Users className="w-5 h-5 text-gray-500" />
                      <span>Delegate Authority</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/commissions/my');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  <span>My Commissions</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onNotificationSettings?.();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <BellRing className="w-5 h-5 text-gray-500" />
                  <span>Notification Settings</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onChangePassword?.();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Lock className="w-5 h-5 text-gray-500" />
                  <span>Change Password</span>
                </button>

                <div className="border-t border-gray-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowCommissionSummary(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <ShiftCommissionSummary
          isOpen={showCommissionSummary}
          onClose={() => {
            setShowCommissionSummary(false);
            logout();
          }}
        />
      </Suspense>
    </header>
  );
}

// ============================================================================
// MOBILE VIEW TOGGLE
// ============================================================================

function MobileViewToggle({ view, onViewChange, cartItemCount }) {
  return (
    <div className="lg:hidden flex bg-slate-800 border-t border-slate-700">
      <button
        type="button"
        onClick={() => onViewChange('products')}
        className={`
          flex-1 flex items-center justify-center gap-2 py-3
          font-medium text-sm transition-colors
          ${view === 'products'
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-700'
          }
        `}
      >
        <Box className="w-5 h-5" />
        Products
      </button>
      <button
        type="button"
        onClick={() => onViewChange('cart')}
        className={`
          flex-1 flex items-center justify-center gap-2 py-3
          font-medium text-sm transition-colors relative
          ${view === 'cart'
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-700'
          }
        `}
      >
        <ShoppingCart className="w-5 h-5" />
        Cart
        {cartItemCount > 0 && (
          <span className="absolute top-2 right-1/4 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
            {cartItemCount}
          </span>
        )}
      </button>
    </div>
  );
}

// ============================================================================
// PRICE CHECK MODAL
// ============================================================================

function PriceCheckModal({ isOpen, onClose }) {
  const [product, setProduct] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setProduct(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleProductSelect = (selectedProduct) => {
    setProduct(selectedProduct);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Price Check</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <ProductSearch
          onSelect={handleProductSelect}
          placeholder="Scan or search product..."
          className="mb-6"
        />

        {product && (
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="font-semibold text-gray-900 mb-1">
              {product.name || product.productName}
            </p>
            <p className="text-sm text-gray-500 mb-3">
              SKU: {product.sku || product.productSku}
            </p>
            <p className="text-3xl font-bold text-blue-600">
              {formatCurrency(product.price || product.unitPrice)}
            </p>
            {(product.stockQty !== undefined || product.stock_qty !== undefined) && (
              <p className={`mt-2 text-sm ${(product.stockQty || product.stock_qty) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(product.stockQty || product.stock_qty) > 0
                  ? `${product.stockQty || product.stock_qty} in stock`
                  : 'Out of stock'
                }
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// OFFLINE PIN MODAL
// ============================================================================

function OfflinePinModal({ onClose, onSubmitPin, error, productName, requestedPrice }) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!pin || pin.length < 4) return;
    setSubmitting(true);
    await onSubmitPin(pin);
    setSubmitting(false);
    // If successful, the flow moves to 'approved' and this modal unmounts
    // If error, it stays open with the error message
  };

  const handleKeyPress = (digit) => {
    if (pin.length < 8) setPin((p) => p + digit);
  };

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Offline PIN Override</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Offline indicator */}
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-xs text-red-700 font-medium">Server unreachable — using offline PIN verification</p>
        </div>

        {/* Product info */}
        {productName && (
          <div className="mb-4 text-center">
            <p className="text-sm text-gray-600">{productName}</p>
            {requestedPrice != null && (
              <p className="text-lg font-bold text-blue-600">{formatCurrency(requestedPrice)}</p>
            )}
          </div>
        )}

        {/* PIN display */}
        <div className="mb-4 text-center">
          <p className="text-sm text-gray-500 mb-2">Enter Manager PIN</p>
          <div className="flex justify-center gap-2">
            {[...Array(Math.max(pin.length, 4))].map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < pin.length ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mb-3 text-center text-sm text-red-600 font-medium">{error}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleKeyPress(String(d))}
              disabled={submitting}
              className="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg text-lg font-semibold text-gray-900 transition-colors disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            disabled={submitting}
            className="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-600 transition-colors disabled:opacity-50"
          >
            Del
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            disabled={submitting}
            className="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg text-lg font-semibold text-gray-900 transition-colors disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || pin.length < 4}
            className="h-12 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
          >
            {submitting ? '...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN POS LAYOUT
// ============================================================================

export function POSMain() {
  const navigate = useNavigate();
  const { isAdminOrManager } = useAuth();
  const { hasActiveShift, currentShift } = useRegister();
  const cart = useCart();

  // UI State
  const [mobileView, setMobileView] = useState('products'); // 'products' | 'cart'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [specFilters, setSpecFilters] = useState({});
  const [activeUseCase, setActiveUseCase] = useState(null);
  const [useCaseCategoryIds, setUseCaseCategoryIds] = useState(null); // when set, limits visible categories
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Modal State
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [showQuoteLookup, setShowQuoteLookup] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [pickerProduct, setPickerProduct] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [priceOverrideItem, setPriceOverrideItem] = useState(null);
  const [showDiscountApprovals, setShowDiscountApprovals] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showDelegationModal, setShowDelegationModal] = useState(false);

  // Connection status + offline support
  const { status: connectionStatus, isOffline } = useConnectionStatus();
  const { verifyPinOffline } = useManagerPinCache();
  const { pendingCount: offlinePendingCount, isSyncing: offlineSyncing } = useOfflineTransaction();

  // Discount Authority State
  const [discountTier, setDiscountTier] = useState(null);
  const [discountBudget, setDiscountBudget] = useState(null);
  const [escalationItem, setEscalationItem] = useState(null);
  const [escalationDesiredPct, setEscalationDesiredPct] = useState(0);

  // Approval flow (new tier-based system) — pass offline helpers
  const approvalFlow = useApprovalFlow({
    isOffline,
    verifyPinOffline,
    addOfflineApproval,
  });
  const [approvalFlowItem, setApprovalFlowItem] = useState(null);

  // Batch approval flow
  const batchApprovalFlow = useBatchApprovalFlow();

  // Escalation polling (pass isManager so it also fetches manager pending count)
  const isManager = isAdminOrManager();
  const {
    escalations: myEscalations,
    pendingCount: escalationPendingCount,
    managerPendingCount,
    newlyResolved,
    clearResolved,
    refresh: refreshEscalations,
  } = useEscalationPolling(hasActiveShift, isManager);

  // Refs
  const searchInputRef = useRef(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Warn before closing if cart has items
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!cart.isEmpty) {
        e.preventDefault();
        e.returnValue = 'You have items in your cart. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart.isEmpty]);

  // Fetch discount tier and initialize budget on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchTier() {
      try {
        const res = await getMyTier();
        const data = res.data?.data || res.data;
        if (!cancelled && data) {
          setDiscountTier(data.tier || data);
          setDiscountBudget(data.budget || null);
        }
      } catch (err) {
        console.warn('[POSMain] Could not fetch discount tier:', err.message);
      }
      // Initialize budget (idempotent - safe to call each session)
      try {
        await initializeBudget();
        // Re-fetch to get updated budget
        const res2 = await getMyTier();
        const data2 = res2.data?.data || res2.data;
        if (!cancelled && data2) {
          setDiscountBudget(data2.budget || null);
        }
      } catch (err) {
        console.warn('[POSMain] Could not initialize budget:', err.message);
      }
    }
    if (hasActiveShift) fetchTier();
    return () => { cancelled = true; };
  }, [hasActiveShift]);

  // Callback to refresh budget after a discount is applied
  const handleBudgetUpdate = useCallback(async () => {
    try {
      const res = await getMyTier();
      const data = res.data?.data || res.data;
      if (data) setDiscountBudget(data.budget || null);
    } catch (err) {
      console.warn('[POSMain] Budget refresh failed:', err.message);
    }
  }, []);

  // Callback when escalation is requested from DiscountSlider (old flow fallback)
  const handleRequestEscalation = useCallback((item, desiredPct) => {
    setEscalationItem(item);
    setEscalationDesiredPct(desiredPct);
  }, []);

  // New approval flow: request approval for Tier 2+ overrides
  const handleRequestApproval = useCallback((itemData) => {
    setApprovalFlowItem(itemData);
    approvalFlow.startFlow(itemData);
  }, [approvalFlow]);

  // New approval flow: manager selected from ManagerSelectionModal
  const handleManagerSelected = useCallback((managerId) => {
    approvalFlow.submitRequest(managerId);
  }, [approvalFlow]);

  // Batch approval flow: request approval for entire cart
  const handleRequestBatchApproval = useCallback((cartItems) => {
    const items = cartItems.map((item) => ({
      cartItemId: item.id,
      productId: item.productId,
      productName: item.productName || item.name,
      retailPrice: parseFloat(item.basePrice || item.unitPrice || 0),
      requestedPrice: parseFloat(item.overridePrice || item.unitPrice || item.basePrice || 0),
      cost: item.cost != null ? parseFloat(item.cost) : null,
    }));
    batchApprovalFlow.startFlow(items);
  }, [batchApprovalFlow]);

  // Batch approval flow: manager selected
  const handleBatchManagerSelected = useCallback((managerId) => {
    batchApprovalFlow.submitRequest(managerId);
  }, [batchApprovalFlow]);

  // Apply an approved escalation discount to the matching cart item
  const handleApplyApprovedEscalation = useCallback((escalation) => {
    const matchingItem = cart.items.find((item) => Number(item.productId) === Number(escalation.product_id));
    if (matchingItem) {
      cart.applyItemDiscount(matchingItem.id, parseFloat(escalation.requested_discount_pct), escalation.id);
      handleBudgetUpdate();
    } else {
      console.warn('[POSMain] No cart item matches escalation product_id:', escalation.product_id);
    }
  }, [cart, handleBudgetUpdate]);

  // Auto-clear discount on denied or expired escalations
  useEffect(() => {
    if (!newlyResolved || newlyResolved.length === 0) return;
    for (const esc of newlyResolved) {
      if (esc.status === 'denied' || esc.status === 'expired') {
        const matchingItem = cart.items.find((item) => Number(item.productId) === Number(esc.product_id));
        if (matchingItem && matchingItem.discountPercent > 0) {
          cart.applyItemDiscount(matchingItem.id, 0);
        }
      }
    }
  }, [newlyResolved, cart]);

  // Sync offline approvals when connection is restored
  useEffect(() => {
    if (connectionStatus === 'connected') {
      syncToServer().catch((err) => console.warn('[POSMain] Offline sync failed:', err));
    }
  }, [connectionStatus]);

  // Approval flow: apply price when flow completes ('done')
  useEffect(() => {
    if (approvalFlow.flowState !== 'done' || !approvalFlowItem) return;

    const { approvedPrice, approvedByName, approvalRequest, isOfflineApproval, offlineClientRequestId } = approvalFlow;
    const approvalInfo = {
      approvalRequestId: approvalRequest?.id,
      approvedByName: approvedByName || 'Manager',
      ...(isOfflineApproval && { offlineApproval: true }),
      ...(offlineClientRequestId && { clientRequestId: offlineClientRequestId }),
    };

    if (approvalFlowItem.entryPoint === 'discountSlider') {
      // Calculate approved discount % from approved price
      const retailPrice = approvalFlowItem.retailPrice;
      const approvedPct = retailPrice > 0
        ? +((1 - approvedPrice / retailPrice) * 100).toFixed(2)
        : 0;
      cart.applyItemDiscount(approvalFlowItem.itemId, approvedPct, null, approvalInfo);
    } else {
      // Price override entry point
      cart.updateItemPrice(
        approvalFlowItem.itemId,
        approvedPrice,
        approvalFlowItem.reason || 'Manager approved override',
        approvalInfo
      );
    }

    handleBudgetUpdate();
    setApprovalFlowItem(null);
    // approvalFlow.reset() is called after the overlay auto-closes
  }, [approvalFlow.flowState, approvalFlowItem, approvalFlow, cart, handleBudgetUpdate]);

  // Approval flow: reset on terminal states
  useEffect(() => {
    if (['denied', 'cancelled', 'timed_out', 'error'].includes(approvalFlow.flowState)) {
      // Clear the item reference but let the overlay display the result.
      // The overlay's onClose will call approvalFlow.reset().
    }
  }, [approvalFlow.flowState]);

  // Batch approval flow: apply prices when batch completes
  useEffect(() => {
    if (batchApprovalFlow.flowState !== 'done') return;

    const approved = batchApprovalFlow.approvedChildren;
    if (!approved || approved.length === 0) return;

    for (const child of approved) {
      const cartItemId = child.cartItemId || child.cart_item_id;
      if (cartItemId && child.approvedPrice != null) {
        cart.updateItemPrice(
          cartItemId,
          child.approvedPrice,
          'Batch approval override',
          {
            approvalRequestId: child.childId || child.id,
            approvedByName: batchApprovalFlow.approvedByName || 'Manager',
          }
        );
      }
    }

    handleBudgetUpdate();
  }, [batchApprovalFlow.flowState, batchApprovalFlow.approvedChildren, batchApprovalFlow.approvedByName, cart, handleBudgetUpdate]);

  // Handle hold transaction (declared before keyboard shortcuts useEffect that references it)
  const handleHoldTransaction = useCallback(() => {
    const result = cart.holdCart();
    if (result.success) {
      // Show success feedback
    }
  }, [cart]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if typing in an input (except for ESC or function keys)
      const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const isEsc = e.key === 'Escape';
      const isFunctionKey = /^F\d{1,2}$/.test(e.key);

      if (isInput && !isEsc && !isFunctionKey) return;

      switch (e.key) {
        case 'F2':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'F4':
          e.preventDefault();
          setShowCustomerLookup(true);
          break;
        case 'F5':
          e.preventDefault();
          setShowQuoteLookup(true);
          break;
        case 'F6':
          e.preventDefault();
          navigate('/returns');
          break;
        case 'F7':
          e.preventDefault();
          if (!cart.isEmpty) {
            handleHoldTransaction();
          }
          break;
        case 'F8':
          e.preventDefault();
          setShowPriceCheck(true);
          break;
        case 'F9':
          e.preventDefault();
          if (!cart.isEmpty && hasActiveShift) {
            setShowCheckout(true);
          }
          break;
        case 'Escape':
          // Close any open modal
          if (showCheckout) setShowCheckout(false);
          else if (showCustomerLookup) setShowCustomerLookup(false);
          else if (showQuoteLookup) setShowQuoteLookup(false);
          else if (showShiftSummary) setShowShiftSummary(false);
          else if (showPriceCheck) setShowPriceCheck(false);
          else if (priceOverrideItem) setPriceOverrideItem(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.isEmpty, hasActiveShift, navigate, showCheckout, showCustomerLookup, showQuoteLookup, showShiftSummary, showPriceCheck, priceOverrideItem, handleHoldTransaction]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Handle barcode scan
  const handleBarcodeScan = useCallback(async (barcode) => {
    const result = await cart.addItemByBarcode(barcode);
    if (!result.success) {
      // Could show a toast/notification here
      console.warn('[POSMain] Barcode not found:', barcode);
    }
  }, [cart]);

  // Handle product select (from search or grid)
  const handleProductSelect = useCallback((product) => {
    // Parent products open the variant picker instead of adding directly
    if (product.is_parent) {
      setPickerProduct(product);
      setShowPicker(true);
      return;
    }
    cart.addItem(product);
    setSearchQuery('');
    // On mobile, switch to cart view after adding
    if (window.innerWidth < 1024) {
      setMobileView('cart');
    }
  }, [cart]);

  // Category context boost terms (for search enhancement)
  const [categoryBoostTerms, setCategoryBoostTerms] = useState('');
  const categoryBoostRef = useRef('');

  // Handle category change
  const handleCategoryChange = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
    setSearchQuery(''); // Clear search when changing category
    setSpecFilters({}); // Clear spec filters when changing category
    setCategoryBoostTerms('');
    categoryBoostRef.current = '';
  }, []);

  // Fetch category context boost terms when category changes (for search enhancement)
  const categoriesListRef = useRef([]);
  useEffect(() => {
    // Fetch categories list once to resolve id -> slug
    api.get('/categories/main')
      .then(r => { categoriesListRef.current = r.categories || r.data?.categories || []; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryBoostTerms('');
      categoryBoostRef.current = '';
      return;
    }
    // Resolve category ID to slug
    const cat = categoriesListRef.current.find(c => c.id === selectedCategory);
    const slug = cat?.slug;
    if (!slug) return;

    api.get(`/categories/${slug}/context`)
      .then(r => {
        const data = r.data || r;
        const terms = (data.boost_terms || []).slice(0, 5).join(' ');
        setCategoryBoostTerms(terms);
        categoryBoostRef.current = terms;
      })
      .catch(() => {
        setCategoryBoostTerms('');
        categoryBoostRef.current = '';
      });
  }, [selectedCategory]);

  // Handle search — prefix with category context when a category is active
  const handleSearch = useCallback((query) => {
    if (query) {
      // When category is active, don't clear it — use contextual search
      if (categoryBoostRef.current && selectedCategory) {
        setSearchQuery(`${categoryBoostRef.current} ${query}`);
      } else {
        setSearchQuery(query);
        setSelectedCategory(null); // Clear category only when no category context
      }
    } else {
      setSearchQuery('');
    }
  }, [selectedCategory]);

  // Handle use-case (Shop by Room)
  const handleUseCase = useCallback(async (useCase) => {
    if (activeUseCase === useCase) {
      setActiveUseCase(null);
      setUseCaseCategoryIds(null);
      setSelectedCategory(null);
      return;
    }
    setActiveUseCase(useCase);
    try {
      const res = await api.get(`/categories/by-use-case/${useCase}`);
      const depts = res.departments || res.data?.departments || [];
      const catIds = depts.flatMap(d => (d.categories || []).map(c => c.id));
      setUseCaseCategoryIds(catIds);
      // Auto-select first category
      if (catIds.length > 0) {
        setSelectedCategory(catIds[0]);
      }
    } catch {
      // ignore
    }
  }, [activeUseCase]);

  // Handle checkout
  const handleCheckout = useCallback(() => {
    if (cart.isEmpty) return;
    setShowCheckout(true);
  }, [cart.isEmpty]);

  // Handle checkout complete
  const handleCheckoutComplete = useCallback((transaction) => {
    // Cart is cleared by checkout process
    setShowCheckout(false);
  }, []);

  // Handle customer selection
  const handleCustomerSelect = useCallback((customer) => {
    cart.setCustomer(customer);
    setShowCustomerLookup(false);
  }, [cart]);

  // Handle quote load
  const handleLoadQuote = useCallback((quote, customer) => {
    // Load quote items into cart
    cart.loadFromQuote(quote);
    if (customer) {
      cart.setCustomer(customer);
    }
    setShowQuoteLookup(false);
    setShowCustomerLookup(false);
  }, [cart]);

  // Handle clear quote
  const handleClearQuote = useCallback(() => {
    cart.clearCart();
  }, [cart]);

  // Handle close shift
  const handleCloseShift = useCallback(() => {
    if (!cart.isEmpty) {
      if (!window.confirm('You have items in your cart. Close shift anyway?')) {
        return;
      }
    }
    navigate('/close-shift');
  }, [cart.isEmpty, navigate]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Barcode Scanner (hidden listener) */}
      <BarcodeScanner
        onScan={handleBarcodeScan}
        enabled={hasActiveShift && !showCheckout}
        playSound={true}
      />

      {/* Escalation Toast Notifications */}
      <EscalationToastContainer
        newlyResolved={newlyResolved}
        clearResolved={clearResolved}
        onApplyDiscount={handleApplyApprovedEscalation}
      />

      {/* Connection Status Banner */}
      <ConnectionBanner status={connectionStatus} pendingCount={offlinePendingCount} />

      {/* Header */}
      <Header
        onMenuClick={() => setShowMobileMenu(true)}
        onShiftSummaryClick={() => setShowShiftSummary(true)}
        onCloseShift={handleCloseShift}
        onDiscountApprovals={() => setShowDiscountApprovals(true)}
        onDelegateAuthority={() => setShowDelegationModal(true)}
        onChangePassword={() => setShowChangePassword(true)}
        onNotificationSettings={() => setShowNotificationSettings(true)}
        badgeCount={isManager ? managerPendingCount : escalationPendingCount}
        badgeIsManager={isManager}
        connectionStatus={connectionStatus}
        offlinePendingCount={offlinePendingCount}
        offlineSyncing={offlineSyncing}
      />

      {/* Quote Conversion Banner */}
      {cart.quoteId && (
        <QuoteConversionBanner
          quoteId={cart.quoteId}
          quoteNumber={cart.quoteId}
          customerName={cart.customer?.name || cart.customer?.customerName}
          onClearQuote={handleClearQuote}
        />
      )}

      {/* Mobile View Toggle */}
      <MobileViewToggle
        view={mobileView}
        onViewChange={setMobileView}
        cartItemCount={cart.itemCount}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Products Panel (Left - 60%) */}
        <div
          className={`
            flex-1 lg:flex lg:flex-col lg:w-[60%]
            ${mobileView === 'products' ? 'flex flex-col' : 'hidden lg:flex'}
          `}
        >
          {/* Quick Add Favorites */}
          <QuickAddFavorites onAddItem={handleProductSelect} />

          {/* Search and Categories */}
          <div className="p-4 bg-white border-b border-gray-200 space-y-3">
            {/* Shop by Room */}
            <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <span className="text-[11px] font-medium text-gray-500 mr-1 flex-shrink-0">Room:</span>
              {[
                { key: 'kitchen', icon: '\uD83C\uDF73', label: 'Kitchen' },
                { key: 'laundry', icon: '\uD83D\uDEC1', label: 'Laundry' },
                { key: 'living-room', icon: '\uD83C\uDFAC', label: 'Living Room' },
                { key: 'bedroom', icon: '\uD83D\uDECF\uFE0F', label: 'Bedroom' },
                { key: 'outdoor', icon: '\uD83C\uDF3F', label: 'Outdoor' },
                { key: 'air-quality', icon: '\uD83D\uDCA8', label: 'Air Quality' },
              ].map((uc) => (
                <button
                  key={uc.key}
                  onClick={() => handleUseCase(uc.key)}
                  className={`flex-shrink-0 flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                    activeUseCase === uc.key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span>{uc.icon}</span>
                  {uc.label}
                </button>
              ))}
            </div>

            {/* Product Search */}
            <ProductSearch
              ref={searchInputRef}
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={handleSearch}
              onSelect={handleProductSelect}
              placeholder="Search products or scan barcode... (F2)"
            />

            {/* Category Bar */}
            <CategoryBar
              selectedCategory={selectedCategory}
              onSelectCategory={handleCategoryChange}
              onSpecFilter={setSpecFilters}
            />
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto">
            <ProductGrid
              categoryId={selectedCategory}
              searchQuery={searchQuery}
              specFilters={specFilters}
              locationId={currentShift?.location_id || '1'}
              onProductSelect={handleProductSelect}
            />
          </div>
        </div>

        {/* Cart Panel (Right - 40%) */}
        <div
          className={`
            lg:w-[40%] lg:max-w-[480px] lg:flex lg:flex-col
            ${mobileView === 'cart' ? 'flex flex-col w-full' : 'hidden lg:flex'}
          `}
        >
          <Cart
            onCheckout={handleCheckout}
            onCustomerClick={() => setShowCustomerLookup(true)}
            onQuoteClick={() => setShowQuoteLookup(true)}
            onPriceOverride={(item) => setPriceOverrideItem(item)}
            discountTier={discountTier}
            discountBudget={discountBudget}
            onRequestEscalation={handleRequestEscalation}
            onRequestApproval={handleRequestApproval}
            onRequestBatchApproval={handleRequestBatchApproval}
            onBudgetUpdate={handleBudgetUpdate}
            myEscalations={myEscalations}
            escalationPendingCount={escalationPendingCount}
            onApplyApprovedEscalation={handleApplyApprovedEscalation}
            className="flex-1 w-full max-w-none"
          />
        </div>
      </div>

      {/* Quick Actions Bar (Desktop Only) */}
      <div className="hidden lg:block">
        <QuickActionsBar
          onQuoteLookup={() => setShowQuoteLookup(true)}
          onCustomerLookup={() => setShowCustomerLookup(true)}
          onReturns={() => navigate('/returns')}
          onHold={handleHoldTransaction}
          onPriceCheck={() => setShowPriceCheck(true)}
          onDiscountApprovals={() => setShowDiscountApprovals(true)}
          isEmpty={cart.isEmpty}
          isManager={isManager}
        />
      </div>

      {/* ============================================================ */}
      {/* MODALS */}
      {/* ============================================================ */}

      <Suspense fallback={null}>
        {/* Shift Summary Panel */}
        <ShiftSummaryPanel
          isOpen={showShiftSummary}
          onClose={() => setShowShiftSummary(false)}
        />

        {/* Customer Lookup Modal */}
        <CustomerLookup
          isOpen={showCustomerLookup}
          onClose={() => setShowCustomerLookup(false)}
          onSelectCustomer={handleCustomerSelect}
          onLoadQuote={handleLoadQuote}
        />

        {/* Quote Lookup Modal */}
        <QuoteLookup
          isOpen={showQuoteLookup}
          onClose={() => setShowQuoteLookup(false)}
          onLoadQuote={handleLoadQuote}
        />

        {/* Checkout Modal */}
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          onComplete={handleCheckoutComplete}
        />

        {/* Variant Picker */}
        {showPicker && pickerProduct && (
          <VariantPicker
            parentProductId={String(pickerProduct.id)}
            locationId={currentShift?.location_id || '1'}
            onVariantSelected={(variant) => {
              cart.addItem(variant);
              setShowPicker(false);
              setPickerProduct(null);
              setSearchQuery('');
              if (window.innerWidth < 1024) {
                setMobileView('cart');
              }
            }}
            onClose={() => {
              setShowPicker(false);
              setPickerProduct(null);
            }}
          />
        )}
      </Suspense>

      {/* Price Check Modal */}
      <PriceCheckModal
        isOpen={showPriceCheck}
        onClose={() => setShowPriceCheck(false)}
      />

      <Suspense fallback={null}>
        {/* Manager Discount Approval Queue */}
        <ManagerApprovalQueue
          isOpen={showDiscountApprovals}
          onClose={() => setShowDiscountApprovals(false)}
        />

        {/* Discount Escalation Modal */}
        <DiscountEscalationModal
          isOpen={!!escalationItem}
          onClose={() => { setEscalationItem(null); setEscalationDesiredPct(0); refreshEscalations(); }}
          onSubmitted={refreshEscalations}
          item={escalationItem}
          desiredPct={escalationDesiredPct}
          tier={discountTier}
        />

        {/* Manager Selection Modal (new approval flow) */}
        <ManagerSelectionModal
          isOpen={approvalFlow.flowState === 'select_manager'}
          onClose={() => {
            approvalFlow.reset();
            setApprovalFlowItem(null);
          }}
          cartItem={approvalFlowItem ? {
            id: approvalFlowItem.itemId,
            productId: approvalFlowItem.productId,
            productName: approvalFlowItem.productName,
            retailPrice: approvalFlowItem.retailPrice,
            requestedPrice: approvalFlowItem.requestedPrice,
            cost: approvalFlowItem.cost,
          } : null}
          onManagerSelected={handleManagerSelected}
        />
      </Suspense>

      {/* Offline PIN Override Modal */}
      {approvalFlow.flowState === 'pin_offline' && (
        <OfflinePinModal
          onClose={() => {
            approvalFlow.reset();
            setApprovalFlowItem(null);
          }}
          onSubmitPin={approvalFlow.submitOfflinePin}
          error={approvalFlow.error}
          productName={approvalFlowItem?.productName}
          requestedPrice={approvalFlowItem?.requestedPrice}
        />
      )}

      <Suspense fallback={null}>
        {/* Approval Status Overlay (pending/approved/denied/countered - not pin_offline, that has its own modal) */}
        <ApprovalStatusOverlay
          isOpen={['pending', 'approved', 'denied', 'countered', 'consuming', 'done', 'timed_out', 'error'].includes(approvalFlow.flowState) && approvalFlow.flowState !== 'pin_offline'}
          flowState={approvalFlow.flowState}
          approvalRequest={approvalFlow.approvalRequest}
          approvedPrice={approvalFlow.approvedPrice}
          approvedByName={approvalFlow.approvedByName}
          counterOffer={approvalFlow.counterOffer}
          denyReason={approvalFlow.denyReason}
          error={approvalFlow.error}
          onAcceptCounter={approvalFlow.acceptCounter}
          onDeclineCounter={approvalFlow.declineCounter}
          onCancel={approvalFlow.cancel}
          onClose={() => {
            approvalFlow.reset();
            setApprovalFlowItem(null);
          }}
        />

        {/* Batch Manager Selection Modal */}
        <BatchManagerSelectionModal
          isOpen={batchApprovalFlow.flowState === 'select_manager'}
          onClose={() => batchApprovalFlow.reset()}
          batchItems={batchApprovalFlow.batchItems}
          onManagerSelected={handleBatchManagerSelected}
        />

        {/* Batch Approval Status Overlay */}
        <BatchApprovalStatusOverlay
          isOpen={['pending', 'approved', 'denied', 'consuming', 'done', 'timed_out', 'error'].includes(batchApprovalFlow.flowState)}
          flowState={batchApprovalFlow.flowState}
          batchResult={batchApprovalFlow.batchResult}
          approvedChildren={batchApprovalFlow.approvedChildren}
          approvedByName={batchApprovalFlow.approvedByName}
          denyReason={batchApprovalFlow.denyReason}
          error={batchApprovalFlow.error}
          onCancel={batchApprovalFlow.cancel}
          onClose={() => batchApprovalFlow.reset()}
        />

        {/* Delegation Modal */}
        <DelegationModal
          isOpen={showDelegationModal}
          onClose={() => setShowDelegationModal(false)}
        />

        {/* Change Password Modal */}
        <ChangePasswordModal
          isOpen={showChangePassword}
          onClose={() => setShowChangePassword(false)}
        />

        {/* Notification Preferences Modal */}
        <NotificationPreferences
          isOpen={showNotificationSettings}
          onClose={() => setShowNotificationSettings(false)}
        />

        {/* Price Override Modal */}
        <PriceOverrideModal
          isOpen={!!priceOverrideItem}
          onClose={() => setPriceOverrideItem(null)}
          onApply={(overridePrice, reason, approvalInfo) => {
            if (priceOverrideItem) {
              cart.updateItemPrice(priceOverrideItem.id, overridePrice, reason, approvalInfo || {});
            }
            setPriceOverrideItem(null);
          }}
          onRequestApproval={(itemData) => {
            setPriceOverrideItem(null); // close modal
            handleRequestApproval({
              ...itemData,
              itemId: priceOverrideItem?.id,
              entryPoint: 'priceOverride',
            });
          }}
          product={priceOverrideItem || {}}
          originalPrice={priceOverrideItem?.basePrice || priceOverrideItem?.unitPrice || 0}
          customerPrice={priceOverrideItem?.unitPrice || 0}
          customerId={cart.customer?.id || cart.customer?.customerId}
          quantity={priceOverrideItem?.quantity || 1}
        />
      </Suspense>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Menu</h2>
              <button
                type="button"
                onClick={() => setShowMobileMenu(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowShiftSummary(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <BarChart3 className="w-5 h-5" />
                Shift Summary
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowQuoteLookup(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FileText className="w-5 h-5" />
                Find Quote (F5)
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowCustomerLookup(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <User className="w-5 h-5" />
                Find Customer (F4)
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowPriceCheck(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Tag className="w-5 h-5" />
                Price Check (F8)
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  navigate('/returns');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Undo2 className="w-5 h-5" />
                Returns & Exchanges (F6)
              </button>

              {/* My Commissions - all users */}
              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); navigate('/commissions/my'); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <DollarSign className="w-5 h-5" />
                My Commissions
              </button>

              {/* Manager-only section */}
              {isAdminOrManager() && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Manager</p>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/transactions'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Table className="w-5 h-5" />
                    Transactions
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/reports'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ClipboardList className="w-5 h-5" />
                    Reports
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/reports/shift'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Clock className="w-5 h-5" />
                    Shift Reports
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/reports/overrides'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    Override Audit
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/commissions/team'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Users className="w-5 h-5" />
                    Team Commissions
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/admin/approval-rules'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Settings className="w-5 h-5" />
                    Approval Rules
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/admin/financing'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Banknote className="w-5 h-5" />
                    Financing Admin
                  </button>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    handleCloseShift();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-yellow-700 hover:bg-yellow-50 rounded-lg transition-colors"
                >
                  <Clock className="w-5 h-5" />
                  Close Shift
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

export default POSMain;
