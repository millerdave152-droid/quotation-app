import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Tabs,
  Tab,
  Card,
  CardContent,
  Divider,
  InputAdornment
} from '@mui/material';
import {
  Receipt,
  Send,
  Payment,
  Visibility,
  Edit,
  Delete,
  Add,
  Refresh,
  Search,
  FilterList,
  Download,
  Email,
  CheckCircle,
  Warning,
  Cancel,
  AttachMoney,
  CreditCard,
  AutoMode,
  AccountBalance
} from '@mui/icons-material';
import axios from 'axios';
import AutoInvoicePanel from './AutoInvoicePanel';
import ARDashboard from './ARDashboard';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:3001') + '/api';

// Create axios instance with auth headers
const api = axios.create({
  baseURL: API_BASE
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA');
};

const StatusChip = ({ status }) => {
  const statusConfig = {
    draft: { color: 'default', label: 'Draft' },
    sent: { color: 'info', label: 'Sent' },
    partially_paid: { color: 'warning', label: 'Partial' },
    paid: { color: 'success', label: 'Paid' },
    void: { color: 'error', label: 'Void' },
    overdue: { color: 'error', label: 'Overdue' }
  };

  const config = statusConfig[status] || { color: 'default', label: status };

  return <Chip label={config.label} color={config.color} size="small" />;
};

const InvoiceSummaryCard = ({ title, value, subtitle, icon, color = 'primary' }) => (
  <Card variant="outlined">
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Box sx={{ color: `${color}.main`, mr: 1 }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 'bold', color: `${color}.main` }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      )}
    </CardContent>
  </Card>
);

