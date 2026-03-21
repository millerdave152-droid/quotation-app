/**
 * CheckoutPaymentNew.jsx
 * Screen 3 — Checkout Modal: Payment Methods (Pencil frame lftme)
 * Two-panel layout: Left = Order Summary, Right = Payment Method Grid (4x3)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  X,
  Banknote,
  CreditCard,
  Smartphone,
  Gift,
  Wallet,
  Building2,
  FileText,
  Heart,
  Phone,
  ArrowLeftRight,
  PiggyBank,
  Split,
  CheckCircle,
} from 'lucide-react';
import { useCartContext } from '../../context/CartContext';
import { useRegister } from '../../context/RegisterContext';
import { useAuth } from '../../context/AuthContext';
import { createTransaction } from '../../api/transactions';
import { formatCents } from '../../utils/formatCents';

// ─── Payment Methods ───────────────────────────────────────────

const paymentMethods = [
  { id: 'cash',       label: 'Cash',           icon: Banknote,        color: '#22C55E' },
  { id: 'credit',     label: 'Credit',         icon: CreditCard,      color: '#3B82F6' },
  { id: 'debit',      label: 'Debit',          icon: Smartphone,      color: '#3B82F6' },
  { id: 'gift',       label: 'Gift Card',      icon: Gift,            color: '#8B5CF6' },
  { id: 'store',      label: 'Store Credit',   icon: Wallet,          color: '#8B5CF6' },
  { id: 'account',    label: 'Account',        icon: Building2,       color: '#F97316' },
  { id: 'financing',  label: 'Financing',      icon: FileText,        color: '#14B8A6' },
  { id: 'loyalty',    label: 'Loyalty Points',  icon: Heart,          color: '#E11D48' },
  { id: 'phone',      label: 'Phone Order',    icon: Phone,           color: '#E11D48' },
  { id: 'etransfer',  label: 'E-Transfer',     icon: ArrowLeftRight,  color: '#6366F1' },
  { id: 'deposit',    label: 'Deposit',        icon: PiggyBank,       color: '#F59E0B' },
  { id: 'split',      label: 'Split Payment',  icon: Split,           color: null },
];

// Methods that have a wired flow
const ROUTED_METHODS = {
  cash: '/checkout/cash',
};

// Methods that open the manual card entry modal
const CARD_METHODS = new Set(['credit', 'debit']);

const CARD_TYPES = ['Visa', 'Mastercard', 'Amex', 'Debit'];

// ─── Component ─────────────────────────────────────────────────

export default function CheckoutPaymentNew() {
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentShift } = useRegister();
  const {
    items, customer, quoteId,
    subtotalAfterDiscount, discountTotal,
    taxAmount, taxLabel, orderTotal,
    province, deliveryFee, selectedFulfillment,
    clearCart,
  } = useCartContext();

  // Manual card modal state
  const [showCardModal, setShowCardModal] = useState(false);
  const [approvalCode, setApprovalCode] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardType, setCardType] = useState('Visa');
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardError, setCardError] = useState(null);

  // Format dollar values (context stores dollars, formatCents expects cents)
  const fmtDollars = (v) => formatCents((v || 0) * 100);

  const handleMethodClick = (pm) => {
    setSelectedMethod(pm.id);

    if (CARD_METHODS.has(pm.id)) {
      setCardType(pm.id === 'debit' ? 'Debit' : 'Visa');
      setApprovalCode('');
      setCardLast4('');
      setCardError(null);
      setShowCardModal(true);
      return;
    }

    const route = ROUTED_METHODS[pm.id];
    if (route) {
      navigate(route, { state: { method: pm.id } });
    } else {
      setToast(`${pm.label} — Coming Soon`);
      setTimeout(() => setToast(null), 2000);
    }
  };

  const handleCardSubmit = async () => {
    if (!approvalCode.trim()) {
      setCardError('Approval code is required.');
      return;
    }
    setCardSubmitting(true);
    setCardError(null);

    try {
      const txnData = {
        shiftId: currentShift?.id,
        customerId: customer?.id,
        quoteId,
        salespersonId: user?.id,
        items: items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
          unitCost: item.cost,
          discountPercent: item.discountPercent || 0,
          discountAmount: item.discountAmount || 0,
          taxable: true,
        })),
        payments: [{
          paymentMethod: 'card_manual',
          amount: orderTotal,
          authorizationCode: approvalCode.trim(),
          cardLastFour: cardLast4.trim() || null,
          cardBrand: cardType,
        }],
        discountAmount: discountTotal,
        taxProvince: province,
        deliveryFee,
        fulfillment: selectedFulfillment,
      };

      const result = await createTransaction(txnData);

      if (result.success) {
        clearCart();
        navigate('/checkout/complete', {
          state: {
            transaction: result.data,
            paymentMethod: 'card_manual',
            cardType,
            cardLast4: cardLast4.trim() || null,
          },
        });
      } else {
        setCardError(result.error || 'Transaction failed. Please try again.');
      }
    } catch (err) {
      setCardError(err.message || 'An unexpected error occurred.');
    } finally {
      setCardSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* ══════════════════════════════════════════
          LEFT PANEL — Order Summary (460px)
          ══════════════════════════════════════════ */}
      <div className="w-[460px] shrink-0 flex flex-col bg-card border-r border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Receipt size={20} className="text-primary" />
            <span className="font-secondary text-[16px] font-bold text-foreground">
              Order Summary
            </span>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Customer */}
        {customer ? (
          <div className="flex items-center gap-2.5 px-5 py-2.5 bg-[#FF840008] border-b border-border">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="font-secondary text-[10px] font-semibold text-primary-foreground">
                {customer.name
                  ? customer.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                  : '?'}
              </span>
            </div>
            <div className="flex flex-col gap-px">
              <span className="font-secondary text-[13px] font-semibold text-foreground">
                {customer.name || 'Unknown'}
              </span>
              <span className="font-secondary text-[10px] text-muted-foreground">
                {customer.phone || customer.email || ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center px-5 py-2.5 border-b border-border">
            <span className="font-secondary text-[13px] text-muted-foreground">No customer selected</span>
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="font-secondary text-sm text-muted-foreground">No items in cart</span>
            </div>
          ) : (
            items.map((item) => {
              const lineTotal = item.price * item.quantity;
              const hasDiscount = item.discountType === 'percent' && item.discountValue > 0;
              const discountedTotal = hasDiscount
                ? lineTotal * (1 - item.discountValue / 100)
                : lineTotal;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-5 py-2.5 border-b border-border"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-secondary text-xs font-medium text-foreground">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-secondary text-[10px] text-muted-foreground">
                        Qty: {item.quantity}
                      </span>
                      {hasDiscount && (
                        <span className="bg-[#22C55E15] text-green-700 font-secondary text-[9px] font-semibold px-1 py-px rounded-lu-sm">
                          -{item.discountValue}%
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-primary text-xs font-semibold text-foreground">
                    {fmtDollars(hasDiscount ? discountedTotal : lineTotal)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Totals */}
        <div className="flex flex-col gap-1.5 px-5 pt-3 pb-4 border-t border-border bg-card">
          {/* Subtotal */}
          <div className="flex justify-between">
            <span className="font-secondary text-xs text-muted-foreground">Subtotal</span>
            <span className="font-secondary text-xs text-foreground">{fmtDollars(subtotalAfterDiscount)}</span>
          </div>
          {/* Discounts */}
          {discountTotal > 0 && (
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-green-700">Discounts</span>
              <span className="font-secondary text-xs text-green-700">-{fmtDollars(discountTotal)}</span>
            </div>
          )}
          {/* Tax */}
          <div className="flex justify-between">
            <span className="font-secondary text-xs text-muted-foreground">{taxLabel || 'HST (13%)'}</span>
            <span className="font-secondary text-xs text-foreground">{fmtDollars(taxAmount)}</span>
          </div>
          {/* Divider */}
          <div className="h-px bg-border my-1" />
          {/* Grand Total */}
          <div className="flex items-center justify-between">
            <span className="font-secondary text-[16px] font-bold text-foreground">
              Amount Due
            </span>
            <span className="font-primary text-[22px] font-bold text-primary">
              {fmtDollars(orderTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT PANEL — Payment Methods
          ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col gap-7 px-10 py-8 overflow-y-auto">
        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <h1 className="font-primary text-lu-2xl font-bold text-foreground">
            Select Payment Method
          </h1>
          <p className="font-secondary text-lu-sm text-muted-foreground">
            Choose how to accept payment for {fmtDollars(orderTotal)}
          </p>
        </div>

        {/* Payment Grid — 4 columns × 3 rows */}
        <div className="grid grid-cols-4 gap-3">
          {paymentMethods.map((pm) => {
            const isSelected = selectedMethod === pm.id;
            const isSplit = pm.color === null;
            const IconComp = pm.icon;

            return (
              <motion.button
                key={pm.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleMethodClick(pm)}
                className="flex flex-col items-center justify-center gap-2 h-[100px] rounded-lu-lg p-4 cursor-pointer"
                style={
                  isSplit
                    ? {
                        backgroundColor: 'hsl(var(--lu-secondary))',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'hsl(var(--lu-border))',
                      }
                    : {
                        backgroundColor: `${pm.color}08`,
                        borderColor: isSelected ? pm.color : `${pm.color}40`,
                        borderWidth: isSelected ? 2 : 1,
                        borderStyle: 'solid',
                      }
                }
              >
                <IconComp
                  size={28}
                  style={isSplit ? { color: 'hsl(var(--lu-muted-foreground))' } : { color: pm.color }}
                />
                <span className="font-secondary text-sm font-semibold text-foreground">
                  {pm.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Coming Soon Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lu-pill px-5 py-2.5 shadow-lu-lg z-50"
          >
            <span className="font-secondary text-sm font-medium text-foreground">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          Manual Card Entry Modal
          ══════════════════════════════════════════ */}
      <AnimatePresence>
        {showCardModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !cardSubmitting && setShowCardModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[420px] bg-card border border-border rounded-lu-lg shadow-lu-lg overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <CreditCard size={20} className="text-[#3B82F6]" />
                  <span className="font-secondary text-[16px] font-bold text-foreground">
                    Manual Card Entry
                  </span>
                </div>
                <button
                  onClick={() => !cardSubmitting && setShowCardModal(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex flex-col gap-4 px-6 py-5">
                {/* Error */}
                {cardError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lu-md px-3 py-2 font-secondary text-xs">
                    {cardError}
                  </div>
                )}

                {/* Amount (read-only) */}
                <div className="flex flex-col gap-1">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">
                    Amount
                  </label>
                  <div className="flex items-center h-10 px-3 bg-secondary rounded-lu-md border border-border">
                    <span className="font-primary text-sm font-bold text-foreground">
                      {fmtDollars(orderTotal)}
                    </span>
                  </div>
                </div>

                {/* Approval Code (required) */}
                <div className="flex flex-col gap-1">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">
                    Approval Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={approvalCode}
                    onChange={(e) => setApprovalCode(e.target.value)}
                    placeholder="e.g. 847291"
                    autoFocus
                    className="h-10 px-3 bg-background rounded-lu-md border border-border font-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                {/* Last 4 Digits (optional) */}
                <div className="flex flex-col gap-1">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">
                    Last 4 Digits
                  </label>
                  <input
                    type="text"
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="e.g. 4829"
                    maxLength={4}
                    className="h-10 px-3 bg-background rounded-lu-md border border-border font-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                {/* Card Type */}
                <div className="flex flex-col gap-1">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">
                    Card Type
                  </label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    className="h-10 px-3 bg-background rounded-lu-md border border-border font-secondary text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {CARD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-5">
                <motion.button
                  onClick={handleCardSubmit}
                  disabled={cardSubmitting || !approvalCode.trim()}
                  whileHover={approvalCode.trim() && !cardSubmitting ? { scale: 1.01 } : {}}
                  whileTap={approvalCode.trim() && !cardSubmitting ? { scale: 0.98 } : {}}
                  className={`flex items-center justify-center gap-2 w-full h-11 rounded-lu-md transition-opacity ${
                    approvalCode.trim() && !cardSubmitting
                      ? 'bg-[#3B82F6] cursor-pointer'
                      : 'bg-[#3B82F6] opacity-50 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle size={18} className="text-white" />
                  <span className="font-secondary text-sm font-bold text-white">
                    {cardSubmitting ? 'Processing...' : 'Record Payment'}
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
