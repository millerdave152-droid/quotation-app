import React, { useState, useEffect } from 'react';
import { handleApiError } from '../utils/errorHandler';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const CustomerCreditTracking = ({ customer, onUpdate }) => {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'Cash',
    reference_number: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0]
  });

  // Credit limit form state
  const [creditForm, setCreditForm] = useState({
    credit_limit: customer?.credit_limit || 0,
    payment_terms: customer?.payment_terms || 'Net 30'
  });

  useEffect(() => {
    if (customer?.id) {
      loadPaymentData();
    }
  }, [customer?.id]);

  const loadPaymentData = async () => {
    setLoading(true);
    try {
      const [paymentsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/payments/customer/${customer.id}`),
        fetch(`${API_BASE}/payments/customer/${customer.id}/summary`)
      ]);

      const paymentsData = await paymentsRes.json();
      const summaryData = await summaryRes.json();

      if (paymentsData.success) setPayments(paymentsData.payments);
      if (summaryData.success) setSummary(summaryData.summary);
    } catch (error) {
      handleApiError(error, { context: 'Loading payment data' });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          customer_id: customer.id,
          created_by: 'user'
        })
      });

      const data = await response.json();

      if (data.success) {
        setPaymentForm({
          amount: '',
          payment_method: 'Cash',
          reference_number: '',
          notes: '',
          payment_date: new Date().toISOString().split('T')[0]
        });
        setShowPaymentForm(false);
        loadPaymentData();
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      handleApiError(error, { context: 'Recording payment' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreditLimitUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/payments/customer/${customer.id}/credit-limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creditForm)
      });

      const data = await response.json();

      if (data.success) {
        setShowCreditForm(false);
        loadPaymentData();
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      handleApiError(error, { context: 'Updating credit limit' });
    } finally {
      setLoading(false);
    }
  };

  const getCreditStatusColor = (status) => {
    switch (status) {
      case 'good': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'overlimit': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getCreditStatusText = (status) => {
    switch (status) {
      case 'good': return '✓ Good Standing';
      case 'warning': return '⚠️ Near Limit';
      case 'overlimit': return '❌ Over Limit';
      default: return 'Unknown';
    }
  };

  if (!customer) return null;

  return (
    <div style={{ marginTop: '32px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
          💰 Credit & Payment Tracking
        </h2>
      </div>

      {/* Credit Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Credit Limit</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
            ${summary?.credit_limit?.toLocaleString() || '0.00'}
          </div>
          <button
            onClick={() => setShowCreditForm(!showCreditForm)}
            style={{
              marginTop: '12px',
              padding: '6px 12px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            {showCreditForm ? 'Cancel' : 'Edit Limit'}
          </button>
        </div>

        <div style={{ padding: '20px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Current Balance</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
            ${summary?.current_balance?.toLocaleString() || '0.00'}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            {summary?.payment_count || 0} payments recorded
          </div>
        </div>

        <div style={{ padding: '20px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Available Credit</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
            ${summary?.available_credit?.toLocaleString() || '0.00'}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            {summary?.payment_terms || 'Net 30'}
          </div>
        </div>

        <div style={{ padding: '20px', background: `linear-gradient(135deg, ${getCreditStatusColor(summary?.credit_status)} 0%, ${getCreditStatusColor(summary?.credit_status)}dd 100%)`, borderRadius: '12px', color: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Credit Status</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {getCreditStatusText(summary?.credit_status)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            Total Invoiced: ${summary?.total_invoiced?.toLocaleString() || '0.00'}
          </div>
        </div>
      </div>

      {/* Credit Limit Form */}
      {showCreditForm && (
        <div style={{
          background: '#f3f4f6',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '2px solid #667eea'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            Update Credit Limit
          </h3>
          <form onSubmit={handleCreditLimitUpdate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Credit Limit ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={creditForm.credit_limit}
                onChange={(e) => setCreditForm({...creditForm, credit_limit: e.target.value})}
                required
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Payment Terms
              </label>
              <select
                value={creditForm.payment_terms}
                onChange={(e) => setCreditForm({...creditForm, payment_terms: e.target.value})}
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
                <option value="Due on Receipt">Due on Receipt</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: loading ? '#9ca3af' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Updating...' : 'Update'}
            </button>
          </form>
        </div>
      )}

      {/* Payment Form */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => setShowPaymentForm(!showPaymentForm)}
          style={{
            padding: '12px 24px',
            background: showPaymentForm ? '#6b7280' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          {showPaymentForm ? '✖ Cancel' : '💳 Record Payment'}
        </button>
      </div>

      {showPaymentForm && (
        <div style={{ background: '#f3f4f6', padding: '24px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #10b981' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Record New Payment</h3>
          <form onSubmit={handlePaymentSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                required
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Payment Method</label>
              <select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              >
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Wire Transfer">Wire Transfer</option>
                <option value="PayPal">PayPal</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Payment Date</label>
              <input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                required
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Reference Number</label>
              <input
                type="text"
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm({...paymentForm, reference_number: e.target.value})}
                placeholder="Check #, Transaction ID, etc."
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Notes</label>
              <textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                rows="3"
                placeholder="Additional payment notes..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '12px 32px',
                  background: loading ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              >
                {loading ? 'Recording...' : `💸 Record Payment of $${paymentForm.amount || '0.00'}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment History */}
      <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '2px solid #e5e7eb' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
          📜 Payment History ({payments.length})
        </h3>

        {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>Loading...</div>}

        {!loading && payments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No payments recorded yet
          </div>
        )}

        {!loading && payments.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Amount</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Method</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Reference</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Quote</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#10b981' }}>
                      ${parseFloat(payment.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      {payment.payment_method}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', fontFamily: 'monospace', color: '#6b7280' }}>
                      {payment.reference_number || '—'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      {payment.quote_number || payment.quotation_number || '—'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#6b7280', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {payment.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerCreditTracking;
