/**
 * TeleTime POS - Refund Processor
 * Shows payment breakdown, calculates refund, and processes it
 */

import { useState, useEffect, useCallback } from 'react';
import { getReturnPaymentInfo, processRefund } from '../../api/returns';

const REFUND_METHODS = [
  { value: 'original_payment', label: 'Original Payment Method', description: 'Refund to the card/method used at purchase' },
  { value: 'store_credit', label: 'Store Credit', description: 'Issue a store credit code the customer can use on future purchases' },
  { value: 'cash', label: 'Cash', description: 'Refund in cash from register' },
  { value: 'gift_card', label: 'Gift Card', description: 'Issue a gift card for the refund amount' },
];

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  credit: 'Credit Card',
  debit: 'Debit Card',
  gift_card: 'Gift Card',
  account: 'Customer Account',
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function RefundProcessor({ returnRecord, transaction, onClose, onComplete }) {
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [refundMethod, setRefundMethod] = useState('original_payment');
  const [restockingFeeCents, setRestockingFeeCents] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [refundResult, setRefundResult] = useState(null);
  const [receiptSending, setReceiptSending] = useState(false);
  const [receiptSent, setReceiptSent] = useState(null); // 'print' | 'email' | 'both'
  const [emailInput, setEmailInput] = useState(transaction?.customer_email || '');

  const fetchPaymentInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getReturnPaymentInfo(returnRecord.id);
    if (result.success) {
      setPaymentInfo(result.data);
    } else {
      setError(result.error || 'Failed to load payment information');
    }
    setLoading(false);
  }, [returnRecord.id]);

  useEffect(() => {
    fetchPaymentInfo();
  }, [fetchPaymentInfo]);

  const hasStripePayments = paymentInfo?.originalPayments?.some(
    p => (p.payment_method === 'credit' || p.payment_method === 'debit') && p.stripe_charge_id
  );

  const refundSubtotalCents = paymentInfo?.refundBreakdown?.subtotalCents || 0;
  const refundTaxCents = paymentInfo?.refundBreakdown?.taxCents || 0;
  const refundTotalCents = refundSubtotalCents + refundTaxCents - restockingFeeCents;

  const formatCents = (cents) => {
    if (cents == null) return '$0.00';
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const handleProcess = async () => {
    if (refundTotalCents <= 0) return;
    setProcessing(true);
    setError(null);

    const result = await processRefund(returnRecord.id, {
      refundMethod,
      restockingFeeCents,
    });

    setProcessing(false);
    if (result.success) {
      setRefundResult(result.data);
      setCompleted(true);
    } else {
      setError(result.error || 'Refund processing failed');
    }
  };

  // --- Receipt handlers ---
  const transactionId = transaction?.id || transaction?.transaction_id;

  const handlePrintReceipt = async () => {
    if (!transactionId) return;
    setReceiptSending(true);
    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/preview`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch receipt');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.addEventListener('load', () => { printWindow.print(); });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setReceiptSent(prev => prev === 'email' ? 'both' : 'print');
    } catch (err) {
      console.error('[Refund] Print receipt error:', err);
    } finally {
      setReceiptSending(false);
    }
  };

  const handleEmailReceipt = async () => {
    if (!transactionId || !emailInput) return;
    setReceiptSending(true);
    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ email: emailInput }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to email receipt');
      setReceiptSent(prev => prev === 'print' ? 'both' : 'email');
    } catch (err) {
      console.error('[Refund] Email receipt error:', err);
    } finally {
      setReceiptSending(false);
    }
  };

  // --- Completed state ---
  if (completed && refundResult) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-900/50 border-2 border-green-500 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Refund Processed</h2>
          <p className="text-slate-400 mb-4">
            {formatCents(refundResult.refundTotalCents)} refunded via {REFUND_METHODS.find(m => m.value === refundResult.refundMethod)?.label || refundResult.refundMethod}
          </p>

          {refundResult.stripeRefundId && (
            <p className="text-xs text-slate-500 mb-4">
              Stripe Refund: {refundResult.stripeRefundId}
            </p>
          )}

          {/* Store credit details */}
          {refundResult.storeCredit && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-4 mb-4 text-left">
              <p className="text-xs text-emerald-400 font-medium mb-2">Store Credit Issued</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-mono text-lg font-bold tracking-wider">{refundResult.storeCredit.code}</span>
                <span className="text-emerald-400 font-bold">{formatCents(refundResult.storeCredit.amountCents)}</span>
              </div>
              <p className="text-xs text-slate-400">Customer can use this code on future purchases</p>
              {transaction.customer_email && (
                <button
                  onClick={() => {
                    // Email functionality placeholder — in production would call email API
                    alert(`Store credit ${refundResult.storeCredit.code} details would be emailed to ${transaction.customer_email}`);
                  }}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Email to {transaction.customer_email}
                </button>
              )}
            </div>
          )}

          {/* Allocation details */}
          {refundResult.allocations?.length > 1 && (
            <div className="bg-slate-900 rounded-lg p-3 mb-4 text-left">
              <p className="text-xs text-slate-400 mb-2 font-medium">Refund Allocations</p>
              {refundResult.allocations.map((a, i) => (
                <div key={i} className="flex justify-between text-sm text-slate-300 py-1">
                  <span>{PAYMENT_METHOD_LABELS[a.method] || a.method}</span>
                  <span>{formatCents(a.amountCents)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Receipt Options */}
          {transactionId && (
            <div className="mb-4">
              <p className="text-xs text-slate-400 mb-2 font-medium">Refund Receipt</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handlePrintReceipt}
                  disabled={receiptSending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {receiptSent === 'print' || receiptSent === 'both' ? 'Printed' : 'Print'}
                </button>
                <div className="flex gap-1">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="customer@email.com"
                    className="w-48 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleEmailReceipt}
                    disabled={receiptSending || !emailInput}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {receiptSent === 'email' || receiptSent === 'both' ? 'Sent' : 'Email'}
                  </button>
                </div>
              </div>
              {receiptSending && (
                <p className="text-xs text-slate-500 mt-2">Sending...</p>
              )}
              {receiptSent && (
                <p className="text-xs text-green-400 mt-2">
                  Receipt {receiptSent === 'both' ? 'printed & emailed' : receiptSent === 'print' ? 'printed' : 'emailed'} successfully
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => onComplete?.(refundResult)}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Loading payment details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Process Refund</h2>
            <p className="text-sm text-slate-400">
              Return {returnRecord.return_number} — Invoice {transaction.transaction_number}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Original Payment Methods */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Original Payment Methods</h3>
            <div className="space-y-2">
              {paymentInfo?.originalPayments?.map(p => (
                <div key={p.payment_id} className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      p.payment_method === 'cash' ? 'bg-green-900/50 text-green-400' :
                      p.payment_method === 'credit' || p.payment_method === 'debit' ? 'bg-blue-900/50 text-blue-400' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {p.payment_method === 'cash' ? '$' : p.payment_method === 'credit' || p.payment_method === 'debit' ? '💳' : '🎁'}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                      </p>
                      {p.card_last_four && (
                        <p className="text-xs text-slate-500">
                          {p.card_brand || 'Card'} ending {p.card_last_four}
                          {p.stripe_charge_id && <span className="ml-1 text-blue-500">(Stripe)</span>}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-white font-medium">${Number(p.amount).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Refund Breakdown */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Refund Breakdown</h3>
            <div className="bg-slate-900 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="text-white">{formatCents(refundSubtotalCents)}</span>
              </div>

              {/* Tax breakdown */}
              {paymentInfo?.refundBreakdown?.hstCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">HST ({paymentInfo.refundBreakdown.taxProvince})</span>
                  <span className="text-white">{formatCents(paymentInfo.refundBreakdown.hstCents)}</span>
                </div>
              )}
              {paymentInfo?.refundBreakdown?.gstCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">GST</span>
                  <span className="text-white">{formatCents(paymentInfo.refundBreakdown.gstCents)}</span>
                </div>
              )}
              {paymentInfo?.refundBreakdown?.pstCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">PST</span>
                  <span className="text-white">{formatCents(paymentInfo.refundBreakdown.pstCents)}</span>
                </div>
              )}
              {!paymentInfo?.refundBreakdown?.hstCents && !paymentInfo?.refundBreakdown?.gstCents && !paymentInfo?.refundBreakdown?.pstCents && refundTaxCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tax</span>
                  <span className="text-white">{formatCents(refundTaxCents)}</span>
                </div>
              )}

              {/* Restocking fee */}
              {paymentInfo?.hasRestockableItems && (
                <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                  <div>
                    <span className="text-slate-400">Restocking Fee</span>
                    <p className="text-xs text-slate-500">Optional for resellable items</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">$</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={(restockingFeeCents / 100).toFixed(2)}
                      onChange={(e) => {
                        const val = Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100));
                        setRestockingFeeCents(Math.min(val, refundSubtotalCents + refundTaxCents));
                      }}
                      className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {restockingFeeCents > 0 && (
                <div className="flex justify-between text-sm text-orange-400">
                  <span>Restocking Fee</span>
                  <span>-{formatCents(restockingFeeCents)}</span>
                </div>
              )}

              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-700">
                <span className="text-white">Refund Total</span>
                <span className="text-green-400">{formatCents(refundTotalCents)}</span>
              </div>
            </div>
          </div>

          {/* Refund Method */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Refund Method</h3>
            <div className="space-y-2">
              {REFUND_METHODS.map(method => {
                // Only show original_payment if there are actual original payments
                if (method.value === 'original_payment' && (!paymentInfo?.originalPayments?.length)) return null;

                return (
                  <label
                    key={method.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      refundMethod === method.value
                        ? 'border-blue-600 bg-blue-900/15'
                        : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="refundMethod"
                      value={method.value}
                      checked={refundMethod === method.value}
                      onChange={() => setRefundMethod(method.value)}
                      className="mt-0.5 w-4 h-4 text-blue-500 border-slate-600 bg-slate-700 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-white text-sm font-medium">{method.label}</p>
                      <p className="text-xs text-slate-500">{method.description}</p>
                      {/* Show warning for Stripe refunds */}
                      {method.value === 'original_payment' && hasStripePayments && (
                        <p className="text-xs text-blue-400 mt-1">
                          Card payments will be refunded via Stripe (5-10 business days)
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Cash refund instruction */}
          {refundMethod === 'cash' && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 text-sm text-amber-200">
              Dispense {formatCents(refundTotalCents)} from register to customer.
            </div>
          )}

          {/* Store credit info */}
          {refundMethod === 'store_credit' && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3 text-sm text-emerald-200">
              <p>A store credit code worth {formatCents(refundTotalCents)} will be generated.</p>
              {transaction.customer_id ? (
                <p className="text-xs text-emerald-400 mt-1">Credit will be linked to the customer's account.</p>
              ) : (
                <p className="text-xs text-emerald-400 mt-1">No customer on this transaction — credit will be unlinked (redeemable by anyone with the code).</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              Refunding {formatCents(refundTotalCents)} via {REFUND_METHODS.find(m => m.value === refundMethod)?.label}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={processing}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleProcess}
                disabled={processing || refundTotalCents <= 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {processing ? 'Processing...' : `Confirm Refund ${formatCents(refundTotalCents)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
