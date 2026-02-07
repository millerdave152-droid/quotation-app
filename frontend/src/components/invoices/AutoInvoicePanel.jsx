import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Grid,
  TextField,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  Collapse,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Settings,
  AutoMode,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
  ExpandMore,
  ExpandLess,
  TrendingUp,
  Receipt,
  Send,
  Schedule
} from '@mui/icons-material';
import { createAuthorizedClient } from '../../services/apiClient';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:3001') + '/api';

const api = createAuthorizedClient({ baseURL: API_BASE });

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const StatCard = ({ title, value, subtitle, icon, color = 'primary' }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
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

const AutoInvoicePanel = () => {
  const [settings, setSettings] = useState({
    enabled: false,
    triggerOnQuoteWon: true,
    triggerOnOrderCreated: false,
    triggerOnOrderShipped: false,
    defaultPaymentTermsDays: 30,
    autoSendEmail: false,
    includePaymentLink: false,
    notifyOnGeneration: true
  });
  const [stats, setStats] = useState(null);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [settingsRes, statsRes, recentRes] = await Promise.all([
        api.get('/invoices/auto-invoice/settings'),
        api.get('/invoices/auto-invoice/stats'),
        api.get('/invoices/auto-invoice/recent')
      ]);

      setSettings(settingsRes.data.data);
      setStats(statsRes.data.data);
      setRecentInvoices(recentRes.data.data);
    } catch (err) {
      console.error('Error loading auto-invoice data:', err);
      setError('Failed to load auto-invoice settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setError(null);

      await api.put('/invoices/auto-invoice/settings', settings);

      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSettingChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoMode color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Auto-Invoice Generation
          </Typography>
          <Chip
            label={settings.enabled ? 'Active' : 'Inactive'}
            color={settings.enabled ? 'success' : 'default'}
            size="small"
          />
        </Box>
        <Button
          startIcon={<Refresh />}
          onClick={loadData}
          size="small"
        >
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatCard
              title="Auto-Generated (30d)"
              value={stats.successfulCount}
              icon={<Receipt />}
              color="primary"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard
              title="Total Invoiced"
              value={formatCurrency(stats.totalInvoicedCents)}
              icon={<TrendingUp />}
              color="success"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard
              title="From Quotes"
              value={stats.quoteTriggeredCount}
              icon={<CheckCircle />}
              color="info"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard
              title="Failed"
              value={stats.failedCount}
              icon={<ErrorIcon />}
              color={stats.failedCount > 0 ? 'error' : 'default'}
            />
          </Grid>
        </Grid>
      )}

      {/* Settings Panel */}
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            cursor: 'pointer',
            bgcolor: 'grey.50'
          }}
          onClick={() => setSettingsExpanded(!settingsExpanded)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Settings fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              Configuration
            </Typography>
          </Box>
          <IconButton size="small">
            {settingsExpanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>

        <Collapse in={settingsExpanded}>
          <Box sx={{ p: 2 }}>
            {/* Master Enable Switch */}
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enabled}
                  onChange={(e) => handleSettingChange('enabled', e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    Enable Auto-Invoice Generation
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Automatically create invoices based on trigger events
                  </Typography>
                </Box>
              }
              sx={{ mb: 2 }}
            />

            <Divider sx={{ my: 2 }} />

            {/* Triggers Section */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
              Trigger Events
            </Typography>
            <Box sx={{ ml: 2, mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.triggerOnQuoteWon}
                    onChange={(e) => handleSettingChange('triggerOnQuoteWon', e.target.checked)}
                    disabled={!settings.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Quote Accepted (WON)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Generate invoice when a quote status changes to WON
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.triggerOnOrderCreated}
                    onChange={(e) => handleSettingChange('triggerOnOrderCreated', e.target.checked)}
                    disabled={!settings.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Order Created</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Generate invoice when a new order is created
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.triggerOnOrderShipped}
                    onChange={(e) => handleSettingChange('triggerOnOrderShipped', e.target.checked)}
                    disabled={!settings.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Order Shipped</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Generate invoice when an order is marked as shipped
                    </Typography>
                  </Box>
                }
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Invoice Settings */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
              Invoice Settings
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Default Payment Terms (days)"
                  value={settings.defaultPaymentTermsDays}
                  onChange={(e) => handleSettingChange('defaultPaymentTermsDays', parseInt(e.target.value) || 30)}
                  disabled={!settings.enabled}
                  inputProps={{ min: 0, max: 365 }}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Email Settings */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
              Email & Notifications
            </Typography>
            <Box sx={{ ml: 2, mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoSendEmail}
                    onChange={(e) => handleSettingChange('autoSendEmail', e.target.checked)}
                    disabled={!settings.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Auto-Send Invoice Email</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Automatically send invoice to customer after generation
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.includePaymentLink}
                    onChange={(e) => handleSettingChange('includePaymentLink', e.target.checked)}
                    disabled={!settings.enabled || !settings.autoSendEmail}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Include Payment Link</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Add Stripe payment link to invoice emails
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifyOnGeneration}
                    onChange={(e) => handleSettingChange('notifyOnGeneration', e.target.checked)}
                    disabled={!settings.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Notify on Generation</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Send notification when invoice is auto-generated
                    </Typography>
                  </Box>
                }
              />
            </Box>

            {/* Save Button */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="contained"
                onClick={handleSaveSettings}
                disabled={saving}
              >
                {saving ? <CircularProgress size={24} /> : 'Save Settings'}
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Recent Auto-Invoices */}
      <Paper variant="outlined">
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            cursor: 'pointer',
            bgcolor: 'grey.50'
          }}
          onClick={() => setRecentExpanded(!recentExpanded)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Schedule fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              Recent Auto-Generated Invoices
            </Typography>
            <Chip label={recentInvoices.length} size="small" />
          </Box>
          <IconButton size="small">
            {recentExpanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>

        <Collapse in={recentExpanded}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Invoice #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Generated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">
                        No auto-generated invoices yet
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  recentInvoices.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        {row.error_message ? (
                          <Tooltip title={row.error_message}>
                            <Typography color="error" sx={{ fontSize: '0.875rem' }}>
                              Failed
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                            {row.invoice_number}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{row.customer_name || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.trigger_type === 'quote_won' ? 'Quote Won' :
                                 row.trigger_type === 'order_created' ? 'Order' :
                                 row.trigger_type}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {row.total_cents ? formatCurrency(row.total_cents) : '-'}
                      </TableCell>
                      <TableCell>
                        {row.error_message ? (
                          <Chip label="Failed" color="error" size="small" />
                        ) : (
                          <Chip
                            label={row.invoice_status || 'Created'}
                            color={row.invoice_status === 'paid' ? 'success' :
                                   row.invoice_status === 'sent' ? 'info' : 'default'}
                            size="small"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {formatDate(row.created_at)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>
    </Box>
  );
};

export default AutoInvoicePanel;
