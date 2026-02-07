import { authFetch } from '../../services/authFetch';
/**
 * CloneQuoteDialog Component
 * Dialog for cloning a quote with options for customer selection
 */

import React, { useState, useEffect, useMemo } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const CloneQuoteDialog = ({
  isOpen,
  onClose,
  quote,
  customers = [],
  onCloneComplete,
  formatCurrency
}) => {
  const [cloneType, setCloneType] = useState('same'); // 'same' or 'new'
  const [includeInternalNotes, setIncludeInternalNotes] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCloneType('same');
      setIncludeInternalNotes(false);
      setSelectedCustomerId(null);
      setCustomerSearchTerm('');
      setError(null);
    }
  }, [isOpen]);

  // Filter customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return customers.slice(0, 10);
    const search = customerSearchTerm.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search) ||
      (c.company || '').toLowerCase().includes(search) ||
      (c.phone || '').includes(search)
    ).slice(0, 10);
  }, [customers, customerSearchTerm]);

  // Get selected customer details
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  const handleClone = async () => {
    setLoading(true);
    setError(null);

    try {
      // Determine customer ID for clone
      let newCustomerId = null;
      if (cloneType === 'new') {
        if (!selectedCustomerId) {
          setError('Please select a customer for the new quote');
          setLoading(false);
          return;
        }
        newCustomerId = selectedCustomerId;
      }

      const response = await authFetch(`${API_URL}/api/quotations/${quote.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newCustomerId,
          includeInternalNotes,
          clonedBy: 'User'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to clone quote');
      }

      const result = await response.json();

      // Call callback with the new quote
      if (onCloneComplete) {
        onCloneComplete(result.quote, result.message);
      }

      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-dialog-title"
      aria-describedby="clone-dialog-description"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 id="clone-dialog-title" style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
              Clone Quote
            </h2>
            <p id="clone-dialog-description" style={{ margin: '4px 0 0', fontSize: '14px', color: '#6b7280' }}>
              {quote?.quote_number || quote?.quotation_number}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close clone dialog"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px'
            }}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Source Quote Info */}
          <div style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '13px', color: '#0369a1', fontWeight: '500' }}>
              Cloning from: {quote?.quote_number || quote?.quotation_number}
            </div>
            <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '4px' }}>
              {quote?.items?.length || 0} items &bull; {formatCurrency ? formatCurrency(quote?.total_cents || 0) : `$${((quote?.total_cents || 0) / 100).toFixed(2)}`}
            </div>
          </div>

          {/* Clone Type Selection */}
          <fieldset style={{ marginBottom: '20px', border: 'none', padding: 0, margin: 0 }}>
            <legend style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '12px',
              color: '#374151',
              padding: 0
            }}>
              Clone Options
            </legend>

            {/* Same Customer Option */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '12px 16px',
              border: `2px solid ${cloneType === 'same' ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '8px',
              background: cloneType === 'same' ? '#eff6ff' : 'white',
              transition: 'all 0.15s'
            }}>
              <input
                type="radio"
                name="cloneType"
                id="clone-same-customer"
                checked={cloneType === 'same'}
                onChange={() => setCloneType('same')}
                aria-describedby="clone-same-desc"
                style={{ marginTop: '2px', marginRight: '12px' }}
              />
              <div>
                <div style={{ fontWeight: '500', fontSize: '14px' }}>
                  Clone for same customer
                </div>
                <div id="clone-same-desc" style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  Create a revised version for {quote?.customer_name || 'the same customer'}
                </div>
              </div>
            </label>

            {/* New Customer Option */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '12px 16px',
              border: `2px solid ${cloneType === 'new' ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              background: cloneType === 'new' ? '#eff6ff' : 'white',
              transition: 'all 0.15s'
            }}>
              <input
                type="radio"
                name="cloneType"
                id="clone-new-customer"
                checked={cloneType === 'new'}
                onChange={() => setCloneType('new')}
                aria-describedby="clone-new-desc"
                style={{ marginTop: '2px', marginRight: '12px' }}
              />
              <div>
                <div style={{ fontWeight: '500', fontSize: '14px' }}>
                  Clone for different customer
                </div>
                <div id="clone-new-desc" style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  Use this quote as a template for a new customer
                </div>
              </div>
            </label>
          </fieldset>

          {/* Customer Selector (when new customer selected) */}
          {cloneType === 'new' && (
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="customer-search"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px',
                  color: '#374151'
                }}
              >
                Select Customer <span aria-hidden="true">*</span><span className="sr-only">(required)</span>
              </label>
              <input
                id="customer-search"
                type="search"
                placeholder="Search customers by name, email, or phone..."
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                aria-required="true"
                aria-describedby="customer-list-status"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  marginBottom: '8px'
                }}
              />
              <div
                role="listbox"
                aria-label="Customer list"
                id="customer-list-status"
                tabIndex={0}
                style={{
                  maxHeight: '150px',
                  overflowY: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px'
                }}
              >
                {filteredCustomers.length === 0 ? (
                  <div
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      color: '#6b7280',
                      fontSize: '13px'
                    }}
                    role="option"
                    aria-selected="false"
                  >
                    No customers found
                  </div>
                ) : (
                  filteredCustomers.map(customer => (
                    <div
                      key={customer.id}
                      role="option"
                      aria-selected={selectedCustomerId === customer.id}
                      tabIndex={0}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedCustomerId(customer.id);
                        }
                      }}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        background: selectedCustomerId === customer.id ? '#eff6ff' : 'white',
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedCustomerId !== customer.id) {
                          e.currentTarget.style.background = '#f9fafb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedCustomerId !== customer.id) {
                          e.currentTarget.style.background = 'white';
                        }
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {selectedCustomerId === customer.id && (
                          <span style={{ color: '#3b82f6' }} aria-hidden="true">&#10003;</span>
                        )}
                        <div>
                          <div style={{ fontWeight: '500', fontSize: '14px' }}>
                            {customer.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {customer.email || customer.phone || customer.company || 'No contact info'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedCustomer && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  background: '#ecfdf5',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#047857'
                }}>
                  Selected: <strong>{selectedCustomer.name}</strong>
                </div>
              )}
            </div>
          )}

          {/* Include Internal Notes Checkbox */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                id="include-internal-notes"
                checked={includeInternalNotes}
                onChange={(e) => setIncludeInternalNotes(e.target.checked)}
                aria-describedby="internal-notes-desc"
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '14px' }}>
                Include internal notes in cloned quote
              </span>
            </label>
          </div>

          {/* What will be copied */}
          <div style={{
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px'
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              What will be copied:
            </div>
            <ul style={{
              margin: 0,
              paddingLeft: '20px',
              fontSize: '12px',
              color: '#6b7280',
              lineHeight: '1.6'
            }}>
              <li>All line items with quantities and prices</li>
              <li>Delivery options and payment terms</li>
              <li>Customer notes and terms & conditions</li>
              <li>Quote settings (watermark, model hiding)</li>
              {includeInternalNotes && <li>Internal notes</li>}
            </ul>
          </div>

          {/* What will be new */}
          <div style={{
            background: '#fffbeb',
            borderRadius: '8px',
            padding: '12px 16px'
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: '500',
              color: '#92400e',
              marginBottom: '8px'
            }}>
              New quote will have:
            </div>
            <ul style={{
              margin: 0,
              paddingLeft: '20px',
              fontSize: '12px',
              color: '#a16207',
              lineHeight: '1.6'
            }}>
              <li>New quote number (auto-generated)</li>
              <li>Status set to Draft</li>
              <li>Today's date as created date</li>
              <li>Expiry date 30 days from now</li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                marginTop: '16px',
                padding: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '13px'
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
          role="group"
          aria-label="Dialog actions"
        >
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Cancel and close"
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              color: '#374151',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={loading || (cloneType === 'new' && !selectedCustomerId)}
            aria-busy={loading}
            aria-label={loading ? 'Cloning quote...' : 'Clone quote'}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderRadius: '6px',
              background: loading || (cloneType === 'new' && !selectedCustomerId)
                ? '#9ca3af'
                : '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loading || (cloneType === 'new' && !selectedCustomerId)
                ? 'not-allowed'
                : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}
                  aria-hidden="true"
                />
                Cloning...
              </>
            ) : (
              <>Clone Quote</>
            )}
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default CloneQuoteDialog;
