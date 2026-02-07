/**
 * TeleTime POS - Checkout Modal Component
 * Full screen checkout overlay with payment flow
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon, ChevronLeftIcon, TagIcon, PlusIcon, TruckIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';
import { useCart } from '../../hooks/useCart';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
import PaymentMethods from './PaymentMethods';
import CashPayment from './CashPayment';
import CardPayment from './CardPayment';
import SplitPayment from './SplitPayment';
import PaymentComplete from './PaymentComplete';
import DiscountInput from './DiscountInput';
import AccountPayment from './AccountPayment';
import FinancingPayment from './FinancingPayment';
import ETransferPayment from './ETransferPayment';
import StoreCreditPayment from './StoreCreditPayment';
import DepositPayment from './DepositPayment';
import LoyaltyRedemption from './LoyaltyRedemption';
import PromoCodeInput from './PromoCodeInput';
import PromotionAlerts from './PromotionAlerts';
import FulfillmentSelector from './FulfillmentSelector';
import WarrantyUpsellModal from './WarrantyUpsellModal';
import SignatureStep from './SignatureStep';
import SalespersonSelector from './SalespersonSelector';
import CommissionSplitSelector from './CommissionSplitSelector';
import useWarrantyUpsell from '../../hooks/useWarrantyUpsell';
import useAutoPromotions from '../../hooks/useAutoPromotions';
import useSignatureRequirements from '../../hooks/useSignatureRequirements';
import { useAuth } from '../../context/AuthContext';
import { usePermissions, POS_PERMISSIONS } from '../../hooks/usePermissions';

/**
 * Order summary item component
 */
function OrderItem({ item }) {
  const lineTotal = item.unitPrice * item.quantity * (1 - item.discountPercent / 100);

  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-gray-900 truncate">
          {item.productName}
        </p>
        <p className="text-xs text-gray-500">
          {item.quantity} × {formatCurrency(item.unitPrice)}
          {item.discountPercent > 0 && (
            <span className="text-green-600 ml-1">
              (-{item.discountPercent}%)
            </span>
          )}
        </p>
      </div>
      <span className="text-sm font-medium text-gray-900 tabular-nums">
        {formatCurrency(lineTotal)}
      </span>
    </div>
  );
}

/**
 * Order summary component
 */
