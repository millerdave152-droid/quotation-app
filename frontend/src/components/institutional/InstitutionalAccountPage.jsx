/**
 * InstitutionalAccountPage — CRM view for a single institutional account
 * Route: /institutional/:profileId
 * Tabs: Overview | Contacts | Delivery Sites | Open Quotes | Invoice History
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Chip, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel, Switch,
  CircularProgress
} from '@mui/material';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';
import { DollarSign, FileText, CreditCard, Calendar } from 'lucide-react';
import StatCard from '../shared/StatCard';

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-CA');
};

const TABS = ['Overview', 'Contacts', 'Delivery Sites', 'Open Quotes', 'Invoice History'];

const PAYMENT_METHODS = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'eft', label: 'EFT' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
];

export default function InstitutionalAccountPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('Overview');
  const [profile, setProfile] = useState(null);
  const [creditStatus, setCreditStatus] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Contact form
  const [contactDialog, setContactDialog] = useState(false);
  const [contactForm, setContactForm] = useState({
    first_name: '', last_name: '', title: '', department: '',
    email: '', phone: '', can_issue_po: false, is_primary: false,
  });

  // Address form
  const [addressDialog, setAddressDialog] = useState(false);
  const [addressForm, setAddressForm] = useState({
    site_name: '', address_line1: '', address_line2: '', city: '',
    province_code: '', postal_code: '', contact_name: '', contact_phone: '', access_notes: '',
  });

  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount_cents: '', payment_method: '', payment_reference: '',
    received_date: new Date().toISOString().slice(0, 10), notes: '',
  });

  // Invoice creation dialog
  const [invoiceDialog, setInvoiceDialog] = useState(false);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState([]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/api/institutional/${profileId}`);
      setProfile(data.data || data);
    } catch {
      toast.error('Failed to load profile');
    }
    setLoading(false);
  }, [profileId, toast]);

  const fetchCredit = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/api/institutional/${profileId}/credit`);
      setCreditStatus(data.data || data);
    } catch { /* silent */ }
  }, [profileId]);

  const fetchInvoices = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/api/institutional/${profileId}/invoices?limit=50`);
      setInvoices((data.data || data).invoices || []);
    } catch { /* silent */ }
  }, [profileId]);

  useEffect(() => {
    fetchProfile();
    fetchCredit();
    fetchInvoices();
  }, [fetchProfile, fetchCredit, fetchInvoices]);

  if (loading || !profile) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <CircularProgress />
      </div>
    );
  }

  // Stats
  const openQuoteValue = (profile.openQuotes || []).reduce((s, q) => s + (q.total_cents || 0), 0);
  const outstandingInvoices = invoices.filter(i => !['paid', 'void'].includes(i.status));
  const outstandingValue = outstandingInvoices.reduce((s, i) => s + (i.total_cents - i.paid_cents), 0);
  const nextDue = outstandingInvoices.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
  const creditPct = creditStatus?.hasLimit ? Math.min(creditStatus.utilizationPct, 100) : 0;

  // Contacts
  const contacts = profile.contacts || [];
  const addresses = profile.addresses || [];
  const openQuotes = profile.openQuotes || [];

  // Handlers
  const addContact = async () => {
    if (!contactForm.first_name || !contactForm.last_name) {
      toast.warning('First and last name required');
      return;
    }
    try {
      await apiClient.post(`/api/institutional/${profileId}/contacts`, contactForm);
      toast.success('Contact added');
      setContactDialog(false);
      setContactForm({ first_name: '', last_name: '', title: '', department: '', email: '', phone: '', can_issue_po: false, is_primary: false });
      fetchProfile();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add contact');
    }
  };

  const addAddress = async () => {
    if (!addressForm.site_name || !addressForm.address_line1 || !addressForm.city || !addressForm.province_code || !addressForm.postal_code) {
      toast.warning('Site name, address, city, province, and postal code required');
      return;
    }
    try {
      await apiClient.post(`/api/institutional/${profileId}/addresses`, addressForm);
      toast.success('Delivery site added');
      setAddressDialog(false);
      setAddressForm({ site_name: '', address_line1: '', address_line2: '', city: '', province_code: '', postal_code: '', contact_name: '', contact_phone: '', access_notes: '' });
      fetchProfile();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add address');
    }
  };

  const createInvoice = async () => {
    if (selectedQuoteIds.length === 0) {
      toast.warning('Select at least one quote');
      return;
    }
    try {
      await apiClient.post('/api/institutional/invoices', {
        profileId: parseInt(profileId),
        quoteIds: selectedQuoteIds,
      });
      toast.success('Invoice created');
      setInvoiceDialog(false);
      setSelectedQuoteIds([]);
      fetchInvoices();
      fetchCredit();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    }
  };

  const recordPayment = async () => {
    const amountCents = Math.round(parseFloat(paymentForm.amount_cents) * 100);
    if (!amountCents || amountCents <= 0 || !paymentForm.payment_method || !paymentForm.received_date) {
      toast.warning('Amount, method, and date required');
      return;
    }
    try {
      await apiClient.post(`/api/institutional/invoices/${paymentDialog.id}/payment`, {
        amount_cents: amountCents,
        payment_method: paymentForm.payment_method,
        payment_reference: paymentForm.payment_reference || null,
        received_date: paymentForm.received_date,
        notes: paymentForm.notes || null,
      });
      toast.success('Payment recorded');
      setPaymentDialog(null);
      fetchInvoices();
      fetchCredit();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    }
  };

  // Row background for invoices
  const getRowBg = (inv) => {
    if (inv.status === 'paid') return '#F0FDF4';
    if (inv.status === 'void') return '#F9FAFB';
    const days = Math.floor((new Date() - new Date(inv.issued_date)) / 86400000);
    if (inv.status === 'overdue' && days > 30) return '#FEF2F2';
    if (inv.status === 'overdue') return '#FFFBEB';
    const dueDate = new Date(inv.due_date);
    if (['issued', 'sent', 'partially_paid'].includes(inv.status) && dueDate <= new Date(Date.now() + 7 * 86400000)) return '#FFF7ED';
    return 'white';
  };

  const tabStyle = (tab) => ({
    padding: '10px 20px', cursor: 'pointer', fontWeight: activeTab === tab ? 700 : 400,
    color: activeTab === tab ? '#1e40af' : '#6b7280',
    borderBottom: activeTab === tab ? '3px solid #1e40af' : '3px solid transparent',
    fontSize: '14px', background: 'none', border: 'none',
    borderBottomStyle: 'solid',
  });

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: 'bold', color: '#1f2937' }}>
              {profile.org_name}
            </h1>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Chip label={profile.org_type.replace('_', ' ')} size="small" color="primary" sx={{ textTransform: 'capitalize' }} />
              <Chip label={profile.payment_terms?.replace('net', 'Net-') || 'Net-30'} size="small" variant="outlined" />
              {profile.vendor_number && <span style={{ fontSize: '13px', color: '#6b7280' }}>Vendor #{profile.vendor_number}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate(`/quotes/new?customerId=${profile.customer_id}`)}
              style={{ padding: '8px 18px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              New Quote
            </button>
            <button onClick={() => setInvoiceDialog(true)}
              style={{ padding: '8px 18px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              Generate Invoice
            </button>
            <button onClick={() => { setPaymentDialog(outstandingInvoices[0] || null); setPaymentForm({ amount_cents: '', payment_method: '', payment_reference: '', received_date: new Date().toISOString().slice(0, 10), notes: '' }); }}
              disabled={outstandingInvoices.length === 0}
              style={{ padding: '8px 18px', background: outstandingInvoices.length > 0 ? '#7c3aed' : '#9ca3af', color: 'white', border: 'none', borderRadius: '6px', cursor: outstandingInvoices.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}>
              Record Payment
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '24px', display: 'flex', gap: '4px' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(tab)}>
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'Overview' && (
          <div>
            {/* Credit bar */}
            {creditStatus && (
              <div style={{ background: 'white', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  <span>Credit Utilization</span>
                  {creditStatus.hasLimit ? (
                    <span>{formatCurrency(creditStatus.usedCents)} / {formatCurrency(creditStatus.limitCents)}</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>No credit limit set</span>
                  )}
                </div>
                {creditStatus.hasLimit && (
                  <LinearProgress variant="determinate" value={creditPct}
                    sx={{ height: 10, borderRadius: 5, '& .MuiLinearProgress-bar': { backgroundColor: creditPct >= 90 ? '#dc2626' : creditPct >= 70 ? '#d97706' : '#3b82f6' } }}
                  />
                )}
              </div>
            )}

            {/* 4 stat boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <StatCard label="Open Quote Value" value={formatCurrency(openQuoteValue)} icon={FileText} iconColor="#3b82f6" />
              <StatCard label="Outstanding Invoices" value={`${outstandingInvoices.length}`} subtitle={formatCurrency(outstandingValue)} subtitleColor="#d97706" icon={DollarSign} iconColor="#d97706" />
              <StatCard label="Credit Available" value={creditStatus?.hasLimit ? formatCurrency(creditStatus.availableCents) : 'N/A'} icon={CreditCard} iconColor="#059669" />
              <StatCard label="Next Payment Due" value={nextDue ? formatDate(nextDue.due_date) : 'None'} subtitle={nextDue ? formatCurrency(nextDue.total_cents - nextDue.paid_cents) : ''} icon={Calendar} iconColor="#7c3aed" />
            </div>

            {/* Customer info */}
            <div style={{ background: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Account Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px', color: '#4b5563' }}>
                <div><strong>Customer:</strong> {profile.customer_name}</div>
                <div><strong>Email:</strong> {profile.email || '-'}</div>
                <div><strong>Phone:</strong> {profile.phone || '-'}</div>
                <div><strong>Requires PO:</strong> {profile.requires_po ? 'Yes' : 'No'}</div>
                <div><strong>Requires Approval:</strong> {profile.requires_quote_approval ? 'Yes' : 'No'}</div>
                {profile.notes && <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {profile.notes}</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Contacts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button onClick={() => setContactDialog(true)}
                style={{ padding: '8px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                Add Contact
              </button>
            </div>
            <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['Name', 'Title', 'Department', 'Email', 'Phone', 'Can Issue PO', 'Primary'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No contacts</td></tr>
                  ) : contacts.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.first_name} {c.last_name}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{c.title || '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{c.department || '-'}</td>
                      <td style={{ padding: '10px 12px' }}>{c.email || '-'}</td>
                      <td style={{ padding: '10px 12px' }}>{c.phone || '-'}</td>
                      <td style={{ padding: '10px 12px' }}>{c.can_issue_po ? <Chip label="Yes" size="small" color="success" /> : '-'}</td>
                      <td style={{ padding: '10px 12px' }}>{c.is_primary ? <Chip label="Primary" size="small" color="primary" /> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Delivery Sites' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button onClick={() => setAddressDialog(true)}
                style={{ padding: '8px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                Add Site
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {addresses.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', background: 'white', borderRadius: '10px' }}>No delivery sites</div>
              ) : addresses.map(addr => (
                <div key={addr.id} style={{ background: 'white', borderRadius: '10px', padding: '18px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{addr.site_name}</h4>
                  <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#4b5563' }}>{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</p>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#4b5563' }}>{addr.city}, {addr.province_code} {addr.postal_code}</p>
                  {addr.contact_name && <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>Contact: {addr.contact_name} {addr.contact_phone ? `\u2022 ${addr.contact_phone}` : ''}</p>}
                  {addr.access_notes && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>{addr.access_notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'Open Quotes' && (
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['Quote #', 'PO Number', 'Total', 'Status', 'Created', 'Terms'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openQuotes.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No open quotes</td></tr>
                ) : openQuotes.map(q => (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onClick={() => navigate(`/quotes/${q.id}`)}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 500, color: '#3b82f6' }}>{q.quotation_number || q.quote_number}</td>
                    <td style={{ padding: '10px 12px' }}>{q.po_number || '-'}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatCurrency(q.total_cents)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Chip label={q.status} size="small" color={q.status === 'WON' ? 'success' : 'default'} sx={{ textTransform: 'capitalize', fontSize: '11px' }} />
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatDate(q.created_at)}</td>
                    <td style={{ padding: '10px 12px' }}>{q.payment_terms?.replace('net', 'Net-') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'Invoice History' && (
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['Invoice #', 'Amount', 'Issued', 'Due', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No invoices</td></tr>
                ) : invoices.map(inv => (
                  <tr key={inv.id} style={{ background: getRowBg(inv), borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 500 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatCurrency(inv.total_cents)}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatDate(inv.issued_date)}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatDate(inv.due_date)}</td>
                    <td style={{ padding: '10px 12px', color: '#059669' }}>{inv.paid_cents > 0 ? formatCurrency(inv.paid_cents) : '-'}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: (inv.total_cents - inv.paid_cents) > 0 ? '#dc2626' : '#059669' }}>
                      {formatCurrency(inv.total_cents - inv.paid_cents)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Chip label={inv.status.replace('_', ' ')} size="small"
                        color={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'error' : inv.status === 'partially_paid' ? 'warning' : 'default'}
                        sx={{ textTransform: 'capitalize', fontSize: '11px' }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {!['paid', 'void'].includes(inv.status) && (
                        <button onClick={() => { setPaymentDialog(inv); setPaymentForm({ amount_cents: '', payment_method: '', payment_reference: '', received_date: new Date().toISOString().slice(0, 10), notes: '' }); }}
                          style={{ padding: '4px 10px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={contactDialog} onClose={() => setContactDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Contact</DialogTitle>
        <DialogContent>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
            <TextField label="First Name" value={contactForm.first_name} onChange={e => setContactForm(f => ({ ...f, first_name: e.target.value }))} required fullWidth />
            <TextField label="Last Name" value={contactForm.last_name} onChange={e => setContactForm(f => ({ ...f, last_name: e.target.value }))} required fullWidth />
            <TextField label="Title" value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} fullWidth />
            <TextField label="Department" value={contactForm.department} onChange={e => setContactForm(f => ({ ...f, department: e.target.value }))} fullWidth />
            <TextField label="Email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} fullWidth />
            <TextField label="Phone" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} fullWidth />
          </div>
          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Switch checked={contactForm.can_issue_po} onChange={e => setContactForm(f => ({ ...f, can_issue_po: e.target.checked }))} size="small" /> Can Issue PO
            </label>
            <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Switch checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} size="small" /> Primary Contact
            </label>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialog(false)}>Cancel</Button>
          <Button onClick={addContact} variant="contained">Add Contact</Button>
        </DialogActions>
      </Dialog>

      {/* Add Address Dialog */}
      <Dialog open={addressDialog} onClose={() => setAddressDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Delivery Site</DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            <TextField label="Site Name" value={addressForm.site_name} onChange={e => setAddressForm(f => ({ ...f, site_name: e.target.value }))} required fullWidth />
            <TextField label="Address Line 1" value={addressForm.address_line1} onChange={e => setAddressForm(f => ({ ...f, address_line1: e.target.value }))} required fullWidth />
            <TextField label="Address Line 2" value={addressForm.address_line2} onChange={e => setAddressForm(f => ({ ...f, address_line2: e.target.value }))} fullWidth />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <TextField label="City" value={addressForm.city} onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))} required />
              <TextField label="Province" value={addressForm.province_code} onChange={e => setAddressForm(f => ({ ...f, province_code: e.target.value.toUpperCase().slice(0, 2) }))} required inputProps={{ maxLength: 2 }} />
              <TextField label="Postal Code" value={addressForm.postal_code} onChange={e => setAddressForm(f => ({ ...f, postal_code: e.target.value }))} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <TextField label="Contact Name" value={addressForm.contact_name} onChange={e => setAddressForm(f => ({ ...f, contact_name: e.target.value }))} />
              <TextField label="Contact Phone" value={addressForm.contact_phone} onChange={e => setAddressForm(f => ({ ...f, contact_phone: e.target.value }))} />
            </div>
            <TextField label="Access Notes" value={addressForm.access_notes} onChange={e => setAddressForm(f => ({ ...f, access_notes: e.target.value }))} multiline rows={2} fullWidth />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddressDialog(false)}>Cancel</Button>
          <Button onClick={addAddress} variant="contained">Add Site</Button>
        </DialogActions>
      </Dialog>

      {/* Invoice Creation Dialog */}
      <Dialog open={invoiceDialog} onClose={() => setInvoiceDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Invoice</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: '14px', color: '#4b5563', marginTop: '8px' }}>
            Select accepted quotes to include on this invoice:
          </p>
          {openQuotes.filter(q => q.status === 'WON').length === 0 ? (
            <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '13px' }}>No accepted (WON) quotes available</p>
          ) : (
            <div style={{ maxHeight: '300px', overflow: 'auto', marginTop: '12px' }}>
              {openQuotes.filter(q => q.status === 'WON').map(q => (
                <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={selectedQuoteIds.includes(q.id)}
                    onChange={(e) => setSelectedQuoteIds(prev => e.target.checked ? [...prev, q.id] : prev.filter(id => id !== q.id))}
                  />
                  <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{q.quotation_number || q.quote_number}</span>
                  <span style={{ color: '#6b7280', fontSize: '13px' }}>{q.po_number ? `PO: ${q.po_number}` : ''}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{formatCurrency(q.total_cents)}</span>
                </label>
              ))}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceDialog(false)}>Cancel</Button>
          <Button onClick={createInvoice} variant="contained" color="success" disabled={selectedQuoteIds.length === 0}>
            Create Invoice
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!paymentDialog} onClose={() => setPaymentDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Record Payment{paymentDialog ? ` \u2014 ${paymentDialog.invoice_number}` : ''}</DialogTitle>
        <DialogContent>
          {paymentDialog && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
              <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
                Balance owing: <strong style={{ color: '#dc2626' }}>{formatCurrency(paymentDialog.total_cents - paymentDialog.paid_cents)}</strong>
              </div>
              <TextField label="Amount ($)" type="number" value={paymentForm.amount_cents}
                onChange={e => setPaymentForm(f => ({ ...f, amount_cents: e.target.value }))}
                inputProps={{ step: '0.01', min: '0.01' }} fullWidth required />
              <FormControl fullWidth required>
                <InputLabel>Payment Method</InputLabel>
                <Select value={paymentForm.payment_method} label="Payment Method"
                  onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Reference / Cheque #" value={paymentForm.payment_reference}
                onChange={e => setPaymentForm(f => ({ ...f, payment_reference: e.target.value }))} fullWidth />
              <TextField label="Received Date" type="date" value={paymentForm.received_date}
                onChange={e => setPaymentForm(f => ({ ...f, received_date: e.target.value }))}
                InputLabelProps={{ shrink: true }} fullWidth required />
              <TextField label="Notes" value={paymentForm.notes}
                onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                multiline rows={2} fullWidth />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(null)}>Cancel</Button>
          <Button onClick={recordPayment} variant="contained" color="success">Record Payment</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