const PaymentDialog = ({ open, onClose, invoice, onPaymentRecorded }) => {
  const [paymentData, setPaymentData] = useState({
    amountCents: invoice?.balance_due_cents || 0,
    paymentMethod: 'cash',
    referenceNumber: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (invoice) {
      setPaymentData(prev => ({ ...prev, amountCents: invoice.balance_due_cents }));
    }
  }, [invoice]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      await api.post(`/invoices/${invoice.id}/payments`, paymentData);

      onPaymentRecorded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Payment sx={{ mr: 1, verticalAlign: 'middle' }} />
        Record Payment
      </DialogTitle>
      <DialogContent>
        {invoice && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="subtitle2">Invoice #{invoice.invoice_number}</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Total</Typography>
                <Typography variant="body1">{formatCurrency(invoice.total_cents)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                  {formatCurrency(invoice.balance_due_cents)}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label="Payment Amount"
          type="number"
          value={(paymentData.amountCents / 100).toFixed(2)}
          onChange={(e) => setPaymentData({ ...paymentData, amountCents: Math.round(parseFloat(e.target.value) * 100) })}
          InputProps={{
            startAdornment: <InputAdornment position="start">$</InputAdornment>
          }}
          sx={{ mb: 2 }}
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Payment Method</InputLabel>
          <Select
            value={paymentData.paymentMethod}
            label="Payment Method"
            onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
          >
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="credit_card">Credit Card</MenuItem>
            <MenuItem value="debit">Debit</MenuItem>
            <MenuItem value="cheque">Cheque</MenuItem>
            <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
            <MenuItem value="stripe">Stripe Online</MenuItem>
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label="Reference Number"
          value={paymentData.referenceNumber}
          onChange={(e) => setPaymentData({ ...paymentData, referenceNumber: e.target.value })}
          placeholder="Transaction ID, cheque number, etc."
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="Notes"
          value={paymentData.notes}
          onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
          multiline
          rows={2}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || paymentData.amountCents <= 0}
        >
          {submitting ? <CircularProgress size={24} /> : 'Record Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const InvoiceManager = () => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    status: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [tabValue, setTabValue] = useState(0);
  const [viewMode, setViewMode] = useState('invoices'); // 'invoices' | 'automation' | 'ar'

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, [filters, page, rowsPerPage]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        page: page + 1,
        limit: rowsPerPage
      };

      const response = await api.get('/invoices', { params });
      setInvoices(response.data.invoices || response.data);

      // Calculate summary
      const all = response.data.invoices || response.data;
      setSummary({
        total: all.length,
        paid: all.filter(i => i.status === 'paid').length,
        pending: all.filter(i => ['draft', 'sent', 'partially_paid'].includes(i.status)).length,
        overdue: all.filter(i => i.status === 'overdue').length
      });
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvoice = async (invoiceId) => {
    try {
      await api.post(`/invoices/${invoiceId}/send`);
      fetchInvoices();
    } catch (err) {
      console.error('Error sending invoice:', err);
      setError('Failed to send invoice');
    }
  };

  const handleVoidInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to void this invoice?')) return;

    try {
      await api.post(`/invoices/${invoiceId}/void`, { reason: 'Voided by user' });
      fetchInvoices();
    } catch (err) {
      console.error('Error voiding invoice:', err);
      setError('Failed to void invoice');
    }
  };

  const handleOpenPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentDialogOpen(true);
  };

  const getFilteredInvoices = () => {
    switch (tabValue) {
      case 1: return invoices.filter(i => ['draft', 'sent'].includes(i.status));
      case 2: return invoices.filter(i => i.status === 'partially_paid');
      case 3: return invoices.filter(i => i.status === 'paid');
      case 4: return invoices.filter(i => i.status === 'overdue');
      default: return invoices;
    }
  };

  const filteredInvoices = getFilteredInvoices();

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          <Receipt sx={{ mr: 1, fontSize: 32 }} /> Invoice Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={viewMode === 'invoices' ? 'contained' : 'outlined'}
            startIcon={<Receipt />}
            onClick={() => setViewMode('invoices')}
            size="small"
          >
            Invoices
          </Button>
          <Button
            variant={viewMode === 'automation' ? 'contained' : 'outlined'}
            startIcon={<AutoMode />}
            onClick={() => setViewMode('automation')}
            size="small"
          >
            Automation
          </Button>
          <Button
            variant={viewMode === 'ar' ? 'contained' : 'outlined'}
            startIcon={<AccountBalance />}
            onClick={() => setViewMode('ar')}
            size="small"
          >
            A/R
          </Button>
          {viewMode === 'invoices' && (
            <Button variant="contained" startIcon={<Add />} size="small">
              Create Invoice
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Automation View */}
      {viewMode === 'automation' && <AutoInvoicePanel />}

      {/* A/R View */}
      {viewMode === 'ar' && <ARDashboard />}

      {/* Invoices View */}
      {viewMode === 'invoices' && (
        <>
      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <InvoiceSummaryCard
            title="Total Invoices"
            value={summary.total}
            icon={<Receipt />}
            color="primary"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <InvoiceSummaryCard
            title="Pending"
            value={summary.pending}
            icon={<Warning />}
            color="warning"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <InvoiceSummaryCard
            title="Paid"
            value={summary.paid}
            icon={<CheckCircle />}
            color="success"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <InvoiceSummaryCard
            title="Overdue"
            value={summary.overdue}
            icon={<Cancel />}
            color="error"
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search invoices..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              InputProps={{
                startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                label="Status"
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="sent">Sent</MenuItem>
                <MenuItem value="partially_paid">Partially Paid</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="void">Void</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="From"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="To"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <Button fullWidth variant="outlined" startIcon={<Refresh />} onClick={fetchInvoices}>
              Refresh
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label={`All (${invoices.length})`} />
        <Tab label={`Pending (${summary.pending})`} />
        <Tab label="Partial" />
        <Tab label={`Paid (${summary.paid})`} />
        <Tab label={`Overdue (${summary.overdue})`} />
      </Tabs>

      {/* Invoice Table */}
      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Paid</TableCell>
                    <TableCell align="right">Balance</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No invoices found</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {invoice.invoice_number}
                          </Typography>
                        </TableCell>
                        <TableCell>{invoice.customer_name || '-'}</TableCell>
                        <TableCell><StatusChip status={invoice.status} /></TableCell>
                        <TableCell align="right">{formatCurrency(invoice.total_cents)}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>
                          {formatCurrency(invoice.amount_paid_cents)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: invoice.balance_due_cents > 0 ? 'error.main' : 'success.main' }}>
                          {formatCurrency(invoice.balance_due_cents)}
                        </TableCell>
                        <TableCell>{formatDate(invoice.due_date)}</TableCell>
                        <TableCell>{formatDate(invoice.created_at)}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                            <Tooltip title="View">
                              <IconButton size="small" onClick={() => { setSelectedInvoice(invoice); setViewDialogOpen(true); }}>
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {invoice.status !== 'void' && invoice.status !== 'paid' && (
                              <>
                                <Tooltip title="Record Payment">
                                  <IconButton size="small" color="success" onClick={() => handleOpenPayment(invoice)}>
                                    <Payment fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {invoice.status === 'draft' && (
                                  <Tooltip title="Send Invoice">
                                    <IconButton size="small" color="primary" onClick={() => handleSendInvoice(invoice.id)}>
                                      <Send fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title="Void Invoice">
                                  <IconButton size="small" color="error" onClick={() => handleVoidInvoice(invoice.id)}>
                                    <Cancel fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip title="Download PDF">
                              <IconButton size="small">
                                <Download fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={invoices.length}
              page={page}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            />
          </>
        )}
      </Paper>
        </>
      )}

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        invoice={selectedInvoice}
        onPaymentRecorded={fetchInvoices}
      />

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Invoice Details
        </DialogTitle>
        <DialogContent>
          {selectedInvoice && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Invoice Number</Typography>
                  <Typography variant="h6">{selectedInvoice.invoice_number}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box><StatusChip status={selectedInvoice.status} /></Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Customer</Typography>
                  <Typography variant="body1">{selectedInvoice.customer_name || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Due Date</Typography>
                  <Typography variant="body1">{formatDate(selectedInvoice.due_date)}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Subtotal</Typography>
                  <Typography variant="body1">{formatCurrency(selectedInvoice.subtotal_cents)}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Tax</Typography>
                  <Typography variant="body1">{formatCurrency(selectedInvoice.tax_cents)}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Total</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{formatCurrency(selectedInvoice.total_cents)}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Amount Paid</Typography>
                  <Typography variant="body1" sx={{ color: 'success.main' }}>{formatCurrency(selectedInvoice.amount_paid_cents)}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: selectedInvoice.balance_due_cents > 0 ? 'error.main' : 'success.main' }}>
                    {formatCurrency(selectedInvoice.balance_due_cents)}
                  </Typography>
                </Grid>
              </Grid>

              {selectedInvoice.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary">Notes</Typography>
                  <Typography variant="body2">{selectedInvoice.notes}</Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          {selectedInvoice && selectedInvoice.status !== 'void' && selectedInvoice.status !== 'paid' && (
            <Button variant="contained" startIcon={<Payment />} onClick={() => { setViewDialogOpen(false); handleOpenPayment(selectedInvoice); }}>
              Record Payment
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceManager;