function OrderSummary({
  cart,
  showDiscountPanel,
  onToggleDiscount,
  onApplyDiscount,
  onClearDiscount,
  onApplyPromotion,
  onRemovePromotion,
  promotionAlerts,
  commissionSplitNode,
  canDiscount = true,
}) {
  return (
    <div className="h-full flex flex-col bg-gray-50 p-6">
      {/* Header */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>

      {/* Customer Info */}
      {cart.customer && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm font-medium text-gray-900">
            {cart.customer.customerName || cart.customer.name}
          </p>
          {cart.customer.phone && (
            <p className="text-xs text-gray-500">{cart.customer.phone}</p>
          )}
        </div>
      )}

      {/* Promotion Alerts - Available promos & near-miss */}
      {promotionAlerts && (promotionAlerts.hasPromotions || promotionAlerts.hasNearMiss) && (
        <div className="mb-4">
          <PromotionAlerts
            autoApplied={promotionAlerts.autoApplied}
            available={promotionAlerts.available}
            nearMiss={promotionAlerts.nearMiss}
            isLoading={promotionAlerts.isLoading}
            collapsed={false}
          />
        </div>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-y-auto mb-4">
        {cart.items.map((item) => (
          <OrderItem key={item.id} item={item} />
        ))}
      </div>

      {/* Discount Section — hidden if user lacks discount permission */}
      {!canDiscount ? null : showDiscountPanel ? (
        <div className="mb-4">
          <DiscountInput
            subtotal={cart.subtotal}
            currentDiscount={cart.discount}
            onApply={onApplyDiscount}
            onClear={onClearDiscount}
            onClose={onToggleDiscount}
          />
        </div>
      ) : (
        <div className="mb-4">
          {cart.discount?.amount > 0 ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TagIcon className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      {formatCurrency(cart.discount.amount)} discount applied
                    </p>
                    {cart.discount.reason && (
                      <p className="text-xs text-green-600">{cart.discount.reason}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleDiscount}
                  className="text-xs font-medium text-green-700 hover:text-green-800"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleDiscount}
              className="
                w-full h-10
                flex items-center justify-center gap-2
                text-sm font-medium
                text-blue-600 hover:text-blue-700
                bg-blue-50 hover:bg-blue-100
                border border-blue-200
                rounded-lg
                transition-colors duration-150
              "
            >
              <PlusIcon className="w-4 h-4" />
              Add Discount
            </button>
          )}
        </div>
      )}

      {/* Promo Code Section */}
      <div className="mb-4">
        <PromoCodeInput
          cart={cart}
          appliedPromotion={cart.appliedPromotion}
          onApplyPromotion={onApplyPromotion}
          onRemovePromotion={onRemovePromotion}
        />
      </div>

      {/* Fulfillment Summary */}
      {cart.selectedFulfillment && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-start gap-3">
            {cart.selectedFulfillment.type === 'local_delivery' ? (
              <TruckIcon className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            ) : (
              <ShoppingBagIcon className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {cart.selectedFulfillment.type === 'pickup_now' && 'Pickup Now'}
                {cart.selectedFulfillment.type === 'pickup_scheduled' && 'Scheduled Pickup'}
                {cart.selectedFulfillment.type === 'local_delivery' && 'Local Delivery'}
                {cart.selectedFulfillment.type === 'shipping' && 'Shipping'}
              </p>
              {cart.selectedFulfillment.scheduledDate && (
                <p className="text-xs text-gray-500">
                  {new Date(cart.selectedFulfillment.scheduledDate + 'T00:00:00').toLocaleDateString('en-CA', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {cart.selectedFulfillment.scheduledTimeStart && (
                    <span>
                      {' '}at {cart.selectedFulfillment.scheduledTimeStart.slice(0, 5)}
                    </span>
                  )}
                </p>
              )}
              {cart.selectedFulfillment.address && (
                <p className="text-xs text-gray-500 truncate">
                  {cart.selectedFulfillment.address.street}, {cart.selectedFulfillment.address.city}
                </p>
              )}
            </div>
            {cart.selectedFulfillment.fee > 0 && (
              <span className="text-xs font-medium text-gray-600">
                {formatCurrency(cart.selectedFulfillment.fee)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Commission Split */}
      {commissionSplitNode && (
        <div className="mb-4">
          {commissionSplitNode}
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal ({cart.itemCount} items)</span>
          <span className="font-medium tabular-nums">{formatCurrency(cart.subtotal)}</span>
        </div>

        {cart.discountTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-600">Discounts</span>
            <span className="font-medium text-green-600 tabular-nums">
              -{formatCurrency(cart.discountTotal)}
            </span>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{cart.taxLabel}</span>
          <span className="font-medium tabular-nums">{formatCurrency(cart.taxAmount)}</span>
        </div>

        {cart.deliveryFee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Delivery Fee</span>
            <span className="font-medium tabular-nums">{formatCurrency(cart.deliveryFee)}</span>
          </div>
        )}

        <div className="flex justify-between text-lg pt-2 border-t border-gray-300">
          <span className="font-bold text-gray-900">Total</span>
          <span className="font-bold text-gray-900 tabular-nums">
            {formatCurrency(cart.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Checkout modal component
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Callback to close modal
 * @param {function} props.onComplete - Callback when transaction completes
 */
export function CheckoutModal({
  isOpen,
  onClose,
  onComplete,
}) {
  const cart = useCart();
  const { user, isAdminOrManager } = useAuth();
  const { can } = usePermissions();

  // State
  const [step, setStep] = useState('fulfillment'); // 'fulfillment', 'methods', 'cash', 'credit', 'debit', 'giftcard', 'account', 'financing', 'etransfer', 'store_credit', 'deposit', 'split', 'signature', 'complete'
  const [payments, setPayments] = useState([]);
  const [transaction, setTransaction] = useState(null);
  const [error, setError] = useState(null);
  const [signatureWarning, setSignatureWarning] = useState(null);
  const [duplicatePaymentPrompt, setDuplicatePaymentPrompt] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const paymentsRef = useRef([]);
  const prevIsOpenRef = useRef(false);
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);

  // Check for trade-in items in cart
  const hasTradeIn = useMemo(() => {
    return cart.items.some(item => item.isTradeIn || item.productType === 'trade_in');
  }, [cart.items]);

  // Check for financing payment
  const hasFinancing = useMemo(() => {
    return payments.some(p => p.paymentMethod === 'financing');
  }, [payments]);

  // Signature requirements hook
  const signatureReq = useSignatureRequirements({
    orderTotal: cart.total,
    fulfillmentType: cart.selectedFulfillment?.type || 'pickup_now',
    hasTradeIn,
    hasFinancing,
    customerId: cart.customer?.id,
  });

  // Warranty upsell hook
  const warrantyUpsell = useWarrantyUpsell({
    cartItems: cart.items,
    onAddWarranty: ({ itemId, warranty, productName }) => {
      // Add warranty to cart when selected
      cart.addItem({
        productId: warranty.warrantyProductId,
        name: `${warranty.name} - ${productName}`,
        price: warranty.price,
        sku: `WRN-${warranty.warrantyId}`,
        cost: 0,
      }, {
        quantity: 1,
        isWarranty: true,
        coversItemId: itemId,
      });
    },
    onComplete: ({ warranties, skipped }) => {
      // Warranties flow complete, proceed to payment
      setStep('methods');
    },
  });

  // Auto-promotions hook - detects applicable promotions on cart changes
  const promotionAlerts = useAutoPromotions({
    items: cart.items,
    customer: cart.customer,
    subtotalCents: Math.round(cart.subtotal * 100),
    appliedPromotion: cart.appliedPromotion,
    onAutoApply: cart.applyPromotion,
    autoApplyEnabled: !cart.appliedPromotion, // Don't auto-apply if promotion already applied
  });

  // Calculate remaining balance
  const paidAmount = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const remainingBalance = useMemo(() => {
    return Math.max(0, cart.total - paidAmount);
  }, [cart.total, paidAmount]);

  // Check if fully paid
  const isFullyPaid = remainingBalance <= 0.01;

  // Reset state only when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Start at fulfillment step if no fulfillment selected
      setStep(cart.selectedFulfillment ? 'methods' : 'fulfillment');
      setPayments([]);
      paymentsRef.current = [];
      setTransaction(null);
      setError(null);
      setSignatureWarning(null);
      setIsProcessing(false);
      setShowDiscountPanel(false);
      signatureReq.reset();
      // Suppress auth redirect for the entire checkout session
      window.__posCheckoutActive = true;
    } else if (!isOpen && prevIsOpenRef.current) {
      // Checkout closed — allow auth redirects again
      window.__posCheckoutActive = false;
    }
    prevIsOpenRef.current = isOpen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Discount handlers
  const handleToggleDiscount = useCallback(() => {
    setShowDiscountPanel((prev) => !prev);
  }, []);

  const handleApplyDiscount = useCallback((amount, reason) => {
    cart.setCartDiscount(amount, reason);
    setShowDiscountPanel(false);
  }, [cart]);

  const handleClearDiscount = useCallback(() => {
    cart.clearCartDiscount();
  }, [cart]);

  // Promotion handlers
  const handleApplyPromotion = useCallback((promotion) => {
    cart.applyPromotion(promotion);
  }, [cart]);

  const handleRemovePromotion = useCallback(() => {
    cart.clearPromotion();
  }, [cart]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && step !== 'complete') {
        // Don't close if warranty modal is open
        if (warrantyUpsell.isOpen) {
          return;
        }
        if (step === 'fulfillment') {
          onClose?.();
        } else if (step === 'methods') {
          setStep('fulfillment');
        } else {
          setStep('methods');
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, step, onClose, warrantyUpsell.isOpen]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle fulfillment selection complete
  const handleFulfillmentComplete = useCallback((fulfillment) => {
    console.log('[Checkout] Fulfillment complete, starting warranty flow. Cart items:', cart.items?.length);
    cart.setFulfillment(fulfillment);
    // Start warranty upsell flow
    warrantyUpsell.startFlow();
  }, [cart, warrantyUpsell]);

  // Handle payment method selection
  const handleSelectMethod = useCallback((method) => {
    setStep(method);
  }, []);

  // Process the transaction
  const processTransaction = useCallback(async (finalPayments) => {
    setIsProcessing(true);
    setError(null);

    // Suppress auth redirect during checkout — we handle 401 ourselves
    window.__posCheckoutActive = true;

    try {
      // Include signature data with transaction
      const signatureData = signatureReq.getSignatureData();

      const result = await cart.processTransaction(finalPayments, {
        signatures: signatureData,
      });

      if (result.success) {
        // Save captured signatures to server
        if (Object.keys(signatureReq.capturedSignatures).length > 0) {
          try {
            const results = await signatureReq.saveSignatures(
              result.transaction.orderId,
              result.transaction.transactionId || result.transaction.transaction_id
            );
            const failed = Array.isArray(results)
              ? results.filter(r => !r.success)
              : [];
            if (failed.length > 0) {
              setSignatureWarning('Transaction completed, but some signatures failed to upload. Please re-upload from the order record.');
            } else {
              setSignatureWarning(null);
            }
          } catch (sigError) {
            console.error('[Checkout] Signature save error:', sigError);
            setSignatureWarning('Transaction completed, but signature upload failed. Please re-upload from the order record.');
          }
        }

        setTransaction(result.transaction);
        setStep('complete');
        onComplete?.(result.transaction);
      } else {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Transaction failed';
        setError(errMsg);
        setStep('methods');
      }
    } catch (err) {
      console.error('[Checkout] Transaction error:', err);
      if (err?.code === 'UNAUTHORIZED' || err?.status === 401) {
        setError('Session expired. Please log in again and retry checkout. Your cart items have been preserved.');
      } else {
        setError(typeof err === 'string' ? err : err?.message || 'An unexpected error occurred');
      }
      setStep('methods');
    } finally {
      window.__posCheckoutActive = false;
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [cart, onComplete, signatureReq]);

  // Handle payment completion
  const handlePaymentComplete = useCallback((payment) => {
    // Synchronous guard - prevents double-click race condition
    if (processingRef.current || isProcessing) return;
    processingRef.current = true;

    const currentPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remainingBefore = Math.max(0, cart.total - currentPaid);
    const isPartialPayment = payment.amount + 0.01 < remainingBefore;

    if (payment.paymentMethod === 'cash' && isPartialPayment) {
      const hasCashPayment = payments.some((p) => p.paymentMethod === 'cash');
      if (hasCashPayment) {
        setDuplicatePaymentPrompt({
          payment,
          message: `You are applying another partial cash payment of ${formatCurrency(payment.amount)}. Continue?`,
        });
        processingRef.current = false;
        return;
      }
    }

    const newPayments = [...payments, payment];
    setPayments(newPayments);
    paymentsRef.current = newPayments;

    // Deposit payments intentionally don't cover the full amount
    if (payment.isDeposit) {
      processTransaction(newPayments);
      return;
    }

    const newPaidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
    const newRemaining = cart.total - newPaidAmount;

    if (newRemaining <= 0.01) {
      // Fully paid - check if signatures are required
      if (signatureReq.hasRequirements && !signatureReq.isComplete) {
        setStep('signature');
        processingRef.current = false;
      } else {
        // No signatures needed - process transaction
        processTransaction(newPayments);
      }
    } else {
      // Show split payment or return to methods
      setStep('split');
      processingRef.current = false;
    }
  }, [payments, cart.total, signatureReq.hasRequirements, signatureReq.isComplete, isProcessing, processTransaction]);

  const confirmDuplicatePayment = useCallback(() => {
    if (!duplicatePaymentPrompt?.payment) return;
    processingRef.current = true;
    const payment = duplicatePaymentPrompt.payment;
    setDuplicatePaymentPrompt(null);

    const newPayments = [...payments, payment];
    setPayments(newPayments);
    paymentsRef.current = newPayments;

    if (payment.isDeposit) {
      processTransaction(newPayments);
      return;
    }

    const newPaidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
    const newRemaining = cart.total - newPaidAmount;

    if (newRemaining <= 0.01) {
      if (signatureReq.hasRequirements && !signatureReq.isComplete) {
        setStep('signature');
        processingRef.current = false;
      } else {
        processTransaction(newPayments);
      }
    } else {
      setStep('split');
      processingRef.current = false;
    }
  }, [duplicatePaymentPrompt, payments, cart.total, processTransaction, signatureReq.hasRequirements, signatureReq.isComplete]);

  const cancelDuplicatePayment = useCallback(() => {
    setDuplicatePaymentPrompt(null);
    processingRef.current = false;
  }, []);

  // Handle signature step completion - use ref to avoid stale closure
  const handleSignatureComplete = useCallback(() => {
    processTransaction(paymentsRef.current);
  }, [processTransaction]);

  // Handle signature capture
  const handleSignatureCapture = useCallback((type, signatureData) => {
    signatureReq.recordSignature(type, signatureData);
  }, [signatureReq]);

  // Handle signature defer
  const handleSignatureDefer = useCallback((type) => {
    signatureReq.deferSignature(type);
  }, [signatureReq]);

  // Handle going back
  const handleBack = useCallback(() => {
    if (step === 'signature') {
      // From signature, go back to split only if multiple payments
      setStep(payments.length > 1 ? 'split' : 'methods');
    } else if (payments.length > 0) {
      setStep('split');
    } else if (step === 'methods') {
      setStep('fulfillment');
    } else {
      setStep('methods');
    }
  }, [payments, step]);

  // Handle removing a payment
  const handleRemovePayment = useCallback((index) => {
    setPayments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      paymentsRef.current = next;
      return next;
    });
  }, []);

  // Handle new transaction
  const handleNewTransaction = useCallback(() => {
    cart.clearCart();
    onClose?.();
  }, [cart, onClose]);

  // Handle print receipt - fetches PDF and opens print dialog
  const handlePrintReceipt = useCallback(async (txn) => {
    const transactionId = txn?.transactionId || txn?.transaction_id;
    if (!transactionId) {
      console.error('[Checkout] No transaction ID for print');
      throw new Error('No transaction ID');
    }

    try {
      // Fetch PDF from receipt API
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/preview`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch receipt');
      }

      // Get PDF blob and open in new window for printing
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Open in new window and trigger print
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      } else {
        // Fallback: download the PDF
        const link = document.createElement('a');
        link.href = url;
        link.download = `receipt-${txn.transactionNumber || transactionId}.pdf`;
        link.click();
      }

      // Clean up URL after delay
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('[Checkout] Print receipt error:', error);
      throw error;
    }
  }, []);

  // Handle email receipt
  const handleEmailReceipt = useCallback(async (txn, email) => {
    const transactionId = txn?.transactionId || txn?.transaction_id;
    if (!transactionId) {
      console.error('[Checkout] No transaction ID for email');
      throw new Error('No transaction ID');
    }

    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to email receipt');
      }

      return result;
    } catch (error) {
      console.error('[Checkout] Email receipt error:', error);
      throw error;
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Left Side - Order Summary */}
      <div className="w-[400px] border-r border-gray-200 flex-shrink-0">
        <OrderSummary
          cart={cart}
          showDiscountPanel={showDiscountPanel}
          onToggleDiscount={handleToggleDiscount}
          onApplyDiscount={handleApplyDiscount}
          onClearDiscount={handleClearDiscount}
          onApplyPromotion={handleApplyPromotion}
          onRemovePromotion={handleRemovePromotion}
          promotionAlerts={promotionAlerts}
          canDiscount={can(POS_PERMISSIONS.CHECKOUT_DISCOUNT)}
          commissionSplitNode={
            <CommissionSplitSelector
              salespersonId={cart.salespersonId}
              salespersonName={user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.email || 'You')}
              commissionSplit={cart.commissionSplit}
              onSplitChange={cart.setCommissionSplit}
              cartTotal={cart.total}
              cartItems={cart.items}
            />
          }
        />
      </div>

      {/* Right Side - Payment Area */}
      <div className="flex-1 bg-white flex flex-col">
        {/* Header */}
        {step !== 'complete' && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              {step !== 'fulfillment' && step !== 'split' && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="
                    w-10 h-10
                    flex items-center justify-center
                    text-gray-500 hover:text-gray-700
                    hover:bg-gray-100
                    rounded-lg
                    transition-colors duration-150
                  "
                >
                  <ChevronLeftIcon className="w-6 h-6" />
                </button>
              )}
              <h1 className="text-xl font-bold text-gray-900">
                {step === 'fulfillment' ? 'Fulfillment' : 'Checkout'}
              </h1>
            </div>

            {/* Salesperson Display & Override */}
            <div className="flex items-center gap-3">
              <SalespersonSelector
                selectedId={cart.salespersonId}
                onSelect={(id, _rep) => cart.setSalespersonId(id)}
                showSelected={true}
                maxQuickSelect={isAdminOrManager() ? 4 : 0}
                className=""
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="
                w-10 h-10
                flex items-center justify-center
                text-gray-500 hover:text-gray-700
                hover:bg-gray-100
                rounded-lg
                transition-colors duration-150
              "
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Duplicate Payment Confirmation */}
        {duplicatePaymentPrompt && (
          <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 mb-3">{duplicatePaymentPrompt.message}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelDuplicatePayment}
                className="h-10 px-4 rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDuplicatePayment}
                className="h-10 px-4 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">Processing Transaction...</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Fulfillment Selection */}
          {step === 'fulfillment' && (
            <FulfillmentSelector
              cart={cart}
              customer={cart.customer}
              selectedFulfillment={cart.selectedFulfillment}
              onComplete={handleFulfillmentComplete}
            />
          )}

          {/* Payment Methods */}
          {step === 'methods' && (
            <PaymentMethods
              remainingAmount={remainingBalance}
              onSelectMethod={handleSelectMethod}
              appliedPayments={payments}
              disabled={isProcessing}
              customer={cart.customer}
            />
          )}

          {/* Cash Payment */}
          {step === 'cash' && (
            <CashPayment
              amountDue={remainingBalance}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
            />
          )}

          {/* Credit Card Payment */}
          {step === 'credit' && (
            <CardPayment
              amountDue={remainingBalance}
              paymentType="credit"
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
            />
          )}

          {/* Debit Card Payment */}
          {step === 'debit' && (
            <CardPayment
              amountDue={remainingBalance}
              paymentType="debit"
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
            />
          )}

          {/* Gift Card Payment */}
          {step === 'giftcard' && (
            <CardPayment
              amountDue={remainingBalance}
              paymentType="giftcard"
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={true}
            />
          )}

          {/* Account Payment */}
          {step === 'account' && (
            <AccountPayment
              amountDue={remainingBalance}
              customer={cart.customer}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
            />
          )}

          {/* Financing Payment */}
          {step === 'financing' && (
            <FinancingPayment
              amountDue={remainingBalance}
              customer={cart.customer}
              orderId={transaction?.orderId}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
            />
          )}

          {/* E-Transfer Payment */}
          {step === 'etransfer' && (
            <ETransferPayment
              amountDue={remainingBalance}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
              customer={cart.customer}
            />
          )}

          {/* Store Credit Payment */}
          {step === 'store_credit' && (
            <StoreCreditPayment
              amountDue={remainingBalance}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
            />
          )}

          {/* Loyalty Points Redemption */}
          {step === 'loyalty_points' && (
            <LoyaltyRedemption
              amountDue={remainingBalance}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              isPartial={payments.length > 0}
              customer={cart.customer}
            />
          )}

          {/* Deposit Payment */}
          {step === 'deposit' && (
            <DepositPayment
              amountDue={remainingBalance}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
              onSelectMethod={handleSelectMethod}
            />
          )}

          {/* Split Payment View */}
          {step === 'split' && (
            <SplitPayment
              totalAmount={cart.total}
              payments={payments}
              remainingBalance={remainingBalance}
              onAddPayment={() => setStep('methods')}
              onRemovePayment={handleRemovePayment}
              onBack={() => setStep('methods')}
              onComplete={() => {
                // Check if signatures are required before processing
                if (signatureReq.hasRequirements && !signatureReq.isComplete) {
                  setStep('signature');
                } else {
                  processTransaction(payments);
                }
              }}
            />
          )}

          {/* Signature Collection Step */}
          {step === 'signature' && (
            <SignatureStep
              requirements={signatureReq.requiredSignatures}
              capturedSignatures={signatureReq.capturedSignatures}
              deferredSignatures={signatureReq.deferredSignatures}
              onSignatureCapture={handleSignatureCapture}
              onSignatureDefer={handleSignatureDefer}
              onComplete={handleSignatureComplete}
              onBack={handleBack}
              orderInfo={{
                total: cart.total,
                fulfillmentType: cart.selectedFulfillment?.type,
              }}
            />
          )}

          {/* Payment Complete */}
          {step === 'complete' && (
          <PaymentComplete
            transaction={transaction}
            onNewTransaction={handleNewTransaction}
            onPrintReceipt={handlePrintReceipt}
            onEmailReceipt={handleEmailReceipt}
            customerEmail={cart.customer?.email}
            signatureWarning={signatureWarning}
          />
          )}
        </div>
      </div>

      {/* Warranty Upsell Modal */}
      <WarrantyUpsellModal
        isOpen={warrantyUpsell.isOpen}
        currentItem={warrantyUpsell.currentItem}
        progress={warrantyUpsell.progress}
        selectedWarranty={warrantyUpsell.selectedWarranties[warrantyUpsell.currentItem?.cartItem?.id]}
        onSelectWarranty={warrantyUpsell.selectWarranty}
        onAddAndContinue={warrantyUpsell.addAndContinue}
        onDecline={warrantyUpsell.declineAndContinue}
        onSkipAll={warrantyUpsell.skipAll}
        onGoBack={warrantyUpsell.goBack}
        onClose={warrantyUpsell.close}
      />
    </div>
  );
}

export default CheckoutModal;
