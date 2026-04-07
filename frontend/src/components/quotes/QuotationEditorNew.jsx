/**
 * QuotationEditorNew.jsx
 * Screen 7 — Quotation Editor (Pencil frame BLDD7)
 * Full quotation builder with sidebar, summary strip, items table,
 * customer section, revenue features, delivery, sales, summary, protection, signature.
 *
 * Sprint 1 wiring: items, customer, totals, metadata via useQuotationState
 * Sprint 2 wiring: product search, customer lookup, save/duplicate/delete/preview/send
 * Sprint 3 wiring: D&I services, quote history, signature pad, expiry, print
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Pencil,
  CloudCheck,
  ShoppingCart,
  Sparkles,
  DollarSign,
  Truck,
  User,
  Receipt,
  Shield,
  PenTool,
  Trash2,
  Copy,
  Eye,
  Printer,
  Mail,
  Send,
  Search,
  History,
  Landmark,
  ShieldCheck,
  ArrowLeftRight,
  Lock,
  X,
  Loader2,
  Calendar,
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { useQuotationState } from '../../hooks/useQuotationState';
import { useToast } from '../ui/Toast';
import { authFetch } from '../../services/authFetch';
import { previewQuotePDF } from '../../services/pdfService';

// ═══════════════════════════════════════════════════════════════
// STATIC DATA (sidebar nav, table headers, quote history stay hardcoded)
// ═══════════════════════════════════════════════════════════════

const tableHeaders = [
  { label: 'Item', width: 'flex-1' },
  { label: 'Qty', width: 'w-14' },
  { label: 'Cost', width: 'w-[90px]' },
  { label: 'MSRP', width: 'w-[90px]' },
  { label: 'Sell Price', width: 'w-[90px]' },
  { label: 'Margin', width: 'w-20' },
  { label: 'Total', width: 'w-[90px]' },
  { label: 'Actions', width: 'w-[70px]' },
];

// Status badge color map for quote history
const statusColorMap = {
  DRAFT: 'bg-secondary text-secondary-foreground',
  SENT: 'bg-info text-info-foreground',
  PENDING: 'bg-warning text-warning-foreground',
  WON: 'bg-success text-success-foreground',
  LOST: 'bg-error text-error-foreground',
  EXPIRED: 'bg-secondary text-muted-foreground',
};

// Format helper
const fmt = (v) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ═══════════════════════════════════════════════════════════════
// REUSABLE FORM HELPERS
// ═══════════════════════════════════════════════════════════════

function InputField({ label, value, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className || 'flex-1'}`}>
      <label className="font-secondary text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        readOnly
        defaultValue={value}
        className="input input-bordered input-sm w-full bg-card font-secondary text-[13px] text-foreground h-10 rounded-lu-md border-border"
      />
    </div>
  );
}

function SelectField({ label, value }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <label className="font-secondary text-xs font-medium text-muted-foreground">{label}</label>
      <select className="select select-bordered select-sm w-full bg-card font-secondary text-[13px] text-foreground h-10 rounded-lu-md border-border">
        <option>{value}</option>
      </select>
    </div>
  );
}

function TextareaField({ label, value }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-secondary text-xs font-medium text-muted-foreground">{label}</label>
      <textarea
        readOnly
        defaultValue={value}
        className="textarea textarea-bordered w-full bg-card font-secondary text-xs text-foreground resize-none h-16 rounded-lu-md border-border"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function QuotationEditorNew() {
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);
  const [depositReq, setDepositReq] = useState(true);

  // ── Sprint 1: Core data wiring ──
  const {
    loading,
    quoteItems,
    selectedCustomer,
    editingQuoteId,
    discountPercent,
    removeItemFromQuote,
    updateItemQuantity,
    updateItemPrice,
    calculateTotals,
    // Sprint 2: additional hook values
    addItemToQuote,
    setSelectedCustomer,
    setEditingQuoteId,
    resetBuilder,
    _deleteQuote,
    customers,
    notes,
    _setNotes,
    internalNotes,
    _setInternalNotes,
    terms,
    _setTerms,
    API_URL,
    // Sprint 3: additional hook values
    SERVICE_ITEMS,
    setQuoteItems,
    fetchCustomerQuotes,
    customerQuotes,
    editQuote,
    hideModelNumbers, setHideModelNumbers,
    watermarkText, setWatermarkText,
    watermarkEnabled, setWatermarkEnabled,
    quoteExpiryDate, setQuoteExpiryDate,
  } = useQuotationState();

  const { success, error: toastError } = useToast();

  const { id: urlQuoteId } = useParams();

  // Load quote from URL param on mount
  useEffect(() => {
    if (urlQuoteId && !editingQuoteId) {
      editQuote({ id: urlQuoteId });
    }
  }, [urlQuoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAndSendBusy = useRef(false);
  const totals = calculateTotals();
  const isEditMode = !!editingQuoteId;
  const quoteNumber = editingQuoteId ? `QT-${editingQuoteId}` : 'New Quote';
  const customerName = selectedCustomer?.name || selectedCustomer?.company || '';

  // Customer initials for avatar
  const customerInitials = customerName
    ? customerName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  // ── Sprint 2: Product Search ──
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productSearching, setProductSearching] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productDebounce = useRef(null);
  const productDropdownRef = useRef(null);
  const productAbortRef = useRef(null);

  const searchProducts = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setProductResults([]);
      setShowProductDropdown(false);
      return;
    }
    if (productAbortRef.current) productAbortRef.current.abort();
    productAbortRef.current = new AbortController();
    setProductSearching(true);
    try {
      const res = await authFetch(`${API_URL}/api/products?search=${encodeURIComponent(query)}&limit=8`, { signal: productAbortRef.current.signal });
      const data = await res.json();
      setProductResults(Array.isArray(data) ? data : data.products || []);
      setShowProductDropdown(true);
    } catch (err) {
      if (err.name !== 'AbortError') setProductResults([]);
    } finally {
      setProductSearching(false);
    }
  }, [API_URL]);

  const handleProductQueryChange = useCallback((e) => {
    const val = e.target.value;
    setProductQuery(val);
    clearTimeout(productDebounce.current);
    productDebounce.current = setTimeout(() => searchProducts(val), 300);
  }, [searchProducts]);

  const handleSelectProduct = useCallback((product) => {
    addItemToQuote(product);
    setProductQuery('');
    setProductResults([]);
    setShowProductDropdown(false);
    success(`Added ${product.model_number || product.name || 'item'} to quote`);
  }, [addItemToQuote, success]);

  // Close product dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Sprint 2: Customer Search ──
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDebounce = useRef(null);
  const customerDropdownRef = useRef(null);
  const customerAbortRef = useRef(null);

  const searchCustomers = useCallback(async (query) => {
    if (!query || query.length < 2) {
      // Show first 6 from cached list if query is short
      setCustomerResults(query.length === 0 ? [] : customers.slice(0, 6));
      setShowCustomerDropdown(query.length > 0);
      return;
    }
    if (customerAbortRef.current) customerAbortRef.current.abort();
    customerAbortRef.current = new AbortController();
    setCustomerSearching(true);
    try {
      const res = await authFetch(`${API_URL}/api/customers?search=${encodeURIComponent(query)}&limit=6`, { signal: customerAbortRef.current.signal });
      const data = await res.json();
      setCustomerResults(Array.isArray(data) ? data : data.customers || []);
      setShowCustomerDropdown(true);
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Fallback to local filter
      const q = query.toLowerCase();
      setCustomerResults(
        customers.filter((c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        ).slice(0, 6)
      );
      setShowCustomerDropdown(true);
    } finally {
      setCustomerSearching(false);
    }
  }, [API_URL, customers]);

  const handleCustomerQueryChange = useCallback((e) => {
    const val = e.target.value;
    setCustomerQuery(val);
    clearTimeout(customerDebounce.current);
    customerDebounce.current = setTimeout(() => searchCustomers(val), 300);
  }, [searchCustomers]);

  const handleSelectCustomer = useCallback((customer) => {
    setSelectedCustomer(customer);
    setCustomerQuery('');
    setCustomerResults([]);
    setShowCustomerDropdown(false);
    success(`Customer set to ${customer.name || customer.company}`);
  }, [setSelectedCustomer, success]);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    success('Customer removed from quote');
  }, [setSelectedCustomer, success]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Sprint 2: Save Draft / Update ──
  const [saving, setSaving] = useState(false);

  const handleSaveDraft = useCallback(async () => {
    if (quoteItems.length === 0) {
      toastError('Add at least one item before saving');
      return;
    }
    if (!selectedCustomer?.id) {
      toastError('Please select a customer before saving');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        items: quoteItems.map((item) => ({
          product_id: item.product_id,
          manufacturer: item.manufacturer,
          model_number: item.model,
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          cost: item.cost,
          sell: item.sell,
          notes: item.notes || '',
          customer_description: item.customer_description || null,
        })),
        discount_percent: discountPercent,
        status: 'DRAFT',
        notes,
        internal_notes: internalNotes,
        terms,
        quote_expiry_date: quoteExpiryDate || null,
        hide_model_numbers: hideModelNumbers,
        watermark_text: watermarkText,
        watermark_enabled: watermarkEnabled,
      };

      if (isEditMode) {
        await authFetch(`${API_URL}/api/quotations/${editingQuoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        success(`Quote ${quoteNumber} updated successfully`);
      } else {
        const res = await authFetch(`${API_URL}/api/quotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const created = await res.json();
        if (created?.id) {
          setEditingQuoteId(created.id);
          success(`Quote QT-${created.id} created as draft`);
        } else {
          success('Quote saved as draft');
        }
      }
    } catch (err) {
      toastError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [quoteItems, selectedCustomer, discountPercent, notes, internalNotes, terms, isEditMode, editingQuoteId, quoteNumber, API_URL, setEditingQuoteId, success, toastError, quoteExpiryDate, hideModelNumbers, watermarkText, watermarkEnabled]);

  // ── Sprint 2: Duplicate ──
  const handleDuplicate = useCallback(async () => {
    if (!editingQuoteId) {
      toastError('Save the quote first before duplicating');
      return;
    }
    try {
      const res = await authFetch(`${API_URL}/api/quotations/${editingQuoteId}/clone`, { method: 'POST' });
      const cloned = await res.json();
      if (cloned?.id) {
        setEditingQuoteId(cloned.id);
        success(`Quote duplicated as QT-${cloned.id}`);
      } else {
        success('Quote duplicated');
      }
    } catch (err) {
      toastError(`Failed to duplicate: ${err.message}`);
    }
  }, [editingQuoteId, API_URL, setEditingQuoteId, success, toastError]);

  // ── Sprint 2: Delete ──
  const handleDelete = useCallback(async () => {
    if (!editingQuoteId) {
      toastError('No saved quote to delete');
      return;
    }
    if (!window.confirm(`Delete quote ${quoteNumber}? This cannot be undone.`)) return;
    try {
      await authFetch(`${API_URL}/api/quotations/${editingQuoteId}`, { method: 'DELETE' });
      resetBuilder();
      success(`Quote ${quoteNumber} deleted`);
    } catch (err) {
      toastError(`Failed to delete: ${err.message}`);
    }
  }, [editingQuoteId, quoteNumber, API_URL, resetBuilder, success, toastError]);

  // ── Sprint 2: Preview PDF ──
  const handlePreviewPDF = useCallback(async () => {
    if (!editingQuoteId) {
      toastError('Save the quote first to preview PDF');
      return;
    }
    try {
      await previewQuotePDF(editingQuoteId);
    } catch (err) {
      toastError(`PDF preview failed: ${err.message}`);
    }
  }, [editingQuoteId, toastError]);

  // ── Sprint 2: Send to Customer ──
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    // Save first if new quote
    if (!editingQuoteId) {
      toastError('Save the quote first before sending');
      return;
    }
    if (!selectedCustomer?.id) {
      toastError('A customer is required to send the quote');
      return;
    }
    setSending(true);
    try {
      await authFetch(`${API_URL}/api/quotations/${editingQuoteId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      });
      success(`Quote ${quoteNumber} sent to ${customerName}`);
    } catch (err) {
      toastError(`Failed to send: ${err.message}`);
    } finally {
      setSending(false);
    }
  }, [editingQuoteId, selectedCustomer, quoteNumber, customerName, API_URL, success, toastError]);

  // ── Sprint 3, Step 1: D&I service toggles ──
  const installItem = SERVICE_ITEMS?.find((s) => s.sku === 'SRV-INS-BAS');
  const haulItem = SERVICE_ITEMS?.find((s) => s.sku === 'SRV-HAL-AWY');

  const isServiceInQuote = useCallback(
    (sku) => quoteItems.some((item) => item.sku === sku || item.model === sku),
    [quoteItems]
  );

  const installReq = isServiceInQuote('SRV-INS-BAS');
  const haulAway = isServiceInQuote('SRV-HAL-AWY');

  const toggleServiceItem = useCallback(
    (serviceItem) => {
      if (!serviceItem) return;
      const sku = serviceItem.sku;
      const exists = quoteItems.some((item) => item.sku === sku || item.model === sku);
      if (exists) {
        setQuoteItems((prev) => prev.filter((item) => item.sku !== sku && item.model !== sku));
      } else {
        setQuoteItems((prev) => [
          ...prev,
          {
            product_id: null,
            sku: serviceItem.sku,
            manufacturer: serviceItem.manufacturer,
            model: serviceItem.sku,
            description: serviceItem.description,
            category: serviceItem.category,
            quantity: 1,
            cost: serviceItem.cost,
            msrp: serviceItem.msrp,
            sell: serviceItem.sell,
            is_service: true,
            notes: '',
          },
        ]);
      }
    },
    [quoteItems, setQuoteItems]
  );

  // D&I total — sum of active service items in quoteItems
  const diTotal = quoteItems
    .filter((item) => item.is_service || item.category === 'Service')
    .reduce((sum, item) => sum + (item.sell || 0) * (item.quantity || 1), 0);

  // ── Sprint 3, Step 2: Quote history for customer ──
  useEffect(() => {
    if (selectedCustomer?.id) {
      fetchCustomerQuotes(selectedCustomer.id);
    }
  }, [selectedCustomer?.id, fetchCustomerQuotes]);

  const handleLoadHistoryQuote = useCallback(
    (quote) => {
      editQuote(quote);
    },
    [editQuote]
  );

  // ── Sprint 3, Step 3: Signature pad ──
  const sigCanvasRef = useRef(null);
  const [existingSignature, setExistingSignature] = useState(null);
  const [signatureSaving, setSignatureSaving] = useState(false);

  // Fetch existing signature when editingQuoteId changes
  useEffect(() => {
    if (!editingQuoteId) {
      setExistingSignature(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/quotations/${editingQuoteId}/signatures`);
        const data = await res.json();
        if (cancelled) return;
        const staff = (data?.signatures || []).find((s) => s.signature_type === 'staff');
        setExistingSignature(staff || null);
      } catch {
        if (!cancelled) setExistingSignature(null);
      }
    })();
    return () => { cancelled = true; };
  }, [editingQuoteId, API_URL]);

  const handleClearSignature = useCallback(() => {
    if (sigCanvasRef.current) sigCanvasRef.current.clear();
    setExistingSignature(null);
  }, []);

  const handleSaveSignature = useCallback(async () => {
    if (!editingQuoteId) {
      toastError('Save the quote first before signing');
      return;
    }
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      toastError('Please draw your signature first');
      return;
    }
    setSignatureSaving(true);
    try {
      const signatureData = sigCanvasRef.current.toDataURL('image/png');
      const res = await authFetch(`${API_URL}/api/quotations/${editingQuoteId}/staff-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_data: signatureData,
          signer_name: 'Staff User',
          legal_text: 'Staff signature acknowledging quote preparation',
        }),
      });
      const result = await res.json();
      setExistingSignature(result?.signature || { signature_data: signatureData, signer_name: 'Staff User' });
      success('Signature saved successfully');
    } catch (err) {
      toastError(`Failed to save signature: ${err.message}`);
    } finally {
      setSignatureSaving(false);
    }
  }, [editingQuoteId, API_URL, success, toastError]);

  // ── Sprint 3, Step 4: Expiry date ──
  // Default: 30 days from today if not set
  useEffect(() => {
    if (!quoteExpiryDate) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setQuoteExpiryDate(d.toISOString().split('T')[0]);
    }
  }, [quoteExpiryDate, setQuoteExpiryDate]);

  // ── Sprint 3, Step 5: Print ──
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Computed summary strip values
  const summaryItems = [
    { label: 'Products', value: fmt(totals.subtotal), color: 'text-foreground' },
    {
      label: 'Discount',
      value: totals.discount > 0 ? `-${fmt(totals.discount)}` : '$0.00',
      color: totals.discount > 0 ? 'text-error-foreground' : 'text-muted-foreground',
    },
    { label: 'Delivery & Install', value: fmt(diTotal), color: diTotal > 0 ? 'text-foreground' : 'text-muted-foreground' },
    { label: 'Warranties', value: '$0.00', color: 'text-muted-foreground' }, // future
    { label: 'HST (13%)', value: fmt(totals.tax), color: 'text-foreground' },
    {
      label: 'Margin',
      value: `${totals.marginPercent.toFixed(1)}%`,
      color:
        totals.marginPercent >= 20
          ? 'text-success-foreground'
          : totals.marginPercent >= 0
            ? 'text-warning-foreground'
            : 'text-error-foreground',
    },
  ];

  // Computed financial breakdown rows
  const financialRows = [
    { label: 'Products Subtotal', value: fmt(totals.subtotal), green: false },
    ...(totals.discount > 0
      ? [{ label: `Discount (${discountPercent}%)`, value: `-${fmt(totals.discount)}`, green: true }]
      : []),
    // Sprint 2 — hardcoded placeholders
    { label: 'Promo (SPRING2026)', value: '-$150.00', green: true },
    { label: 'Delivery & Install', value: '$349.00', green: false },
    { label: 'Extended Warranties', value: '$597.00', green: false },
    { label: 'Trade-In Credit', value: '-$800.00', green: true },
    { label: 'Manufacturer Rebates', value: '-$200.00', green: true },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">

        {/* ─── Edit Mode Banner ─── */}
        <AnimatePresence>
          {isEditMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 44 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between bg-warning px-8 shrink-0 overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-warning-foreground" />
                <span className="font-secondary text-[13px] font-medium text-warning-foreground">
                  Editing Quote {quoteNumber} — Changes will overwrite the existing version
                </span>
              </div>
              <button className="font-primary text-xs font-medium text-warning-foreground hover:underline">
                Cancel Edit
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Top Bar ─── */}
        <div className="flex items-center justify-between bg-card px-8 h-[72px] shrink-0 border-b border-border">
          {/* Left */}
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-lu-pill px-4 h-10 border border-transparent hover:border-border transition-colors"
            >
              <ArrowLeft size={20} className="text-foreground" />
              <span className="font-primary text-sm font-medium text-foreground">Back to List</span>
            </motion.button>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col gap-0.5">
              <span className="font-primary text-[18px] font-semibold text-foreground">Quote Builder</span>
              <span className="font-secondary text-[13px] text-muted-foreground">
                {quoteNumber}{customerName ? `  ·  ${customerName}` : ''}
              </span>
            </div>
            {isEditMode && (
              <span className="bg-warning text-warning-foreground font-secondary text-[11px] font-semibold px-2 py-0.5 rounded-full">
                Editing
              </span>
            )}
          </div>
          {/* Right */}
          <div className="flex items-center gap-2.5 print:hidden">
            <div className="flex items-center gap-1.5 pr-2">
              <CloudCheck size={16} className="text-success-foreground" />
              <span className="font-secondary text-xs text-muted-foreground">Draft saved</span>
            </div>
            <button className="font-primary text-sm font-medium text-foreground px-4 h-10 rounded-lu-pill hover:bg-secondary transition-colors">
              Save Template
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm disabled:opacity-50"
            >
              {saving && <Loader2 size={16} className="text-foreground animate-spin" />}
              <span className="font-primary text-sm font-medium text-foreground">
                {saving ? 'Saving...' : isEditMode ? 'Update Quote' : 'Save Draft'}
              </span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={async () => { if (saveAndSendBusy.current) return; saveAndSendBusy.current = true; try { await handleSaveDraft(); if (editingQuoteId) await handleSend(); } finally { saveAndSendBusy.current = false; } }}
              disabled={saving || sending}
              className="flex items-center gap-1.5 bg-primary rounded-lu-pill px-4 h-10 disabled:opacity-50"
            >
              {sending && <Loader2 size={16} className="text-primary-foreground animate-spin" />}
              <span className="font-primary text-sm font-medium text-primary-foreground">
                {sending ? 'Sending...' : isEditMode ? 'Update & Send' : 'Save & Send'}
              </span>
            </motion.button>
          </div>
        </div>

        {/* ─── Summary Strip ─── */}
        <div className="flex items-center bg-card px-8 h-[72px] shrink-0 border-b border-border gap-8">
          {summaryItems.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className="font-secondary text-[11px] font-medium text-muted-foreground">{s.label}</span>
              <span className={`font-primary text-[16px] font-semibold ${s.color}`}>{s.value}</span>
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-0.5 bg-primary rounded-lu-md px-6 py-2.5">
            <span className="font-secondary text-[11px] font-medium text-primary-foreground">Total</span>
            <span className="font-primary text-[20px] font-bold text-primary-foreground tracking-tight">
              {fmt(totals.total)}
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════
            SCROLLABLE CONTENT
            ═══════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-7">

          {/* ────────────────────────────────────
              1. CUSTOMER SECTION
              ──────────────────────────────────── */}
          <section className="bg-card border border-border shadow-lu-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Search size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">Customer</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedCustomer && (
                  <button
                    onClick={handleClearCustomer}
                    className="font-primary text-sm font-medium text-muted-foreground px-3 h-10 rounded-lu-pill hover:bg-secondary transition-colors"
                  >
                    Clear
                  </button>
                )}
                {/* Customer Search Dropdown */}
                <div ref={customerDropdownRef} className="relative">
                  <div className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-3 h-10 w-[260px]">
                    <Search size={14} className="text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Search customers..."
                      value={customerQuery}
                      onChange={handleCustomerQueryChange}
                      onFocus={() => { if (customerQuery.length >= 2) setShowCustomerDropdown(true); }}
                      className="flex-1 bg-transparent font-secondary text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {customerSearching && <Loader2 size={14} className="text-muted-foreground animate-spin" />}
                  </div>
                  {showCustomerDropdown && customerResults.length > 0 && (
                    <div className="absolute top-full mt-1 right-0 w-[320px] bg-card border border-border rounded-lu-md shadow-lu-lg z-50 max-h-[280px] overflow-y-auto">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left border-b border-border last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <span className="font-secondary text-[10px] font-semibold text-primary-foreground">
                              {(c.name || c.company || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 overflow-hidden">
                            <span className="font-secondary text-[13px] font-medium text-foreground truncate">
                              {c.name || c.company}
                            </span>
                            <span className="font-secondary text-[11px] text-muted-foreground truncate">
                              {[c.email, c.phone].filter(Boolean).join('  ·  ')}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="flex gap-6 p-6">
              {/* Customer Card */}
              <div className="flex-1 bg-background rounded-lu-md border border-border p-5">
                {selectedCustomer ? (
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <span className="font-secondary text-sm font-semibold text-primary-foreground">
                        {customerInitials}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-primary text-[15px] font-semibold text-foreground">
                        {customerName}
                      </span>
                      <span className="font-secondary text-[13px] text-muted-foreground">
                        {[
                          selectedCustomer.contact_name,
                          selectedCustomer.email,
                          selectedCustomer.phone,
                        ].filter(Boolean).join('  ·  ') || 'No contact details'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <User size={20} className="text-muted-foreground" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-primary text-[15px] font-medium text-muted-foreground">
                        No customer selected
                      </span>
                      <span className="font-secondary text-[13px] text-muted-foreground">
                        Search above to assign a customer
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {/* Quote History — wired to customer quotes */}
              <div className="w-[320px] shrink-0 bg-background rounded-lu-md border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <History size={16} className="text-muted-foreground" />
                  <span className="font-primary text-xs font-semibold text-muted-foreground">
                    Quote History ({customerQuotes.length})
                  </span>
                </div>
                {customerQuotes.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <span className="font-secondary text-xs text-muted-foreground">
                      {selectedCustomer ? 'No previous quotes' : 'Select a customer to see history'}
                    </span>
                  </div>
                ) : (
                  customerQuotes.slice(0, 5).map((h, i) => (
                    <button
                      key={h.id}
                      onClick={() => handleLoadHistoryQuote(h)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left ${
                        i < Math.min(customerQuotes.length, 5) - 1 ? 'border-b border-border' : ''
                      }`}
                    >
                      <span className="font-primary text-xs font-medium text-foreground">
                        {h.quote_number || `QT-${h.id}`}
                      </span>
                      <span className="font-secondary text-xs text-foreground">
                        {fmt((h.total_cents || 0) / 100)}
                      </span>
                      <span
                        className={`font-secondary text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          statusColorMap[h.status] || 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {h.status}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* ────────────────────────────────────
              2. QUOTE ITEMS TABLE
              ──────────────────────────────────── */}
          <section className="bg-card border border-border shadow-lu-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">
                  Quote Items ({quoteItems.length})
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                {/* Product Search */}
                <div ref={productDropdownRef} className="relative">
                  <div className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-3 h-10 w-[280px]">
                    <Search size={14} className="text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Search products to add..."
                      value={productQuery}
                      onChange={handleProductQueryChange}
                      onFocus={() => { if (productQuery.length >= 2) setShowProductDropdown(true); }}
                      className="flex-1 bg-transparent font-secondary text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {productSearching && <Loader2 size={14} className="text-muted-foreground animate-spin" />}
                    {productQuery && (
                      <button onClick={() => { setProductQuery(''); setProductResults([]); setShowProductDropdown(false); }}>
                        <X size={14} className="text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>
                  {showProductDropdown && productResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 w-[400px] bg-card border border-border rounded-lu-md shadow-lu-lg z-50 max-h-[320px] overflow-y-auto">
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelectProduct(p)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors text-left border-b border-border last:border-0"
                        >
                          <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                            <span className="font-secondary text-[13px] font-medium text-foreground truncate">
                              {p.model_number || p.name}
                            </span>
                            <span className="font-secondary text-[11px] text-muted-foreground truncate">
                              {[p.manufacturer, p.category].filter(Boolean).join('  ·  ')}
                            </span>
                          </div>
                          <span className="font-primary text-[13px] font-medium text-foreground shrink-0 ml-3">
                            {fmt((p.msrp_cents || 0) / 100)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showProductDropdown && productResults.length === 0 && productQuery.length >= 2 && !productSearching && (
                    <div className="absolute top-full mt-1 left-0 w-[400px] bg-card border border-border rounded-lu-md shadow-lu-lg z-50 px-4 py-6 text-center">
                      <span className="font-secondary text-sm text-muted-foreground">No products found for &quot;{productQuery}&quot;</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {/* Column Headers */}
              <div className="flex border-b border-border">
                {tableHeaders.map((h) => (
                  <div
                    key={h.label}
                    className={`px-3 py-3 font-secondary text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ${h.width}`}
                  >
                    {h.label}
                  </div>
                ))}
              </div>

              {/* Data Rows */}
              {loading ? (
                // Loading skeleton — 4 rows, animate-pulse
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center border-b border-border animate-pulse">
                    <div className="flex-1 px-3 py-4">
                      <div className="h-4 bg-secondary rounded w-3/4" />
                      <div className="h-3 bg-secondary/60 rounded w-1/2 mt-1.5" />
                    </div>
                    <div className="w-14 px-3 py-4"><div className="h-4 bg-secondary rounded w-8" /></div>
                    <div className="w-[90px] px-3 py-4"><div className="h-4 bg-secondary rounded w-14" /></div>
                    <div className="w-[90px] px-3 py-4"><div className="h-4 bg-secondary rounded w-14" /></div>
                    <div className="w-[90px] px-3 py-4"><div className="h-4 bg-secondary rounded w-14" /></div>
                    <div className="w-20 px-3 py-4"><div className="h-4 bg-secondary rounded w-10" /></div>
                    <div className="w-[90px] px-3 py-4"><div className="h-4 bg-secondary rounded w-16" /></div>
                    <div className="w-[70px] px-3 py-4"><div className="h-4 bg-secondary rounded w-8 mx-auto" /></div>
                  </div>
                ))
              ) : quoteItems.length === 0 ? (
                // Empty state
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <ShoppingCart size={40} className="text-muted-foreground" />
                  <span className="font-secondary text-sm text-muted-foreground">No items added yet</span>
                  <span className="font-secondary text-xs text-muted-foreground">
                    Click &quot;Add Item&quot; to start building your quote
                  </span>
                </div>
              ) : (
                quoteItems.map((item, idx) => {
                  const itemMargin = item.sell > 0 ? ((item.sell - item.cost) / item.sell * 100) : 0;
                  const itemTotal = (item.sell || 0) * (item.quantity || 0);
                  const belowCost = item.sell > 0 && item.cost > 0 && item.sell < item.cost;
                  const isService = item.is_service || item.category === 'Service';
                  const marginColor = belowCost
                    ? 'text-error-foreground'
                    : itemMargin >= 20
                      ? 'text-success-foreground'
                      : 'text-warning-foreground';
                  const rowBg = belowCost
                    ? 'bg-error/10'
                    : (itemMargin < 15 && itemMargin >= 0 && !isService)
                      ? 'bg-warning/30'
                      : '';

                  return (
                    <motion.div
                      key={item.product_id || idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex items-center border-b border-border ${rowBg}`}
                    >
                      {/* Item */}
                      <div className="flex-1 px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            {isService && <Truck size={16} className="text-primary" />}
                            <span className="font-secondary text-[13px] font-medium text-foreground">
                              {item.model || item.description || item.manufacturer || 'Unknown Item'}
                            </span>
                          </div>
                          {(item.manufacturer || item.category) && (
                            <div className="flex items-center gap-2">
                              <span className={`font-secondary text-[11px] ${belowCost ? 'text-error-foreground' : 'text-muted-foreground'}`}>
                                {[item.manufacturer, item.category].filter(Boolean).join('  ·  ')}
                              </span>
                              {belowCost && (
                                <span className="bg-error text-error-foreground font-secondary text-[9px] font-bold px-1.5 py-px rounded-lu-sm">
                                  Below cost!
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Qty — editable */}
                      <div className="w-14 px-3 py-3">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(idx, e.target.value)}
                          className="w-full bg-transparent font-secondary text-[13px] text-foreground text-center border-b border-transparent hover:border-border focus:border-primary focus:outline-none"
                        />
                      </div>
                      {/* Cost */}
                      <div className="w-[90px] px-3 py-3 font-secondary text-[13px] text-muted-foreground">
                        {isService ? '—' : fmt(item.cost)}
                      </div>
                      {/* MSRP */}
                      <div className="w-[90px] px-3 py-3 font-secondary text-[13px] text-muted-foreground">
                        {isService ? '—' : fmt(item.msrp)}
                      </div>
                      {/* Sell Price — editable */}
                      <div className="w-[90px] px-3 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={item.sell}
                          onChange={(e) => updateItemPrice(idx, 'sell', e.target.value)}
                          className={`w-full bg-transparent font-primary text-[13px] font-medium text-right border-b border-transparent hover:border-border focus:border-primary focus:outline-none ${belowCost ? 'text-error-foreground font-semibold' : 'text-foreground'}`}
                        />
                      </div>
                      {/* Margin */}
                      <div className={`w-20 px-3 py-3 font-primary text-[13px] font-semibold ${marginColor}`}>
                        {isService ? '—' : `${itemMargin.toFixed(1)}%`}
                      </div>
                      {/* Total */}
                      <div className="w-[90px] px-3 py-3 font-primary text-[13px] font-medium text-foreground">
                        {fmt(itemTotal)}
                      </div>
                      {/* Actions */}
                      <div className="w-[70px] px-3 py-3 flex items-center justify-center gap-2">
                        <Trash2
                          size={18}
                          onClick={() => removeItemFromQuote(idx)}
                          className="text-muted-foreground cursor-pointer hover:text-destructive transition-colors"
                        />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </section>

          {/* ────────────────────────────────────
              3. AI SUGGESTIONS — unchanged (Sprint 3)
              ──────────────────────────────────── */}
          <AnimatePresence>
            {showAiSuggestion && (
              <motion.section
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-4 bg-info rounded-lu-md border border-border px-6 py-4 overflow-hidden"
              >
                <Sparkles size={24} className="text-info-foreground shrink-0" />
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="font-primary text-[13px] font-semibold text-info-foreground">
                    Smart Suggestions — Based on this customer&apos;s history and current items
                  </span>
                  <span className="font-secondary text-xs text-foreground">
                    Consider adding a 5-year extended warranty for the 85&quot; Samsung — 73% of
                    similar quotes include this. Upsell: Sonos Arc soundbar pairs well with these TVs.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="bg-background border border-border rounded-lu-pill px-4 h-10 font-primary text-xs font-medium text-foreground shadow-lu-sm"
                  >
                    View All
                  </motion.button>
                  <button
                    onClick={() => setShowAiSuggestion(false)}
                    className="font-primary text-xs font-medium text-foreground px-4 h-10 rounded-lu-pill hover:bg-background/50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ────────────────────────────────────
              4. REVENUE FEATURES — unchanged (Sprint 2)
              ──────────────────────────────────── */}
          <section className="bg-card border border-border shadow-lu-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">
                  Revenue Features
                </span>
                <span className="bg-success text-success-foreground font-secondary text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <button className="font-primary text-sm font-medium text-foreground px-4 h-10 rounded-lu-pill hover:bg-secondary transition-colors">
                Clear All
              </button>
            </div>
            <div className="flex gap-4 p-6">
              {/* Financing */}
              <div className="flex-1 bg-background rounded-lu-md border border-border p-4 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Landmark size={16} className="text-primary" />
                  <span className="font-primary text-[13px] font-semibold text-foreground">Financing</span>
                </div>
                <span className="font-secondary text-xs text-muted-foreground">
                  9.9% APR  ·  36 months  ·  $428/mo
                </span>
              </div>
              {/* Warranties */}
              <div className="flex-1 bg-background rounded-lu-md border border-border p-4 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-primary" />
                  <span className="font-primary text-[13px] font-semibold text-foreground">Warranties</span>
                </div>
                <span className="font-secondary text-xs text-muted-foreground">
                  5-yr Samsung ($249)  ·  3-yr LG ($149)
                </span>
              </div>
              {/* Trade-Ins */}
              <div className="flex-1 bg-background rounded-lu-md border border-border p-4 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <ArrowLeftRight size={16} className="text-primary" />
                  <span className="font-primary text-[13px] font-semibold text-foreground">Trade-Ins</span>
                </div>
                <span className="font-secondary text-xs text-muted-foreground">
                  Old Samsung 65&quot; — Est. credit: -$350
                </span>
              </div>
            </div>
          </section>

          {/* ────────────────────────────────────
              5. DELIVERY & SALES (side by side) — unchanged (Sprint 2)
              ──────────────────────────────────── */}
          <div className="flex gap-6">
            {/* Delivery & Installation */}
            <section className="flex-1 bg-card border border-border shadow-lu-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
                <Truck size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">
                  Delivery &amp; Installation
                </span>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <InputField label="Delivery Address" value="123 Main Street" />
                <div className="flex gap-4">
                  <InputField label="City" value="Toronto" />
                  <InputField label="Postal Code" value="M5V 2T6" className="w-[140px] shrink-0" />
                </div>
                <div className="flex gap-4">
                  <InputField label="Delivery Date" value="March 15, 2026" />
                  <SelectField label="Time Slot" value="Morning (8am-12pm)" />
                </div>
                <SelectField label="Installation Type" value="Premium Install" />
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={haulAway}
                    onChange={() => toggleServiceItem(haulItem)}
                  />
                  <div className="flex items-center gap-2">
                    <span className="font-secondary text-sm text-foreground">Haul Away Old Appliance</span>
                    {haulItem && (
                      <span className="font-secondary text-[11px] text-muted-foreground">
                        ({fmt(haulItem.sell)})
                      </span>
                    )}
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={installReq}
                    onChange={() => toggleServiceItem(installItem)}
                  />
                  <div className="flex items-center gap-2">
                    <span className="font-secondary text-sm text-foreground">Installation Required</span>
                    {installItem && (
                      <span className="font-secondary text-[11px] text-muted-foreground">
                        ({fmt(installItem.sell)})
                      </span>
                    )}
                  </div>
                </label>
                <TextareaField
                  label="Delivery Instructions"
                  value="Please call 30 minutes before arrival. Use side entrance."
                />
              </div>
            </section>

            {/* Sales Information */}
            <section className="flex-1 bg-card border border-border shadow-lu-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
                <User size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">
                  Sales Information
                </span>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <SelectField label="Sales Representative" value="James Wilson" />
                <div className="flex gap-4">
                  <InputField label="Commission %" value="4.5%" />
                  <SelectField label="Referral Source" value="Walk-in" />
                </div>
                <div className="flex gap-4">
                  <SelectField label="Priority Level" value="Standard" />
                  <SelectField label="Payment Method" value="Financing" />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-3 cursor-pointer h-10">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={depositReq}
                      onChange={() => setDepositReq(!depositReq)}
                    />
                    <span className="font-secondary text-sm text-foreground">Deposit Required</span>
                  </label>
                  <InputField label="Deposit Amount" value="$500.00" />
                </div>
                <TextareaField
                  label="Special Instructions"
                  value="Customer prefers weekend delivery. Finance application pending approval."
                />
              </div>
            </section>
          </div>

          {/* ────────────────────────────────────
              6. QUOTE SUMMARY — financial rows wired, bottom section wired
              ──────────────────────────────────── */}
          <section className="bg-card border border-border shadow-lu-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <Receipt size={20} className="text-muted-foreground" />
              <span className="font-primary text-[15px] font-semibold text-foreground">
                Quote Summary
              </span>
            </div>
            <div className="flex">
              {/* Left — Discounts & Notes */}
              <div className="flex-1 flex flex-col gap-4 p-6 border-r border-border">
                <div className="flex gap-4">
                  <InputField label="Discount %" value="5" />
                  <div className="flex-1 flex items-end gap-2">
                    <InputField label="Promo Code" value="SPRING2026" />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm font-primary text-sm font-medium text-foreground shrink-0"
                    >
                      Apply
                    </motion.button>
                  </div>
                </div>
                <TextareaField
                  label="Customer Notes"
                  value="Thank you for choosing us! Your satisfaction is our top priority."
                />
                {/* Internal Notes (Staff Only) */}
                <div className="bg-[#FEF2F2] rounded-lu-md p-4 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Lock size={14} className="text-error-foreground" />
                    <span className="font-secondary text-[13px] font-semibold text-error-foreground">
                      Internal Notes (Staff Only)
                    </span>
                  </div>
                  <textarea
                    readOnly
                    defaultValue="Customer has outstanding balance of $200. Verify before finalizing."
                    className="w-full bg-white border border-error rounded-lu-md p-3 font-secondary text-xs text-foreground resize-none h-16"
                  />
                </div>
                <SelectField label="Payment Terms" value="Net 30" />
              </div>

              {/* Right — Financial Breakdown (380px) */}
              <div className="w-[380px] shrink-0 flex flex-col gap-3 p-6">
                <span className="font-primary text-sm font-semibold text-foreground">
                  Financial Breakdown
                </span>
                {financialRows.map((r) => (
                  <div key={r.label} className="flex justify-between">
                    <span
                      className={`font-secondary text-[13px] ${
                        r.green ? 'text-success-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {r.label}
                    </span>
                    <span
                      className={`font-primary text-[13px] font-medium ${
                        r.green ? 'text-success-foreground' : 'text-foreground'
                      }`}
                    >
                      {r.value}
                    </span>
                  </div>
                ))}
                {/* Divider */}
                <div className="h-px bg-border" />
                {/* Subtotal */}
                <div className="flex justify-between">
                  <span className="font-secondary text-[13px] font-medium text-foreground">Subtotal</span>
                  <span className="font-primary text-[13px] font-semibold text-foreground">
                    {fmt(totals.afterDiscount)}
                  </span>
                </div>
                {/* HST */}
                <div className="flex justify-between">
                  <span className="font-secondary text-[13px] text-muted-foreground">HST (13%)</span>
                  <span className="font-primary text-[13px] font-medium text-foreground">
                    {fmt(totals.tax)}
                  </span>
                </div>
                {/* Divider */}
                <div className="h-px bg-border" />
                {/* TOTAL Row */}
                <div className="flex items-center justify-between bg-primary rounded-lu-md px-4 py-3">
                  <span className="font-primary text-[16px] font-bold text-white">TOTAL</span>
                  <span className="font-primary text-[20px] font-bold text-white">
                    {fmt(totals.total)}
                  </span>
                </div>
                {/* Monthly */}
                <div className="flex justify-between py-2">
                  <span className="font-secondary text-xs text-muted-foreground">Est. Monthly (60 mo)</span>
                  <span className="font-primary text-xs font-medium text-foreground">
                    {fmt(totals.total / 60)}/mo
                  </span>
                </div>
                {/* Divider */}
                <div className="h-px bg-border" />
                {/* Profit */}
                <div className="flex justify-between">
                  <span className="font-secondary text-[13px] text-muted-foreground">Gross Profit</span>
                  <span className="font-primary text-[13px] font-semibold text-success-foreground">
                    {fmt(totals.grossProfit)}
                  </span>
                </div>
                {/* Margin */}
                <div className="flex justify-between">
                  <span className="font-secondary text-[13px] text-muted-foreground">Margin</span>
                  <span className={`font-primary text-sm font-bold ${
                    totals.marginPercent >= 20
                      ? 'text-success-foreground'
                      : totals.marginPercent >= 0
                        ? 'text-warning-foreground'
                        : 'text-error-foreground'
                  }`}>
                    {totals.marginPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ────────────────────────────────────
              7. PROTECTION & SIGNATURE (side by side) — unchanged (Sprint 2/3)
              ──────────────────────────────────── */}
          <div className="flex gap-6">
            {/* Quote Protection */}
            <section className="flex-1 bg-card border border-border shadow-lu-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
                <Shield size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">
                  Quote Protection
                </span>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={hideModelNumbers}
                    onChange={() => setHideModelNumbers(!hideModelNumbers)}
                  />
                  <span className="font-secondary text-sm text-foreground">
                    Hide Model Numbers on PDF
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={watermarkEnabled}
                    onChange={() => setWatermarkEnabled(!watermarkEnabled)}
                  />
                  <span className="font-secondary text-sm text-foreground">Add PDF Watermark</span>
                </label>
                <div className="flex flex-col gap-1.5">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">Watermark Text</label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    disabled={!watermarkEnabled}
                    className="input input-bordered input-sm w-full bg-card font-secondary text-[13px] text-foreground h-10 rounded-lu-md border-border disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} />
                      Quote Expires
                    </div>
                  </label>
                  <input
                    type="date"
                    value={quoteExpiryDate}
                    onChange={(e) => setQuoteExpiryDate(e.target.value)}
                    className="input input-bordered input-sm w-full bg-card font-secondary text-[13px] text-foreground h-10 rounded-lu-md border-border"
                  />
                </div>
              </div>
            </section>

            {/* Staff Signature */}
            <section className="flex-1 bg-card border border-border shadow-lu-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
                <PenTool size={20} className="text-muted-foreground" />
                <span className="font-primary text-[15px] font-semibold text-foreground">
                  Staff Signature
                </span>
              </div>
              <div className="flex flex-col gap-4 p-6 print:hidden">
                {existingSignature?.signature_data ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-secondary text-xs font-medium text-muted-foreground">Signed by</label>
                      <span className="font-secondary text-sm text-foreground">
                        {existingSignature.signer_name}
                      </span>
                    </div>
                    <div className="bg-background rounded-lu-md border border-border p-2 flex items-center justify-center">
                      <img
                        src={existingSignature.signature_data}
                        alt="Staff signature"
                        className="max-h-[100px] object-contain"
                      />
                    </div>
                    <p className="font-secondary text-[11px] text-muted-foreground">
                      Signed {existingSignature.signed_at ? new Date(existingSignature.signed_at).toLocaleDateString() : ''}
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={handleClearSignature}
                        className="font-primary text-sm font-medium text-foreground px-4 h-10 rounded-lu-pill hover:bg-secondary transition-colors"
                      >
                        Re-sign
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-background rounded-lu-md border border-border overflow-hidden">
                      <SignatureCanvas
                        ref={sigCanvasRef}
                        penColor="#1a1a2e"
                        canvasProps={{
                          className: 'w-full h-[120px]',
                          style: { width: '100%', height: '120px' },
                        }}
                      />
                    </div>
                    <p className="font-secondary text-[11px] leading-relaxed text-muted-foreground">
                      By signing above, I confirm that I am an authorized representative and that this
                      quote has been reviewed for accuracy.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleClearSignature}
                        className="font-primary text-sm font-medium text-foreground px-4 h-10 rounded-lu-pill hover:bg-secondary transition-colors"
                      >
                        Clear
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSaveSignature}
                        disabled={signatureSaving || !editingQuoteId}
                        className="flex items-center gap-1.5 bg-primary rounded-lu-pill px-4 h-10 disabled:opacity-50"
                      >
                        {signatureSaving && <Loader2 size={14} className="text-primary-foreground animate-spin" />}
                        <span className="font-primary text-sm font-medium text-primary-foreground">
                          {signatureSaving ? 'Saving...' : 'Confirm Signature'}
                        </span>
                      </motion.button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* ────────────────────────────────────
              8. ACTION BAR — wired Sprint 2 + print Sprint 3
              ──────────────────────────────────── */}
          <div className="flex items-center justify-between pt-5 border-t border-border print:hidden">
            {/* Left Actions */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleDelete}
                className="flex items-center gap-1.5 bg-destructive rounded-lu-pill px-4 h-10"
              >
                <Trash2 size={16} className="text-foreground" />
                <span className="font-primary text-sm font-medium text-foreground">Delete Quote</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleDuplicate}
                className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
              >
                <Copy size={16} className="text-foreground" />
                <span className="font-primary text-sm font-medium text-foreground">Duplicate</span>
              </motion.button>
            </div>
            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handlePreviewPDF}
                className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
              >
                <Eye size={16} className="text-foreground" />
                <span className="font-primary text-sm font-medium text-foreground">Preview PDF</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
              >
                <Printer size={16} className="text-foreground" />
                <span className="font-primary text-sm font-medium text-foreground">Print</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 bg-secondary rounded-lu-pill px-6 h-12"
              >
                <Mail size={16} className="text-secondary-foreground" />
                <span className="font-primary text-sm font-medium text-secondary-foreground">
                  Email Quote
                </span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-1.5 bg-primary rounded-lu-pill px-6 h-12 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={16} className="text-primary-foreground animate-spin" />
                ) : (
                  <Send size={16} className="text-primary-foreground" />
                )}
                <span className="font-primary text-sm font-medium text-primary-foreground">
                  {sending ? 'Sending...' : 'Send to Customer'}
                </span>
              </motion.button>
            </div>
          </div>

        </div>
    </div>
  );
}
