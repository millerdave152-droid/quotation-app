import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  LinearProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider
} from '@mui/material';
import {
  AccountBalance,
  TrendingUp,
  TrendingDown,
  Warning,
  CheckCircle,
  Schedule,
  Send,
  Phone,
  Email,
  Refresh,
  FilterList,
  Download,
  Assessment,
  PriorityHigh,
  AttachMoney
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { createAuthorizedClient } from '../../services/apiClient';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:3001') + '/api';

const api = createAuthorizedClient({ baseURL: API_BASE });

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA');
};

const AGING_COLORS = {
  current: '#4caf50',
  '1-30': '#2196f3',
  '31-60': '#ff9800',
  '61-90': '#f44336',
  '90+': '#9c27b0'
};

const StatCard = ({ title, value, subtitle, icon, color = 'primary', trend }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">{title}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 'bold', color: `${color}.main` }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          )}
        </Box>
        <Box sx={{ color: `${color}.main` }}>{icon}</Box>
      </Box>
      {trend !== undefined && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          {trend >= 0 ? (
            <TrendingUp sx={{ fontSize: 16, color: 'error.main', mr: 0.5 }} />
          ) : (
            <TrendingDown sx={{ fontSize: 16, color: 'success.main', mr: 0.5 }} />
          )}
          <Typography variant="caption" color={trend >= 0 ? 'error.main' : 'success.main'}>
            {Math.abs(trend)}% vs last month
          </Typography>
        </Box>
      )}
    </CardContent>
  </Card>
);

