/**
 * CashPaymentNew.jsx
 * Screen 4 — Checkout: Cash Payment (Pencil frame Ftx7n)
 * Two-panel layout: Left = Order Summary, Right = Cash Payment Flow
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Receipt,
  X,
  ArrowLeft,
  Banknote,
  CheckCircle,
} from 'lucide-react';
import { useCartContext } from '../../context/CartContext';
import { useRegister } from '../../context/RegisterContext';
import { useAuth } from '../../context/AuthContext';
import { createTransaction } from '../../api/transactions';
import { formatCents } from '../../utils/formatCents';

const denominations = [5, 10, 20, 50, 100];

// ─── Component ─────────────────────────────────────────────────

export default function CashPaymentNew() {
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

  const [cashTendered, setCashTendered] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Format dollar values (context stores dollars, formatCents expects cents)
  const fmtDollars = (v) => formatCents((v || 0) * 100);

  const changeDue = Math.max(0, cashTendered - orderTotal);

  // Build quick-amount buttons relative to the real total
  const quickAmounts = (() => {
    const amt = orderTotal || 0;
    const rounded5 = Math.ceil(amt / 5) * 5;
    const rounded10 = Math.ceil(amt / 10) * 10;
    const rounded50 = Math.ceil(amt / 50) * 50;
    const rounded100 = Math.ceil(amt / 100) * 100;
    const seen = new Set();
    const list = [
      { label: `Exact ${fmtDollars(amt)}`, value: amt, isExact: true },
    ];
    seen.add(amt);
    [rounded5, rounded10, rounded50, rounded100].forEach((v) => {
      if (!seen.has(v) && v > amt) {
        seen.add(v);
        list.push({ label: fmtDollars(v), value: v, isExact: false });
      }
    });
    return list.slice(0, 5);
  })();

  const handleQuickAmount = (value) => setCashTendered(value);
  const handleAddDenom = (denom) => setCashTendered((prev) => prev + denom);

  const handleComplete = async () => {
    if (cashTendered < orderTotal) return;
    setSubmitting(true);
    setError(null);

    try {
      const txnData = {
        shiftId: currentShift?.id,
        customerId: customer?.id,
        quoteId: quoteId,
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
          paymentMethod: 'cash',
          amount: orderTotal,
          cashTendered: cashTendered,
          changeGiven: Math.max(0, cashTendered - orderTotal),
        }],
        discountAmount: discountTotal,
        taxProvince: province,
        deliveryFee: deliveryFee,
        fulfillment: selectedFulfillment,
      };

      const result = await createTransaction(txnData);

      if (result.success) {
        clearCart();
        navigate('/checkout/complete', {
          state: {
            transaction: result.data,
            paymentMethod: 'cash',
            cashTendered,
            changeGiven: changeDue,
          },
        });
      } else {
        setError(result.error || 'Transaction failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
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
          <button
            onClick={() => navigate('/checkout')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
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

        {/* Line Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="font-secondary text-sm text-muted-foreground">No items in cart</span>
            </div>
          ) : (
            items.map((item) => {
              const lineTotal = item.price * item.quantity;
              const hasDiscount = item.discountPercent > 0;
              const discountedTotal = hasDiscount
                ? lineTotal * (1 - item.discountPercent / 100)
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
                          -{item.discountPercent}%
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
          <div className="flex justify-between">
            <span className="font-secondary text-xs text-muted-foreground">Subtotal</span>
            <span className="font-secondary text-xs text-foreground">{fmtDollars(subtotalAfterDiscount)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-green-700">Discounts</span>
              <span className="font-secondary text-xs text-green-700">-{fmtDollars(discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="font-secondary text-xs text-muted-foreground">{taxLabel || 'HST (13%)'}</span>
            <span className="font-secondary text-xs text-foreground">{fmtDollars(taxAmount)}</span>
          </div>
          <div className="h-px bg-border my-1" />
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
          RIGHT PANEL — Cash Payment
          ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center gap-6 px-12 py-8 overflow-y-auto">
        {/* Back Button */}
        <div className="w-full max-w-[500px]">
          <motion.button
            onClick={() => navigate('/checkout')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-lu-pill px-4 h-10 border border-transparent hover:border-border transition-colors"
          >
            <ArrowLeft size={20} className="text-foreground" />
            <span className="font-primary text-sm font-medium text-foreground">
              Back to Methods
            </span>
          </motion.button>
        </div>

        {/* Title with Icon */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-14 h-14 rounded-full bg-[#22C55E15] flex items-center justify-center">
            <Banknote size={28} className="text-[#22C55E]" />
          </div>
          <h1 className="font-primary text-lu-2xl font-bold text-foreground">Cash Payment</h1>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="w-full max-w-[500px] bg-red-50 border border-red-200 text-red-700 rounded-lu-md px-4 py-3 font-secondary text-sm">
            {error}
          </div>
        )}

        {/* Quick Amount Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {quickAmounts.map((qa) => (
            <motion.button
              key={qa.label}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleQuickAmount(qa.value)}
              className={`rounded-lu-md px-4 py-2 font-secondary text-xs font-medium transition-colors ${
                qa.isExact
                  ? 'bg-[#22C55E15] text-[#22C55E] font-semibold border border-[#22C55E40]'
                  : 'bg-card text-foreground border border-border hover:bg-secondary'
              }`}
            >
              {qa.label}
            </motion.button>
          ))}
        </div>

        {/* Cash Tendered Input */}
        <div className="flex items-center justify-between w-full max-w-[500px] h-[72px] bg-card rounded-lu-lg border-2 border-primary px-6">
          <span className="font-secondary text-sm text-muted-foreground">Cash Tendered</span>
          <span className="font-primary text-[32px] font-bold text-foreground">
            {fmtDollars(cashTendered)}
          </span>
        </div>

        {/* Change Due */}
        <div className="flex items-center justify-between w-full max-w-[500px] bg-[#22C55E10] rounded-lu-lg border border-[#22C55E30] px-6 py-4">
          <span className="font-secondary text-[16px] font-semibold text-green-700">
            Change Due
          </span>
          <span className="font-primary text-[28px] font-bold text-green-700">
            {fmtDollars(changeDue)}
          </span>
        </div>

        {/* Denomination Add Buttons */}
        <div className="flex items-center gap-2">
          <span className="font-secondary text-xs text-muted-foreground">Add:</span>
          {denominations.map((d) => (
            <motion.button
              key={d}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleAddDenom(d)}
              className="bg-card border border-border rounded-lu-sm px-3 py-1 font-primary text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              +${d}
            </motion.button>
          ))}
        </div>

        {/* Complete Button */}
        <motion.button
          onClick={handleComplete}
          disabled={submitting || cashTendered < orderTotal}
          whileHover={cashTendered >= orderTotal && !submitting ? { scale: 1.02 } : {}}
          whileTap={cashTendered >= orderTotal && !submitting ? { scale: 0.97 } : {}}
          className={`flex items-center justify-center gap-2 w-full max-w-[500px] h-[52px] rounded-lu-lg transition-opacity ${
            cashTendered >= orderTotal && !submitting
              ? 'bg-[#22C55E] cursor-pointer'
              : 'bg-[#22C55E] opacity-50 cursor-not-allowed'
          }`}
        >
          <CheckCircle size={22} className="text-white" />
          <span className="font-secondary text-[16px] font-bold text-white">
            {submitting ? 'Processing...' : 'Complete Cash Payment'}
          </span>
        </motion.button>
      </div>
    </div>
  );
}
