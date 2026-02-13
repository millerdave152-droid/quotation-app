/**
 * TeleTime POS - Main Layout
 * Full POS interface with product browsing, cart, and checkout
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bars3Icon,
  XMarkIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ClockIcon,
  ChartBarIcon,
  DocumentTextIcon,
  UserIcon,
  PauseIcon,
  TagIcon,
  ShoppingCartIcon,
  CubeIcon,
  ArrowUturnLeftIcon,
  ClipboardDocumentListIcon,
  TableCellsIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';

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
import { CustomerLookup } from '../components/Customer/CustomerLookup';
import { QuoteLookup } from '../components/Quotes/QuoteLookup';
import { QuoteConversionBanner } from '../components/Quotes/QuoteConversionBanner';
import { CheckoutModal } from '../components/Checkout/CheckoutModal';
import { PriceOverrideModal } from '../components/Pricing/PriceOverrideModal';
import { ShiftSummaryCompact, ShiftSummaryPanel } from '../components/Register/ShiftSummary';
import ShiftCommissionSummary from '../components/Commission/ShiftCommissionSummary';
import { ManagerApprovalQueue } from '../components/Discount/ManagerApprovalQueue';
import { DiscountEscalationModal } from '../components/Discount/DiscountEscalationModal';
import { EscalationToastContainer } from '../components/Discount/EscalationToast';

// Hooks
import { useEscalationPolling } from '../hooks/useEscalationPolling';

// API
import { getMyTier, initializeBudget } from '../api/discountAuthority';

// Utils
import { formatCurrency } from '../utils/formatters';

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

const KEYBOARD_SHORTCUTS = {
  F2: 'search',       // Focus product search
  F4: 'customer',     // Customer lookup
  F5: 'quote',        // Quote lookup
  F6: 'returns',      // Returns & Exchanges
  F7: 'hold',         // Hold transaction
  F8: 'priceCheck',   // Price check
  F9: 'checkout',     // Checkout (changed from F12 to allow DevTools)
  Escape: 'cancel',   // Cancel/close modals
};

// ============================================================================
// QUICK ACTION BAR
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
        icon={DocumentTextIcon}
        label="Quote"
        shortcut="F5"
        onClick={onQuoteLookup}
      />
      <QuickAction
        icon={UserIcon}
        label="Customer"
        shortcut="F4"
        onClick={onCustomerLookup}
      />
      <QuickAction
        icon={ArrowUturnLeftIcon}
        label="Returns"
        shortcut="F6"
        onClick={onReturns}
      />
      <QuickAction
        icon={PauseIcon}
        label="Hold"
        shortcut="F7"
        onClick={onHold}
        disabled={isEmpty}
        variant="warning"
      />
      <QuickAction
        icon={TagIcon}
        label="Price Check"
        shortcut="F8"
        onClick={onPriceCheck}
      />
      {isManager && (
        <QuickAction
          icon={ShieldCheckIcon}
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
  onUserMenuClick,
  onCloseShift,
  onDiscountApprovals,
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
            <Bars3Icon className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold">TT</span>
            </div>
            <div className="hidden md:block">
              <h1 className="text-lg font-bold">
                {import.meta.env.VITE_APP_NAME || 'TeleTime POS'}
              </h1>
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
                <ChartBarIcon className="w-5 h-5 text-blue-400" />
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
                <ClockIcon className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-300">{getShiftDuration()}</span>
              </div>
            </button>
          </div>
        )}

        {/* Right - User Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <UserCircleIcon className="w-8 h-8 text-slate-400" />
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
                  <ClockIcon className="w-5 h-5 text-gray-500" />
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
                      <TableCellsIcon className="w-5 h-5 text-gray-500" />
                      <span>Transactions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/reports'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ClipboardDocumentListIcon className="w-5 h-5 text-gray-500" />
                      <span>Reports</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/reports/shift'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ClockIcon className="w-5 h-5 text-gray-500" />
                      <span>Shift Reports</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/reports/overrides'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ShieldCheckIcon className="w-5 h-5 text-gray-500" />
                      <span>Override Audit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/commissions/team'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <UserGroupIcon className="w-5 h-5 text-gray-500" />
                      <span>Team Commissions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/admin/approval-rules'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Cog6ToothIcon className="w-5 h-5 text-gray-500" />
                      <span>Approval Rules</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); navigate('/admin/financing'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <BanknotesIcon className="w-5 h-5 text-gray-500" />
                      <span>Financing Admin</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); onDiscountApprovals?.(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <TagIcon className="w-5 h-5 text-gray-500" />
                      <span>Discount Approvals</span>
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
                  <CurrencyDollarIcon className="w-5 h-5 text-gray-500" />
                  <span>My Commissions</span>
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
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ShiftCommissionSummary
        isOpen={showCommissionSummary}
        onClose={() => {
          setShowCommissionSummary(false);
          logout();
        }}
      />
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
        <CubeIcon className="w-5 h-5" />
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
        <ShoppingCartIcon className="w-5 h-5" />
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
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setProduct(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleProductSelect = (selectedProduct) => {
    setProduct(selectedProduct);
    setQuery('');
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
            <XMarkIcon className="w-6 h-6" />
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
// MAIN POS LAYOUT
// ============================================================================

export function POSMain() {
  const navigate = useNavigate();
  const { user, isAdminOrManager } = useAuth();
  const { hasActiveShift, currentShift, shiftSummary } = useRegister();
  const cart = useCart();

  // UI State
  const [mobileView, setMobileView] = useState('products'); // 'products' | 'cart'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Modal State
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [showQuoteLookup, setShowQuoteLookup] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [priceOverrideItem, setPriceOverrideItem] = useState(null);
  const [showDiscountApprovals, setShowDiscountApprovals] = useState(false);

  // Discount Authority State
  const [discountTier, setDiscountTier] = useState(null);
  const [discountBudget, setDiscountBudget] = useState(null);
  const [escalationItem, setEscalationItem] = useState(null);
  const [escalationDesiredPct, setEscalationDesiredPct] = useState(0);

  // Escalation polling
  const {
    escalations: myEscalations,
    pendingCount: escalationPendingCount,
    newlyResolved,
    clearResolved,
    refresh: refreshEscalations,
  } = useEscalationPolling(hasActiveShift);

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

  // Callback when escalation is requested from DiscountSlider
  const handleRequestEscalation = useCallback((item, desiredPct) => {
    setEscalationItem(item);
    setEscalationDesiredPct(desiredPct);
  }, []);

  // Apply an approved escalation discount to the matching cart item
  const handleApplyApprovedEscalation = useCallback((escalation) => {
    const matchingItem = cart.items.find((item) => item.productId === escalation.product_id);
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
        const matchingItem = cart.items.find((item) => item.productId === esc.product_id);
        if (matchingItem && matchingItem.discountPercent > 0) {
          cart.applyItemDiscount(matchingItem.id, 0);
        }
      }
    }
  }, [newlyResolved, cart]);

  // Handle hold transaction (declared before keyboard shortcuts useEffect that references it)
  const handleHoldTransaction = useCallback(() => {
    const result = cart.holdCart();
    if (result.success) {
      // Show success feedback
      console.log('[POSMain] Transaction held');
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
  }, [cart.isEmpty, hasActiveShift, showCheckout, showCustomerLookup, showQuoteLookup, showShiftSummary, showPriceCheck, priceOverrideItem, handleHoldTransaction]);

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
    cart.addItem(product);
    setSearchQuery('');
    // On mobile, switch to cart view after adding
    if (window.innerWidth < 1024) {
      setMobileView('cart');
    }
  }, [cart]);

  // Handle category change
  const handleCategoryChange = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
    setSearchQuery(''); // Clear search when changing category
  }, []);

  // Handle search
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (query) {
      setSelectedCategory(null); // Clear category when searching
    }
  }, []);

  // Handle checkout
  const handleCheckout = useCallback(() => {
    if (cart.isEmpty) return;
    setShowCheckout(true);
  }, [cart.isEmpty]);

  // Handle checkout complete
  const handleCheckoutComplete = useCallback((transaction) => {
    console.log('[POSMain] Transaction complete:', transaction);
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

      {/* Header */}
      <Header
        onMenuClick={() => setShowMobileMenu(true)}
        onShiftSummaryClick={() => setShowShiftSummary(true)}
        onCloseShift={handleCloseShift}
        onDiscountApprovals={() => setShowDiscountApprovals(true)}
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
          <div className="p-4 bg-white border-b border-gray-200 space-y-4">
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
            />
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto">
            <ProductGrid
              categoryId={selectedCategory}
              searchQuery={searchQuery}
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
          isManager={isAdminOrManager()}
        />
      </div>

      {/* ============================================================ */}
      {/* MODALS */}
      {/* ============================================================ */}

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

      {/* Price Check Modal */}
      <PriceCheckModal
        isOpen={showPriceCheck}
        onClose={() => setShowPriceCheck(false)}
      />

      {/* Manager Discount Approval Queue */}
      <ManagerApprovalQueue
        isOpen={showDiscountApprovals}
        onClose={() => setShowDiscountApprovals(false)}
      />

      {/* Discount Escalation Modal */}
      <DiscountEscalationModal
        isOpen={!!escalationItem}
        onClose={() => { setEscalationItem(null); setEscalationDesiredPct(0); refreshEscalations(); }}
        item={escalationItem}
        desiredPct={escalationDesiredPct}
        tier={discountTier}
      />

      {/* Price Override Modal */}
      <PriceOverrideModal
        isOpen={!!priceOverrideItem}
        onClose={() => setPriceOverrideItem(null)}
        onApply={(overridePrice, reason) => {
          if (priceOverrideItem) {
            cart.updateItemPrice(priceOverrideItem.id, overridePrice, reason);
          }
          setPriceOverrideItem(null);
        }}
        product={priceOverrideItem || {}}
        originalPrice={priceOverrideItem?.basePrice || priceOverrideItem?.unitPrice || 0}
        customerPrice={priceOverrideItem?.unitPrice || 0}
        customerId={cart.customer?.id || cart.customer?.customerId}
        quantity={priceOverrideItem?.quantity || 1}
      />

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
                <XMarkIcon className="w-6 h-6" />
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
                <ChartBarIcon className="w-5 h-5" />
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
                <DocumentTextIcon className="w-5 h-5" />
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
                <UserIcon className="w-5 h-5" />
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
                <TagIcon className="w-5 h-5" />
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
                <ArrowUturnLeftIcon className="w-5 h-5" />
                Returns & Exchanges (F6)
              </button>

              {/* My Commissions - all users */}
              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); navigate('/commissions/my'); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <CurrencyDollarIcon className="w-5 h-5" />
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
                    <TableCellsIcon className="w-5 h-5" />
                    Transactions
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/reports'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ClipboardDocumentListIcon className="w-5 h-5" />
                    Reports
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/reports/shift'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ClockIcon className="w-5 h-5" />
                    Shift Reports
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/reports/overrides'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ShieldCheckIcon className="w-5 h-5" />
                    Override Audit
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/commissions/team'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <UserGroupIcon className="w-5 h-5" />
                    Team Commissions
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/admin/approval-rules'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Cog6ToothIcon className="w-5 h-5" />
                    Approval Rules
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowMobileMenu(false); navigate('/admin/financing'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <BanknotesIcon className="w-5 h-5" />
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
                  <ClockIcon className="w-5 h-5" />
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
