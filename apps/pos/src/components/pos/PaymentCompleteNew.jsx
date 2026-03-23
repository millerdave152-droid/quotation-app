/**
 * PaymentCompleteNew.jsx
 * Screen 6 — Payment Complete (Pencil frame DFDaQ)
 * Full-width success screen: Left = confirmation + receipt actions, Right = sidebar with next steps
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  CheckCircle,
  Printer,
  Mail,
  MessageSquare,
  FileText,
  PlusCircle,
  Truck,
  TrendingUp,
  History,
  ArrowLeftRight,
} from 'lucide-react';
import { useRegister } from '../../context/RegisterContext';
import { useAuth } from '../../context/AuthContext';
import { formatCents } from '../../utils/formatCents';
import api from '../../api/axios';

// ─── Component ─────────────────────────────────────────────────

export default function PaymentCompleteNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { selectedRegister } = useRegister();

  // Transaction data passed from the payment screen
  const txn = location.state?.transaction || {};
  const paymentMethod = location.state?.paymentMethod || 'cash';
  const cashTendered = location.state?.cashTendered;
  const changeGiven = location.state?.changeGiven;

  const [emailSent, setEmailSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);

  const fmtDollars = (v) => formatCents((v || 0) * 100);

  const transactionId = txn.transaction_id || txn.transactionId || txn.id;

  const handlePrintReceipt = () => {
    if (!transactionId) return;
    window.open(`/api/receipts/${transactionId}/pdf`, '_blank');
  };

  const handleEmailReceipt = async () => {
    if (!transactionId) return;
    try {
      await api.post(`/receipts/${transactionId}/email`);
      setEmailSent(true);
    } catch (err) {
      console.error('[PaymentComplete] Email receipt error:', err);
    }
  };

  const handleSmsReceipt = async () => {
    if (!transactionId) return;
    try {
      await api.post(`/receipts/${transactionId}/sms`);
      setSmsSent(true);
    } catch (err) {
      console.error('[PaymentComplete] SMS receipt error:', err);
    }
  };

  const handlePrintSalesOrder = () => {
    if (!transactionId) return;
    window.open(`/api/sales-orders/${transactionId}/view`, '_blank');
  };

  // Derive display values from API response
  const txnNumber = txn.transaction_number || txn.transactionNumber || txn.id || '—';
  const totalAmount = txn.total_amount || txn.totalAmount || txn.total || 0;
  const customerName = txn.customer_name || txn.customerName || txn.customer?.name || '—';
  const registerName = selectedRegister?.name || 'Register';
  const userName = user?.name || user?.firstName || '—';

  // Payment method label
  const methodLabel = (() => {
    if (paymentMethod === 'cash') return 'Cash';
    if (paymentMethod === 'credit') return 'Credit Card';
    if (paymentMethod === 'debit') return 'Debit Card';
    return paymentMethod;
  })();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ══════════════════════════════════════════
          TOP BAR
          ══════════════════════════════════════════ */}
      <div className="flex items-center justify-between bg-card px-6 h-[52px] shrink-0">
        <span className="font-primary text-[16px] font-bold text-primary">TeleTime POS</span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
          <span className="font-secondary text-[13px] text-muted-foreground">
            {registerName} &bull; {userName}
          </span>
        </div>
      </div>
      <div className="h-px bg-border" />

      {/* ══════════════════════════════════════════
          MAIN BODY
          ══════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Panel — Success Confirmation ─── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            className="w-[100px] h-[100px] rounded-full bg-[#22C55E15] flex items-center justify-center"
          >
            <CheckCircle size={56} className="text-[#22C55E]" />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="font-secondary text-[28px] font-bold text-foreground"
          >
            Payment Complete!
          </motion.h1>

          {/* Transaction ID */}
          <span className="font-primary text-sm text-muted-foreground">
            Transaction #{txnNumber}
          </span>

          {/* Amount Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="w-[380px] bg-card rounded-lu-xl border border-border p-6 flex flex-col gap-4"
          >
            {/* Amount */}
            <div className="flex flex-col items-center gap-1">
              <span className="font-secondary text-sm text-muted-foreground">Amount Paid</span>
              <span className="font-primary text-[36px] font-bold text-primary">
                {fmtDollars(totalAmount)}
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Details */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="font-secondary text-[13px] text-muted-foreground">Payment Method</span>
                <span className="font-secondary text-[13px] font-medium text-foreground">{methodLabel}</span>
              </div>
              {paymentMethod === 'cash' && cashTendered != null && (
                <>
                  <div className="flex justify-between">
                    <span className="font-secondary text-[13px] text-muted-foreground">Cash Tendered</span>
                    <span className="font-secondary text-[13px] font-medium text-foreground">{fmtDollars(cashTendered)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-secondary text-[13px] text-muted-foreground">Change Given</span>
                    <span className="font-secondary text-[13px] font-medium text-foreground">{fmtDollars(changeGiven)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="font-secondary text-[13px] text-muted-foreground">Customer</span>
                <span className="font-secondary text-[13px] font-medium text-foreground">{customerName}</span>
              </div>
            </div>
          </motion.div>

          {/* Receipt & Sales Order Buttons */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <motion.button
              onClick={handlePrintReceipt}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
            >
              <Printer size={20} className="text-foreground" />
              <span className="font-primary text-sm font-medium text-foreground">Print Receipt</span>
            </motion.button>
            <motion.button
              onClick={handleEmailReceipt}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
            >
              <Mail size={20} className={emailSent ? 'text-[#22C55E]' : 'text-foreground'} />
              <span className="font-primary text-sm font-medium text-foreground">
                {emailSent ? 'Email Sent' : 'Email Receipt'}
              </span>
            </motion.button>
            <motion.button
              onClick={handleSmsReceipt}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
            >
              <MessageSquare size={20} className={smsSent ? 'text-[#22C55E]' : 'text-foreground'} />
              <span className="font-primary text-sm font-medium text-foreground">
                {smsSent ? 'SMS Sent' : 'SMS Receipt'}
              </span>
            </motion.button>
            <motion.button
              onClick={handlePrintSalesOrder}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
            >
              <FileText size={20} className="text-foreground" />
              <span className="font-primary text-sm font-medium text-foreground">Print Sales Order</span>
            </motion.button>
          </div>
        </div>

        {/* ─── Right Panel — Sidebar (440px) ─── */}
        <div className="w-[440px] shrink-0 bg-card flex flex-col gap-5 p-6 overflow-y-auto">
          {/* What's Next */}
          <span className="font-secondary text-[16px] font-semibold text-foreground">
            What&apos;s Next?
          </span>

          {/* Start New Transaction */}
          <motion.button
            onClick={() => navigate('/pos')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-1.5 bg-primary rounded-lu-pill h-12 w-full"
          >
            <PlusCircle size={24} className="text-primary-foreground" />
            <span className="font-primary text-sm font-medium text-primary-foreground">
              Start New Transaction
            </span>
          </motion.button>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Delivery Scheduled — kept hardcoded, delivery not wired yet */}
          <div className="bg-background rounded-lu-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Truck size={20} className="text-primary" />
              <span className="font-secondary text-sm font-semibold text-foreground">
                Delivery Scheduled
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-muted-foreground">Date</span>
              <span className="font-secondary text-xs font-medium text-foreground">Mar 5, 2026</span>
            </div>
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-muted-foreground">Window</span>
              <span className="font-secondary text-xs font-medium text-foreground">9:00 AM - 12:00 PM</span>
            </div>
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-muted-foreground">Address</span>
              <span className="font-secondary text-xs font-medium text-foreground">123 Main St, Unit 4B, Toronto</span>
            </div>
          </div>

          {/* Commission Earned — kept hardcoded, commissions not wired yet */}
          <div className="bg-background rounded-lu-lg p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-[#22C55E]" />
              <span className="font-secondary text-sm font-semibold text-foreground">
                Commission Earned
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-muted-foreground">This Sale (4.5%)</span>
              <span className="font-primary text-sm font-bold text-[#22C55E]">$302.93</span>
            </div>
            <div className="flex justify-between">
              <span className="font-secondary text-xs text-muted-foreground">Shift Total</span>
              <span className="font-primary text-[13px] font-medium text-foreground">$1,247.50</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Quick Actions */}
          <div className="flex flex-col gap-2">
            <span className="font-secondary text-xs font-medium text-muted-foreground">
              Quick Actions
            </span>
            <motion.button
              onClick={() => navigate('/transactions')}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center justify-center gap-1.5 bg-background border border-border rounded-lu-pill h-10 w-full shadow-lu-sm"
            >
              <History size={20} className="text-foreground" />
              <span className="font-primary text-sm font-medium text-foreground">
                View Transaction History
              </span>
            </motion.button>
            <motion.button
              onClick={() => navigate('/returns')}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center justify-center gap-1.5 bg-background border border-border rounded-lu-pill h-10 w-full shadow-lu-sm"
            >
              <ArrowLeftRight size={20} className="text-foreground" />
              <span className="font-primary text-sm font-medium text-foreground">
                Return / Exchange
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