const ReminderDialog = ({ open, onClose, invoice, onSend }) => {
  const [template, setTemplate] = useState('friendly');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);

  const templates = {
    friendly: 'This is a friendly reminder that your invoice is due soon.',
    formal: 'Please be advised that payment is now due for the following invoice.',
    urgent: 'This invoice is significantly overdue. Immediate payment is required to avoid further action.',
    final: 'FINAL NOTICE: This account will be sent to collections if payment is not received within 7 days.'
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(invoice.id, { template, customMessage });
      onClose();
    } catch (error) {
      console.error('Failed to send reminder:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Send sx={{ mr: 1, verticalAlign: 'middle' }} />
        Send Payment Reminder
      </DialogTitle>
      <DialogContent>
        {invoice && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="subtitle2">Invoice #{invoice.invoice_number}</Typography>
            <Typography variant="body2" color="text.secondary">{invoice.customer_name}</Typography>
            <Typography variant="h6" sx={{ color: 'error.main', mt: 1 }}>
              Balance Due: {formatCurrency(invoice.balance_due_cents)}
            </Typography>
          </Box>
        )}

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Reminder Template</InputLabel>
          <Select
            value={template}
            label="Reminder Template"
            onChange={(e) => setTemplate(e.target.value)}
          >
            <MenuItem value="friendly">Friendly Reminder</MenuItem>
            <MenuItem value="formal">Formal Notice</MenuItem>
            <MenuItem value="urgent">Urgent Notice</MenuItem>
            <MenuItem value="final">Final Notice</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Preview:</Typography>
          <Typography variant="body2">{templates[template]}</Typography>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={3}
          label="Additional Message (optional)"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={sending}
          startIcon={sending ? <CircularProgress size={20} /> : <Send />}
        >
          Send Reminder
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ARDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  const [summary, setSummary] = useState({
    totalReceivables: 0,
    overdueAmount: 0,
    currentAmount: 0,
    collectedThisMonth: 0,
    overdueCount: 0
  });

  const [agingData, setAgingData] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all invoices for AR analysis
      const response = await api.get('/invoices', {
        params: { limit: 500 }
      });

      const invoices = response.data.invoices || response.data || [];

      // Calculate AR metrics
      const now = new Date();
      let totalReceivables = 0;
      let overdueAmount = 0;
      let currentAmount = 0;
      let collectedThisMonth = 0;
      const overdueList = [];

      // Aging buckets
      const aging = {
        current: 0,
        '1-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0
      };

      invoices.forEach(inv => {
        if (inv.status === 'void' || inv.status === 'paid') {
          // Track collected this month
          if (inv.status === 'paid') {
            const paidDate = new Date(inv.updated_at);
            if (paidDate.getMonth() === now.getMonth() && paidDate.getFullYear() === now.getFullYear()) {
              collectedThisMonth += inv.total_cents || 0;
            }
          }
          return;
        }

        const balance = inv.balance_due_cents || 0;
        if (balance <= 0) return;

        totalReceivables += balance;

        // Calculate days overdue
        const dueDate = new Date(inv.due_date);
        const daysDiff = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 0) {
          currentAmount += balance;
          aging.current += balance;
        } else if (daysDiff <= 30) {
          overdueAmount += balance;
          aging['1-30'] += balance;
          overdueList.push({ ...inv, daysOverdue: daysDiff, agingBucket: '1-30' });
        } else if (daysDiff <= 60) {
          overdueAmount += balance;
          aging['31-60'] += balance;
          overdueList.push({ ...inv, daysOverdue: daysDiff, agingBucket: '31-60' });
        } else if (daysDiff <= 90) {
          overdueAmount += balance;
          aging['61-90'] += balance;
          overdueList.push({ ...inv, daysOverdue: daysDiff, agingBucket: '61-90' });
        } else {
          overdueAmount += balance;
          aging['90+'] += balance;
          overdueList.push({ ...inv, daysOverdue: daysDiff, agingBucket: '90+' });
        }
      });

      setSummary({
        totalReceivables,
        overdueAmount,
        currentAmount,
        collectedThisMonth,
        overdueCount: overdueList.length
      });

      setAgingData([
        { name: 'Current', value: aging.current, color: AGING_COLORS.current },
        { name: '1-30 Days', value: aging['1-30'], color: AGING_COLORS['1-30'] },
        { name: '31-60 Days', value: aging['31-60'], color: AGING_COLORS['31-60'] },
        { name: '61-90 Days', value: aging['61-90'], color: AGING_COLORS['61-90'] },
        { name: '90+ Days', value: aging['90+'], color: AGING_COLORS['90+'] }
      ]);

      // Sort overdue by priority (days overdue * balance)
      overdueList.sort((a, b) => {
        const priorityA = a.daysOverdue * (a.balance_due_cents / 100);
        const priorityB = b.daysOverdue * (b.balance_due_cents / 100);
        return priorityB - priorityA;
      });

      setOverdueInvoices(overdueList);

    } catch (err) {
      console.error('Error loading AR data:', err);
      setError('Failed to load accounts receivable data');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (invoiceId, data) => {
    try {
      await api.post(`/invoices/${invoiceId}/send`, {
        customMessage: `${data.customMessage}\n\nTemplate: ${data.template}`
      });
      // Refresh data
      loadData();
    } catch (err) {
      throw err;
    }
  };

  const getAgingChipColor = (bucket) => {
    const colors = {
      '1-30': 'info',
      '31-60': 'warning',
      '61-90': 'error',
      '90+': 'error'
    };
    return colors[bucket] || 'default';
  };

  const getPriorityScore = (invoice) => {
    // Priority = days overdue * balance (normalized)
    return Math.round((invoice.daysOverdue * (invoice.balance_due_cents / 100)) / 100);
  };

  // Calculate collection rate
  const collectionRate = summary.totalReceivables > 0
    ? Math.round((summary.collectedThisMonth / (summary.totalReceivables + summary.collectedThisMonth)) * 100)
    : 0;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountBalance color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            Accounts Receivable
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Download />} variant="outlined" size="small">
            Export Report
          </Button>
          <Button startIcon={<Refresh />} onClick={loadData} size="small">
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={2.4}>
          <StatCard
            title="Total Receivables"
            value={formatCurrency(summary.totalReceivables)}
            icon={<AttachMoney fontSize="large" />}
            color="primary"
          />
        </Grid>
        <Grid item xs={6} md={2.4}>
          <StatCard
            title="Overdue Amount"
            value={formatCurrency(summary.overdueAmount)}
            subtitle={`${summary.overdueCount} invoices`}
            icon={<Warning fontSize="large" />}
            color="error"
          />
        </Grid>
        <Grid item xs={6} md={2.4}>
          <StatCard
            title="Current"
            value={formatCurrency(summary.currentAmount)}
            subtitle="Not yet due"
            icon={<CheckCircle fontSize="large" />}
            color="success"
          />
        </Grid>
        <Grid item xs={6} md={2.4}>
          <StatCard
            title="Collected (This Month)"
            value={formatCurrency(summary.collectedThisMonth)}
            icon={<TrendingUp fontSize="large" />}
            color="info"
          />
        </Grid>
        <Grid item xs={6} md={2.4}>
          <StatCard
            title="Collection Rate"
            value={`${collectionRate}%`}
            subtitle="This month"
            icon={<Assessment fontSize="large" />}
            color={collectionRate >= 80 ? 'success' : collectionRate >= 60 ? 'warning' : 'error'}
          />
        </Grid>
      </Grid>

      {/* Aging Analysis */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Aging Bar Chart */}
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
              Aging Analysis
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
                <RechartsTooltip
                  formatter={(value) => [formatCurrency(value), 'Amount']}
                />
                <Bar dataKey="value" fill="#8884d8">
                  {agingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Aging Pie Chart */}
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
              Receivables Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={agingData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {agingData.filter(d => d.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label={`Overdue Invoices (${overdueInvoices.length})`} />
        <Tab label="Collection Priority" />
        <Tab label="Reminder Schedule" />
      </Tabs>

      {/* Overdue Invoices Table */}
      {tabValue === 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Invoice #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Due Date</TableCell>
                  <TableCell>Days Overdue</TableCell>
                  <TableCell>Aging</TableCell>
                  <TableCell align="right">Balance Due</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {overdueInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <CheckCircle color="success" sx={{ fontSize: 48, mb: 1 }} />
                      <Typography color="text.secondary">
                        No overdue invoices - great job!
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  overdueInvoices.map((invoice) => (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {invoice.invoice_number}
                        </Typography>
                      </TableCell>
                      <TableCell>{invoice.customer_name || '-'}</TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Schedule fontSize="small" color="error" />
                          {invoice.daysOverdue} days
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={invoice.agingBucket}
                          color={getAgingChipColor(invoice.agingBucket)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                        {formatCurrency(invoice.balance_due_cents)}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Send Reminder">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setReminderDialogOpen(true);
                            }}
                          >
                            <Send fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Call Customer">
                          <IconButton size="small">
                            <Phone fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Collection Priority */}
      {tabValue === 1 && (
        <Paper variant="outlined">
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Priority ranking based on days overdue and balance amount. Focus collection efforts on high-priority items first.
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Priority</TableCell>
                  <TableCell>Invoice #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Days Overdue</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell>Priority Score</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {overdueInvoices.slice(0, 20).map((invoice, index) => {
                  const priority = getPriorityScore(invoice);
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Chip
                          label={`#${index + 1}`}
                          color={index < 3 ? 'error' : index < 10 ? 'warning' : 'default'}
                          size="small"
                          icon={index < 3 ? <PriorityHigh /> : undefined}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>{invoice.customer_name || '-'}</TableCell>
                      <TableCell>{invoice.daysOverdue} days</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                        {formatCurrency(invoice.balance_due_cents)}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(priority, 100)}
                            sx={{ width: 60, height: 8, borderRadius: 1 }}
                            color={priority > 75 ? 'error' : priority > 50 ? 'warning' : 'info'}
                          />
                          <Typography variant="caption">{priority}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Send />}
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setReminderDialogOpen(true);
                          }}
                        >
                          Follow Up
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Reminder Schedule */}
      {tabValue === 2 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
            Automated Reminder Schedule
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="info.main" sx={{ fontWeight: 'bold' }}>
                    7 Days Overdue
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Friendly reminder sent automatically
                  </Typography>
                  <Chip label="Active" color="success" size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="warning.main" sx={{ fontWeight: 'bold' }}>
                    14 Days Overdue
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Formal notice sent automatically
                  </Typography>
                  <Chip label="Active" color="success" size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="error.main" sx={{ fontWeight: 'bold' }}>
                    30 Days Overdue
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Urgent notice requires manual review
                  </Typography>
                  <Chip label="Manual" color="warning" size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Upcoming Automatic Reminders
          </Typography>
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography color="text.secondary" variant="body2">
              {overdueInvoices.filter(i => i.daysOverdue >= 7 && i.daysOverdue < 14).length} invoices will receive friendly reminders
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {overdueInvoices.filter(i => i.daysOverdue >= 14 && i.daysOverdue < 30).length} invoices will receive formal notices
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {overdueInvoices.filter(i => i.daysOverdue >= 30).length} invoices require manual follow-up
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Reminder Dialog */}
      <ReminderDialog
        open={reminderDialogOpen}
        onClose={() => setReminderDialogOpen(false)}
        invoice={selectedInvoice}
        onSend={handleSendReminder}
      />
    </Box>
  );
};

export default ARDashboard;
