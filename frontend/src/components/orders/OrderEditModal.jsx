/**
 * TeleTime - Order Edit Modal
 *
 * Full-screen modal for editing order line items, adding/removing products,
 * and submitting amendments. Includes product search, live order summary,
 * pending-changes preview, and embedded amendment timeline.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetch } from '../../services/authFetch';
import AmendmentTimeline from './AmendmentTimeline';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// TAX RATES (simplified combined provincial rates for client-side estimates)
// ============================================================================

const TAX_RATES = {
  ON: 0.13, NB: 0.15, NS: 0.15, NL: 0.15, PE: 0.15,
  BC: 0.12, SK: 0.11, MB: 0.12, QC: 0.14975, AB: 0.05,
  NT: 0.05, NU: 0.05, YT: 0.05,
};

// ============================================================================
// HELPERS
// ============================================================================

const fmtMoney = (dollars) => {
  if (dollars == null) return '$0.00';
  return Number(dollars).toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
  });
};

const fmtCents = (cents) => {
  return fmtMoney((parseFloat(cents) || 0) / 100);
};

const toCents = (dollars) => Math.round((parseFloat(dollars) || 0) * 100);
const toDollars = (cents) => ((parseFloat(cents) || 0) / 100).toFixed(2);

// ============================================================================
// STATUS BADGE
// ============================================================================

const orderStatusColors = {
  draft: { bg: '#f3f4f6', text: '#374151' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  processing: { bg: '#e0e7ff', text: '#3730a3' },
  shipped: { bg: '#ccfbf1', text: '#115e59' },
  delivered: { bg: '#dcfce7', text: '#166534' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
  completed: { bg: '#dcfce7', text: '#166534' },
};

function OrderStatusBadge({ status }) {
  const colors = orderStatusColors[status] || orderStatusColors.draft;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

// ============================================================================
// PRODUCT SEARCH DROPDOWN
// ============================================================================

function ProductSearchDropdown({ results, onSelect, loading }) {
  if (!loading && results.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        background: 'white',
        border: '1px solid #d1d5db',
        borderRadius: '0 0 8px 8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        maxHeight: '240px',
        overflowY: 'auto',
        zIndex: 10,
      }}
    >
      {loading ? (
        <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
          Searching products...
        </div>
      ) : (
        results.map((product) => (
          <div
            key={product.id}
            onClick={() => onSelect(product)}
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                {product.name || product.product_name}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                SKU: {product.sku}
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
              {fmtMoney(product.price || product.unit_price || 0)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function OrderEditModal({ orderId, isOpen, onClose, onAmendmentCreated }) {
  const { token, user } = useAuth();

  // Data state
  const [order, setOrder] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [removedItemIds, setRemovedItemIds] = useState(new Set());
  const [addedItems, setAddedItems] = useState([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Product search state
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Determine if current user is admin/manager (can edit prices)
  const canEditPrices = useMemo(() => {
    if (!user) return false;
    const role = (user.role || '').toLowerCase();
    return role === 'admin' || role === 'manager';
  }, [user]);

  // ===========================================================================
  // FETCH ORDER DATA
  // ===========================================================================

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${API_URL}/api/order-modifications/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success && data.data) {
        setOrder(data.data);
        // Initialize editedItems from order items
        const items = (data.data.items || []).map((item) => ({
          ...item,
          originalQuantity: item.quantity,
          originalPriceCents: item.price_cents ?? item.unit_price_cents ?? toCents(item.unit_price || item.price || 0),
          currentQuantity: item.quantity,
          currentPriceCents: item.price_cents ?? item.unit_price_cents ?? toCents(item.unit_price || item.price || 0),
        }));
        setEditedItems(items);
        setRemovedItemIds(new Set());
        setAddedItems([]);
        setReason('');
        setSuccessMessage(null);
      } else {
        setError(data.message || 'Failed to load order data');
      }
    } catch (err) {
      console.error('Failed to fetch order:', err);
      setError('Failed to load order. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrder();
    }
  }, [isOpen, orderId, fetchOrder]);

  // ===========================================================================
  // PRODUCT SEARCH (debounced)
  // ===========================================================================

  useEffect(() => {
    if (!productSearch.trim() || productSearch.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await authFetch(
          `${API_URL}/api/products?search=${encodeURIComponent(productSearch.trim())}&limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.data || data.products || []);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Product search failed:', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [productSearch, token]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchResults([]);
        setSearchLoading(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ===========================================================================
  // ITEM EDIT HANDLERS
  // ===========================================================================

  const handleQuantityChange = useCallback((index, newQty) => {
    const qty = Math.max(1, parseInt(newQty, 10) || 1);
    setEditedItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], currentQuantity: qty };
      return copy;
    });
  }, []);

  const handlePriceChange = useCallback((index, newPrice) => {
    const cents = toCents(newPrice);
    setEditedItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], currentPriceCents: cents };
      return copy;
    });
  }, []);

  const handleRemoveItem = useCallback((itemId) => {
    setRemovedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId); // toggle — un-remove
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleAddProduct = useCallback((product) => {
    const priceCents = toCents(product.price || product.unit_price || 0);
    setAddedItems((prev) => {
      // If already added, increment quantity
      const existing = prev.findIndex((p) => p.productId === product.id);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = { ...copy[existing], quantity: copy[existing].quantity + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name || product.product_name || '',
          sku: product.sku || '',
          priceCents,
          quantity: 1,
        },
      ];
    });
    setProductSearch('');
    setSearchResults([]);
  }, []);

  const handleAddedQuantityChange = useCallback((index, newQty) => {
    const qty = Math.max(1, parseInt(newQty, 10) || 1);
    setAddedItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity: qty };
      return copy;
    });
  }, []);

  const handleAddedPriceChange = useCallback((index, newPrice) => {
    const cents = toCents(newPrice);
    setAddedItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], priceCents: cents };
      return copy;
    });
  }, []);

  const handleRemoveAdded = useCallback((index) => {
    setAddedItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ===========================================================================
  // CALCULATIONS
  // ===========================================================================

  const calculations = useMemo(() => {
    // Subtotal from existing items (not removed, using edited prices/qtys)
    let subtotalCents = 0;
    editedItems.forEach((item) => {
      const itemId = item.id || item.order_item_id;
      if (!removedItemIds.has(itemId)) {
        subtotalCents += item.currentPriceCents * item.currentQuantity;
      }
    });

    // Add new items
    addedItems.forEach((item) => {
      subtotalCents += item.priceCents * item.quantity;
    });

    const subtotal = subtotalCents / 100;

    // Discount from order data (display only)
    const discountCents = order?.discount_cents || order?.discount_amount_cents || 0;
    const discount = discountCents / 100;

    // Tax calculation
    const province = order?.province || order?.billing_province || order?.shipping_province || 'ON';
    const taxRate = TAX_RATES[province.toUpperCase()] || TAX_RATES.ON;
    const taxableAmount = subtotal - discount;
    const tax = Math.max(0, taxableAmount) * taxRate;

    const newTotal = subtotal - discount + tax;

    // Original total from order
    const originalTotalCents = order?.total_cents || order?.total_amount_cents || 0;
    const originalTotal = originalTotalCents / 100;

    const delta = newTotal - originalTotal;

    return { subtotal, discount, tax, taxRate, province, newTotal, originalTotal, delta };
  }, [editedItems, removedItemIds, addedItems, order]);

  // ===========================================================================
  // PENDING CHANGES
  // ===========================================================================

  const pendingChanges = useMemo(() => {
    const changes = [];

    // Modified items
    editedItems.forEach((item) => {
      const itemId = item.id || item.order_item_id;
      if (removedItemIds.has(itemId)) return;
      const qtyChanged = item.currentQuantity !== item.originalQuantity;
      const priceChanged = item.currentPriceCents !== item.originalPriceCents;
      if (qtyChanged || priceChanged) {
        const name = item.product_name || item.name || item.sku || 'Unknown';
        let description = `Modified: ${name}`;
        if (qtyChanged) description += ` qty ${item.originalQuantity} -> ${item.currentQuantity}`;
        if (priceChanged) description += ` price ${fmtCents(item.originalPriceCents)} -> ${fmtCents(item.currentPriceCents)}`;
        changes.push({ type: 'modify', description });
      }
    });

    // Removed items
    editedItems.forEach((item) => {
      const itemId = item.id || item.order_item_id;
      if (removedItemIds.has(itemId)) {
        const name = item.product_name || item.name || item.sku || 'Unknown';
        changes.push({ type: 'remove', description: `Removed: ${name}` });
      }
    });

    // Added items
    addedItems.forEach((item) => {
      changes.push({
        type: 'add',
        description: `Added: ${item.productName || item.sku} x ${item.quantity}`,
      });
    });

    return changes;
  }, [editedItems, removedItemIds, addedItems]);

  const hasChanges = pendingChanges.length > 0;

  // ===========================================================================
  // SUBMIT AMENDMENT
  // ===========================================================================

  const handleSubmit = async () => {
    if (!hasChanges || !reason.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      // Determine amendment type from changes
      const hasModify = pendingChanges.some((c) => c.type === 'modify');
      const hasRemove = pendingChanges.some((c) => c.type === 'remove');
      const hasAdd = pendingChanges.some((c) => c.type === 'add');

      let amendmentType = 'item_modified';
      if (hasAdd && !hasRemove && !hasModify) amendmentType = 'item_added';
      else if (hasRemove && !hasAdd && !hasModify) amendmentType = 'item_removed';

      // Build changes payload
      const modify = [];
      editedItems.forEach((item) => {
        const itemId = item.id || item.order_item_id;
        if (removedItemIds.has(itemId)) return;
        const qtyChanged = item.currentQuantity !== item.originalQuantity;
        const priceChanged = item.currentPriceCents !== item.originalPriceCents;
        if (qtyChanged || priceChanged) {
          modify.push({
            orderItemId: itemId,
            newQuantity: item.currentQuantity,
            newPriceCents: item.currentPriceCents,
          });
        }
      });

      const remove = [...removedItemIds].map((id) => ({ orderItemId: id }));

      const add = addedItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        priceCents: item.priceCents,
      }));

      const body = {
        amendmentType,
        reason: reason.trim(),
        changes: { add, remove, modify },
      };

      const res = await authFetch(`${API_URL}/api/order-modifications/${orderId}/amendments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setSuccessMessage('Amendment submitted successfully.');
        if (onAmendmentCreated) onAmendmentCreated(data.data);
        // Re-fetch order to get updated state
        fetchOrder();
      } else {
        setError(data.message || 'Failed to submit amendment.');
      }
    } catch (err) {
      console.error('Submit amendment failed:', err);
      setError('Failed to submit amendment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ===========================================================================
  // KEYBOARD SHORTCUT: Escape to close
  // ===========================================================================

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Clear success message after 4 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ===========================================================================
  // RENDER GATE
  // ===========================================================================

  if (!isOpen) return null;

  // ===========================================================================
  // RENDER: LOADING
  // ===========================================================================

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#667eea',
              borderRadius: '50%',
              animation: 'orderEditSpin 0.8s linear infinite',
            }}
          />
          <span style={{ marginLeft: '16px', fontSize: '16px', color: '#6b7280' }}>
            Loading order...
          </span>
          <style>{`@keyframes orderEditSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RENDER: ERROR (no order data)
  // ===========================================================================

  if (!order) {
    return (
      <div style={overlayStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px' }}>
          <div style={{ fontSize: '16px', color: '#991b1b', fontWeight: 600 }}>
            {error || 'Order not found'}
          </div>
          <button onClick={onClose} style={cancelButtonStyle}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // DERIVED VALUES
  // ===========================================================================

  const orderNumber = order.order_number || order.quote_number || `#${orderId}`;
  const customerName = order.customer_name || order.client_name || 'Unknown Customer';
  const orderStatus = order.status || 'draft';

  // ===========================================================================
  // RENDER: FULL MODAL
  // ===========================================================================

  return (
    <div style={overlayStyle}>
      {/* ================================================================== */}
      {/* HEADER BAR                                                        */}
      {/* ================================================================== */}
      <div style={headerBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '24px',
              color: '#6b7280',
              padding: '4px 8px',
              borderRadius: '6px',
              lineHeight: 1,
            }}
            title="Close (Esc)"
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            &#x2715;
          </button>

          {/* Title */}
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827' }}>
            Edit Order {orderNumber}
          </h2>

          {/* Customer name */}
          <span style={{ fontSize: '15px', color: '#6b7280', fontWeight: 400 }}>
            {customerName}
          </span>

          {/* Status badge */}
          <OrderStatusBadge status={orderStatus} />
        </div>

        {/* Original total */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Original Total
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
            {fmtMoney(calculations.originalTotal)}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* FEEDBACK MESSAGES                                                  */}
      {/* ================================================================== */}
      {error && (
        <div style={errorBannerStyle}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 600, marginLeft: '12px' }}
          >
            Dismiss
          </button>
        </div>
      )}
      {successMessage && (
        <div style={successBannerStyle}>
          {successMessage}
        </div>
      )}

      {/* ================================================================== */}
      {/* MAIN CONTENT: TWO-COLUMN LAYOUT                                   */}
      {/* ================================================================== */}
      <div style={mainContentStyle}>
        {/* ============================================================== */}
        {/* LEFT PANEL: LINE ITEMS                                         */}
        {/* ============================================================== */}
        <div style={leftPanelStyle}>
          {/* Section heading */}
          <h3 style={sectionHeadingStyle}>Line Items</h3>

          {/* Items table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={thStyle}>SKU</th>
                  <th style={{ ...thStyle, minWidth: '180px' }}>Product</th>
                  <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Qty</th>
                  <th style={{ ...thStyle, width: '120px', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ ...thStyle, width: '110px', textAlign: 'right' }}>Line Total</th>
                  <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {editedItems.map((item, index) => {
                  const itemId = item.id || item.order_item_id;
                  const isRemoved = removedItemIds.has(itemId);
                  const isModified =
                    !isRemoved &&
                    (item.currentQuantity !== item.originalQuantity ||
                      item.currentPriceCents !== item.originalPriceCents);
                  const lineTotal = (item.currentPriceCents * item.currentQuantity) / 100;

                  const rowBg = isRemoved
                    ? '#fef2f2'
                    : isModified
                    ? '#eff6ff'
                    : 'transparent';

                  return (
                    <tr
                      key={itemId || index}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: rowBg,
                        opacity: isRemoved ? 0.5 : 1,
                      }}
                    >
                      {/* SKU */}
                      <td style={{ ...tdStyle, textDecoration: isRemoved ? 'line-through' : 'none' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
                          {item.sku || '-'}
                        </span>
                      </td>

                      {/* Product name */}
                      <td style={{ ...tdStyle, textDecoration: isRemoved ? 'line-through' : 'none' }}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                          {item.product_name || item.name || 'Unknown'}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {isRemoved ? (
                          <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                            {item.originalQuantity}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min={1}
                            value={item.currentQuantity}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            style={numberInputStyle}
                          />
                        )}
                      </td>

                      {/* Unit Price */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {isRemoved ? (
                          <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                            {fmtCents(item.originalPriceCents)}
                          </span>
                        ) : canEditPrices ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={toDollars(item.currentPriceCents)}
                            onChange={(e) => handlePriceChange(index, e.target.value)}
                            style={{ ...numberInputStyle, width: '100px', textAlign: 'right' }}
                          />
                        ) : (
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {fmtCents(item.currentPriceCents)}
                          </span>
                        )}
                      </td>

                      {/* Line Total */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: isRemoved ? '#9ca3af' : '#111827',
                            textDecoration: isRemoved ? 'line-through' : 'none',
                          }}
                        >
                          {fmtMoney(lineTotal)}
                        </span>
                      </td>

                      {/* Remove / Restore button */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleRemoveItem(itemId)}
                          title={isRemoved ? 'Restore item' : 'Remove item'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '18px',
                            color: isRemoved ? '#16a34a' : '#dc2626',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            lineHeight: 1,
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = isRemoved ? '#dcfce7' : '#fee2e2')
                          }
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          {isRemoved ? '\u21A9' : '\u2715'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Added items */}
                {addedItems.map((item, index) => {
                  const lineTotal = (item.priceCents * item.quantity) / 100;
                  return (
                    <tr
                      key={`added-${index}`}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: '#f0fdf4',
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontSize: '12px', color: '#16a34a', fontFamily: 'monospace' }}>
                          {item.sku || '-'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#16a34a' }}>
                          {item.productName || 'New Item'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '8px' }}>NEW</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => handleAddedQuantityChange(index, e.target.value)}
                          style={numberInputStyle}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {canEditPrices ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={toDollars(item.priceCents)}
                            onChange={(e) => handleAddedPriceChange(index, e.target.value)}
                            style={{ ...numberInputStyle, width: '100px', textAlign: 'right' }}
                          />
                        ) : (
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {fmtCents(item.priceCents)}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>
                          {fmtMoney(lineTotal)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleRemoveAdded(index)}
                          title="Remove added item"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '18px',
                            color: '#dc2626',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            lineHeight: 1,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fee2e2')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          &#x2715;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Product search bar */}
          <div style={{ marginTop: '16px', position: 'relative' }} ref={searchContainerRef}>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="+ Search products to add..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                background: '#fafafa',
              }}
            />
            {(searchLoading || searchResults.length > 0) && productSearch.trim().length >= 2 && (
              <ProductSearchDropdown
                results={searchResults}
                onSelect={handleAddProduct}
                loading={searchLoading}
              />
            )}
          </div>

          {/* ============================================================ */}
          {/* PENDING CHANGES SUMMARY                                      */}
          {/* ============================================================ */}
          {pendingChanges.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3 style={sectionHeadingStyle}>Pending Changes</h3>
              <div
                style={{
                  padding: '12px 16px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}
              >
                {pendingChanges.map((change, i) => {
                  const color =
                    change.type === 'add'
                      ? '#16a34a'
                      : change.type === 'remove'
                      ? '#dc2626'
                      : '#2563eb';
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '4px 0',
                        fontSize: '13px',
                        color,
                        fontWeight: 500,
                      }}
                    >
                      {change.type === 'add' && '\u25CF '}
                      {change.type === 'remove' && '\u25CF '}
                      {change.type === 'modify' && '\u25CF '}
                      {change.description}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* RIGHT PANEL: ORDER SUMMARY + AMENDMENT HISTORY                 */}
        {/* ============================================================== */}
        <div style={rightPanelStyle}>
          {/* Order Summary */}
          <div
            style={{
              padding: '20px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <h3 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Order Summary</h3>

            {/* Subtotal */}
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Subtotal</span>
              <span style={summaryValueStyle}>{fmtMoney(calculations.subtotal)}</span>
            </div>

            {/* Discount */}
            {calculations.discount > 0 && (
              <div style={summaryRowStyle}>
                <span style={summaryLabelStyle}>Discount</span>
                <span style={{ ...summaryValueStyle, color: '#dc2626' }}>
                  -{fmtMoney(calculations.discount)}
                </span>
              </div>
            )}

            {/* Tax */}
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>
                Tax ({calculations.province} {(calculations.taxRate * 100).toFixed(calculations.taxRate === 0.14975 ? 3 : 0)}%)
              </span>
              <span style={summaryValueStyle}>{fmtMoney(calculations.tax)}</span>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '2px solid #e5e7eb', margin: '12px 0' }} />

            {/* New Total */}
            <div style={{ ...summaryRowStyle, marginBottom: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>New Total</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                {fmtMoney(calculations.newTotal)}
              </span>
            </div>

            {/* Original Total */}
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Original Total</span>
              <span style={summaryValueStyle}>{fmtMoney(calculations.originalTotal)}</span>
            </div>

            {/* Delta */}
            <div style={{ ...summaryRowStyle, marginTop: '4px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280' }}>Delta</span>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: calculations.delta >= 0 ? '#16a34a' : '#dc2626',
                }}
              >
                {calculations.delta >= 0 ? '+' : ''}
                {fmtMoney(calculations.delta)}
              </span>
            </div>
          </div>

          {/* Amendment History */}
          <div
            style={{
              marginTop: '20px',
              padding: '20px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <h3 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Amendment History</h3>
            <AmendmentTimeline orderId={orderId} />
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* BOTTOM BAR: REASON + ACTIONS                                       */}
      {/* ================================================================== */}
      <div style={bottomBarStyle}>
        <div style={{ flex: 1 }}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the reason for this amendment..."
            rows={2}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', paddingTop: '2px' }}>
          <button
            onClick={handleSubmit}
            disabled={!hasChanges || !reason.trim() || submitting}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: hasChanges && reason.trim() && !submitting ? 'pointer' : 'not-allowed',
              background: hasChanges && reason.trim() && !submitting ? '#4f46e5' : '#d1d5db',
              color: 'white',
              whiteSpace: 'nowrap',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Amendment'}
          </button>
          <button onClick={onClose} style={cancelButtonStyle}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED STYLES
// ============================================================================

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 9999,
  backgroundColor: '#fff',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const headerBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderBottom: '1px solid #e5e7eb',
  background: '#fff',
  position: 'sticky',
  top: 0,
  zIndex: 10,
  flexShrink: 0,
};

const mainContentStyle = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: '24px',
  gap: '24px',
};

const leftPanelStyle = {
  flex: '0 0 60%',
  maxWidth: '60%',
  minWidth: 0,
};

const rightPanelStyle = {
  flex: '0 0 calc(40% - 24px)',
  maxWidth: 'calc(40% - 24px)',
  minWidth: 0,
};

const bottomBarStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
  padding: '16px 24px',
  borderTop: '1px solid #e5e7eb',
  background: '#f9fafb',
  flexShrink: 0,
};

const sectionHeadingStyle = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: '0',
  marginBottom: '12px',
};

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: '14px',
  verticalAlign: 'middle',
};

const numberInputStyle = {
  width: '70px',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
  fontFamily: 'inherit',
  textAlign: 'center',
  background: 'white',
};

const summaryRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
};

const summaryLabelStyle = {
  fontSize: '14px',
  color: '#6b7280',
};

const summaryValueStyle = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#374151',
};

const cancelButtonStyle = {
  padding: '10px 24px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'white',
  color: '#374151',
  whiteSpace: 'nowrap',
};

const errorBannerStyle = {
  padding: '12px 24px',
  background: '#fee2e2',
  color: '#991b1b',
  fontSize: '14px',
  fontWeight: 500,
  borderBottom: '1px solid #fecaca',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
};

const successBannerStyle = {
  padding: '12px 24px',
  background: '#d1fae5',
  color: '#065f46',
  fontSize: '14px',
  fontWeight: 500,
  borderBottom: '1px solid #a7f3d0',
  flexShrink: 0,
};
