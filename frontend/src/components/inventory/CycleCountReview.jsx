import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  IconButton,
  Tooltip,
  Checkbox,
  Card,
  CardContent,
  LinearProgress,
  Collapse,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Refresh,
  Print,
  ExpandMore,
  ExpandLess,
  ThumbUp,
  ThumbDown,
  Replay,
  Inventory2,
  TrendingUp,
  TrendingDown,
  AttachMoney,
  FactCheck
} from '@mui/icons-material';
import apiClient from '../../services/apiClient';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:3001') + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA');
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-CA');
};

const formatCurrency = (cents) => {
  if (cents == null) return '-';
  return `$${(Math.abs(Number(cents)) / 100).toFixed(2)}`;
};

const statusColors = {
  draft: 'default',
  in_progress: 'info',
  review: 'warning',
  approved: 'success',
  cancelled: 'error'
};

const statusLabels = {
  draft: 'Draft',
  in_progress: 'In Progress',
  review: 'Pending Review',
  approved: 'Approved',
  cancelled: 'Cancelled'
};

const countTypeLabels = {
  full: 'Full Count',
  cycle: 'Cycle Count',
  spot: 'Spot Check',
  abc: 'ABC Count'
};

const REASON_CODES = [
  { value: 'shrinkage', label: 'Shrinkage' },
  { value: 'damage', label: 'Damage' },
  { value: 'miscount_corrected', label: 'Miscount (Corrected)' },
  { value: 'misplaced', label: 'Misplaced' },
  { value: 'theft_suspected', label: 'Theft Suspected' },
  { value: 'receiving_error', label: 'Receiving Error' },
  { value: 'system_error', label: 'System Error' },
  { value: 'other', label: 'Other' }
];

// ── Variance severity badge ─────────────────────────────────────────
const VarianceSeverityBadge = ({ totalItems, varianceCount }) => {
  if (totalItems === 0) return <Chip label="Empty" size="small" color="default" />;
  if (varianceCount === 0) return <Chip label="0 variances" size="small" color="success" />;
  const rate = varianceCount / totalItems;
  if (rate < 0.05) return <Chip label={`${varianceCount} var.`} size="small" color="warning" />;
  return <Chip label={`${varianceCount} var.`} size="small" color="error" />;
};

// ── Summary Card ────────────────────────────────────────────────────
const SummaryCard = ({ title, value, icon, color = 'primary', subtitle }) => (
  <Card variant="outlined">
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Box sx={{ color: `${color}.main`, mr: 1 }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 'bold', color: `${color}.main` }}>{value}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
    </CardContent>
  </Card>
);

// ── COUNT DETAIL PANEL ──────────────────────────────────────────────
const CountDetailPanel = ({ count, onAction, actionLoading }) => {
  const [varianceData, setVarianceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reasonCodes, setReasonCodes] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [checkedItems, setCheckedItems] = useState({});
  const [showZeroVariance, setShowZeroVariance] = useState(false);
  const [error, setError] = useState(null);
  const printRef = useRef(null);

  // Load variance report when count changes
  useEffect(() => {
    if (!count) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [detailRes, varianceRes] = await Promise.all([
          apiClient.get(`${API_BASE}/inventory/counts/${count.id}`, { headers: getAuthHeaders() }),
          apiClient.get(`${API_BASE}/inventory/counts/${count.id}/variance`, { headers: getAuthHeaders() })
        ]);
        const detail = detailRes.data?.data || detailRes.data;
        const variance = varianceRes.data?.data || varianceRes.data;
        setVarianceData({ ...detail, variance });
        // Reset selections
        setReasonCodes({});
        setItemNotes({});
        setCheckedItems({});
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load count details');
      } finally {
        setLoading(false);
      }
    })();
  }, [count]);

  if (!count) {
    return (
      <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <FactCheck sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">Select a count to review</Typography>
        <Typography variant="body2" color="text.secondary">Choose from the list on the left</Typography>
      </Paper>
    );
  }

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress size={40} />
        <Typography sx={{ mt: 2 }} color="text.secondary">Loading count details...</Typography>
      </Paper>
    );
  }

  const allItems = varianceData?.items || [];
  const varianceSummary = varianceData?.variance?.summary || { total_items: 0, positive_variance: 0, negative_variance: 0, total_cost_impact: 0 };
  const varianceItems = (varianceData?.variance?.items || []).sort((a, b) => Math.abs(b.variance || b.variance_qty || 0) - Math.abs(a.variance || a.variance_qty || 0));
  const zeroVarianceItems = allItems.filter((i) => (i.variance || 0) === 0 && i.counted_qty != null);
  const itemsWithVariance = allItems.filter((i) => (i.variance || 0) !== 0);
  const isReview = count.status === 'review';

  // Check if all variance items have reason codes
  const allHaveReasons = varianceItems.length > 0 && varianceItems.every((item) => reasonCodes[item.id]);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const checkedHaveReasons = checkedCount > 0 && Object.entries(checkedItems).filter(([, v]) => v).every(([id]) => reasonCodes[id]);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Variance Report - ${count.count_number}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: bold; }
        .positive { color: #1565c0; } .negative { color: #c62828; }
        h2 { margin-bottom: 4px; } .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
        .summary { display: flex; gap: 24px; margin-bottom: 16px; }
        .summary div { padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; }
      </style></head><body>
      <h2>Variance Report: ${count.count_number}</h2>
      <div class="meta">${count.location_name} &bull; ${countTypeLabels[count.count_type] || count.count_type} &bull; ${formatDate(count.completed_at)}</div>
      <div class="summary">
        <div>Items Counted: <strong>${varianceSummary.total_items || allItems.length}</strong></div>
        <div>Variances: <strong>${itemsWithVariance.length}</strong></div>
        <div>Over: <strong class="positive">+${varianceSummary.positive_variance || 0}</strong></div>
        <div>Short: <strong class="negative">${varianceSummary.negative_variance || 0}</strong></div>
        <div>Cost Impact: <strong>${formatCurrency(varianceSummary.total_cost_impact)}</strong></div>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Model</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Cost Impact</th></tr></thead>
        <tbody>${varianceItems.map((item) => {
          const v = item.variance || item.variance_qty || 0;
          return `<tr>
            <td>${item.product_name || ''}</td>
            <td>${item.sku || ''}</td>
            <td>${item.expected_qty}</td>
            <td>${item.counted_qty ?? '-'}</td>
            <td class="${v > 0 ? 'positive' : 'negative'}">${v > 0 ? '+' : ''}${v}</td>
            <td>${formatCurrency(item.variance_cost_cents)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999;">Printed ${new Date().toLocaleString('en-CA')}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Box ref={printRef}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Header */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{count.count_number}</Typography>
            <Typography variant="body2" color="text.secondary">
              {count.location_name} &bull; {countTypeLabels[count.count_type] || count.count_type} &bull;
              Counted by: {count.started_by_name || 'Unknown'} &bull; {formatDateTime(count.completed_at)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={statusLabels[count.status] || count.status} color={statusColors[count.status] || 'default'} />
            <Tooltip title="Print variance report">
              <IconButton onClick={handlePrint}><Print /></IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <SummaryCard title="Items Counted" value={varianceSummary.total_items || allItems.length} icon={<Inventory2 />} color="primary" />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <SummaryCard title="With Variance" value={itemsWithVariance.length} icon={<Warning />} color={itemsWithVariance.length > 0 ? 'warning' : 'success'} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <SummaryCard title="Units Over" value={`+${varianceSummary.positive_variance || 0}`} icon={<TrendingUp />} color="info" />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <SummaryCard title="Units Short" value={varianceSummary.negative_variance || 0} icon={<TrendingDown />} color="error" />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <SummaryCard title="Cost Impact" value={formatCurrency(varianceSummary.total_cost_impact)} icon={<AttachMoney />} color="error" subtitle="Estimated" />
        </Grid>
      </Grid>

      {/* Variance Table */}
      {varianceItems.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              Variance Items ({varianceItems.length})
            </Typography>
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {isReview && <TableCell padding="checkbox" sx={{ fontWeight: 'bold' }}>
                    <Checkbox
                      indeterminate={checkedCount > 0 && checkedCount < varianceItems.length}
                      checked={checkedCount === varianceItems.length && varianceItems.length > 0}
                      onChange={(e) => {
                        const next = {};
                        if (e.target.checked) varianceItems.forEach((i) => { next[i.id] = true; });
                        setCheckedItems(next);
                      }}
                    />
                  </TableCell>}
                  <TableCell sx={{ fontWeight: 'bold' }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Model / SKU</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Expected</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Counted</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Variance</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Cost Impact</TableCell>
                  {isReview && <TableCell sx={{ fontWeight: 'bold', minWidth: 160 }}>Reason Code</TableCell>}
                  {isReview && <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }}>Notes</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {varianceItems.map((item) => {
                  const v = item.variance || item.variance_qty || 0;
                  const isPositive = v > 0;
                  return (
                    <TableRow key={item.id} sx={{ bgcolor: isPositive ? '#e3f2fd' : '#ffebee' }}>
                      {isReview && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={!!checkedItems[item.id]}
                            onChange={(e) => setCheckedItems((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{item.product_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.sku || '-'}</Typography>
                        {item.upc && <Typography variant="caption" color="text.secondary">{item.upc}</Typography>}
                      </TableCell>
                      <TableCell align="center">{item.expected_qty}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>{item.counted_qty ?? '-'}</TableCell>
                      <TableCell align="center">
                        <Typography sx={{ fontWeight: 'bold', fontSize: '1rem', color: isPositive ? 'info.main' : 'error.main' }}>
                          {isPositive ? '+' : ''}{v}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ color: 'error.main' }}>
                          {formatCurrency(item.variance_cost_cents)}
                        </Typography>
                      </TableCell>
                      {isReview && (
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={reasonCodes[item.id] || ''}
                              onChange={(e) => setReasonCodes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              displayEmpty
                            >
                              <MenuItem value="" disabled><em>Select...</em></MenuItem>
                              {REASON_CODES.map((rc) => (
                                <MenuItem key={rc.value} value={rc.value}>{rc.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                      )}
                      {isReview && (
                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Notes..."
                            value={itemNotes[item.id] || ''}
                            onChange={(e) => setItemNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Zero Variance Section */}
      {zeroVarianceItems.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Box
            sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowZeroVariance(!showZeroVariance)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle sx={{ color: 'success.main' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                Zero Variance Items ({zeroVarianceItems.length})
              </Typography>
            </Box>
            {showZeroVariance ? <ExpandLess /> : <ExpandMore />}
          </Box>
          <Collapse in={showZeroVariance}>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Model / SKU</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Expected</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Counted</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {zeroVarianceItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.sku || '-'}</TableCell>
                      <TableCell align="center">{item.expected_qty}</TableCell>
                      <TableCell align="center" sx={{ color: 'success.main', fontWeight: 'bold' }}>{item.counted_qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </Paper>
      )}

      {/* No variance items at all */}
      {varianceItems.length === 0 && zeroVarianceItems.length === 0 && allItems.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Inventory2 sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No items in this count</Typography>
        </Paper>
      )}

      {/* Action Buttons */}
      {isReview && (
        <Paper variant="outlined" sx={{ p: 2, position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Tooltip title="Send back for recount">
              <Button
                variant="outlined"
                color="warning"
                startIcon={<Replay />}
                disabled={actionLoading}
                onClick={() => onAction(count.id, 'recount')}
              >
                Request Recount
              </Button>
            </Tooltip>
            <Tooltip title="Reject and cancel this count">
              <Button
                variant="outlined"
                color="error"
                startIcon={<ThumbDown />}
                disabled={actionLoading}
                onClick={() => onAction(count.id, 'reject')}
              >
                Reject Count
              </Button>
            </Tooltip>
            {checkedCount > 0 && (
              <Tooltip title={checkedHaveReasons ? `Approve ${checkedCount} selected items` : 'Assign reason codes to all selected items first'}>
                <span>
                  <Button
                    variant="contained"
                    color="info"
                    startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <ThumbUp />}
                    disabled={actionLoading || !checkedHaveReasons}
                    onClick={() => onAction(count.id, 'approve')}
                  >
                    Approve Selected ({checkedCount})
                  </Button>
                </span>
              </Tooltip>
            )}
            <Tooltip title={allHaveReasons ? 'Approve all variances and adjust inventory' : 'Assign reason codes to all variance items first'}>
              <span>
                <Button
                  variant="contained"
                  color="success"
                  size="large"
                  startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <ThumbUp />}
                  disabled={actionLoading || !allHaveReasons}
                  onClick={() => onAction(count.id, 'approve')}
                >
                  Approve All
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Paper>
      )}

      {/* Already approved banner */}
      {count.status === 'approved' && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Approved by {count.approved_by_name || 'Manager'} on {formatDateTime(count.approved_at)}.
          Inventory adjustments have been applied.
        </Alert>
      )}
    </Box>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────────
const CycleCountReview = () => {
  const [counts, setCounts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCount, setSelectedCount] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('review');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Fetch locations
  useEffect(() => {
    apiClient.get(`${API_BASE}/locations?active=true`, { headers: getAuthHeaders() })
      .then((res) => setLocations(res.data?.data || []))
      .catch(() => {});
  }, []);

  // Fetch counts
  const fetchCounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);
      params.set('limit', '100');
      const res = await apiClient.get(`${API_BASE}/inventory/counts?${params}`, { headers: getAuthHeaders() });
      const data = res.data?.data || res.data;
      let list = data?.counts || [];

      // Client-side date filtering
      if (dateFrom) list = list.filter((c) => (c.completed_at || c.created_at) >= dateFrom);
      if (dateTo) list = list.filter((c) => (c.completed_at || c.created_at) <= dateTo + 'T23:59:59Z');

      setCounts(list);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load counts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, locationFilter, dateFrom, dateTo]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Actions
  const handleAction = (countId, action) => {
    const labels = {
      approve: 'Approve this count and apply inventory adjustments?',
      reject: 'Reject and cancel this count? This cannot be undone.',
      recount: 'Send this count back for recount?'
    };
    setConfirmDialog({ countId, action, message: labels[action] || `${action}?` });
  };

  const executeAction = async () => {
    if (!confirmDialog) return;
    const { countId, action } = confirmDialog;
    setConfirmDialog(null);
    setActionLoading(true);
    setError(null);

    try {
      if (action === 'approve') {
        await apiClient.post(`${API_BASE}/inventory/counts/${countId}/approve`, {}, { headers: getAuthHeaders() });
      } else if (action === 'reject') {
        await apiClient.post(`${API_BASE}/inventory/counts/${countId}/cancel`, {}, { headers: getAuthHeaders() });
      } else if (action === 'recount') {
        await apiClient.post(`${API_BASE}/inventory/counts/${countId}/recount`, {}, { headers: getAuthHeaders() });
      }
      fetchCounts();
      // Reload selected count detail
      if (selectedCount?.id === countId) {
        const res = await apiClient.get(`${API_BASE}/inventory/counts/${countId}`, { headers: getAuthHeaders() });
        setSelectedCount(res.data?.data || res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || `Failed to ${action} count`);
    } finally {
      setActionLoading(false);
    }
  };

  const selectCount = (c) => {
    setSelectedCount(c);
  };

  const reviewCount = counts.filter((c) => c.status === 'review').length;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FactCheck sx={{ mr: 1.5, fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Count Review</Typography>
            <Typography variant="body2" color="text.secondary">
              {reviewCount > 0 ? `${reviewCount} count${reviewCount !== 1 ? 's' : ''} pending review` : 'No counts pending review'}
            </Typography>
          </Box>
        </Box>
        <Button variant="outlined" startIcon={<Refresh />} onClick={() => { fetchCounts(); setSelectedCount(null); }}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Grid container spacing={2}>
        {/* Left Panel — Count Queue */}
        <Grid item xs={12} md={4}>
          {/* Filters */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={1.5}>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select label="Status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelectedCount(null); }}>
                    <MenuItem value="all">All Statuses</MenuItem>
                    <MenuItem value="review">Pending Review</MenuItem>
                    <MenuItem value="approved">Approved</MenuItem>
                    <MenuItem value="cancelled">Cancelled</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Location</InputLabel>
                  <Select label="Location" value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setSelectedCount(null); }}>
                    <MenuItem value="">All Locations</MenuItem>
                    {locations.map((l) => <MenuItem key={l.id} value={String(l.id)}>{l.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
                  value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
                  value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                />
              </Grid>
            </Grid>
          </Paper>

          {/* Count List */}
          <Paper variant="outlined">
            {loading && <LinearProgress />}
            {counts.length === 0 && !loading && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                <Typography color="text.secondary">
                  {statusFilter === 'review' ? 'No counts pending review' : 'No counts found'}
                </Typography>
              </Box>
            )}
            {counts.map((c) => {
              const isSelected = selectedCount?.id === c.id;
              const varianceCount = c.total_variance_units || 0;
              return (
                <Box
                  key={c.id}
                  onClick={() => selectCount(c)}
                  sx={{
                    p: 2, cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider',
                    bgcolor: isSelected ? 'primary.50' : 'background.paper',
                    borderLeft: isSelected ? '4px solid' : '4px solid transparent',
                    borderLeftColor: isSelected ? 'primary.main' : 'transparent',
                    '&:hover': { bgcolor: isSelected ? 'primary.50' : 'grey.50' }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {c.count_number}
                    </Typography>
                    <Chip label={statusLabels[c.status] || c.status} color={statusColors[c.status] || 'default'} size="small" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {c.location_name} &bull; {countTypeLabels[c.count_type] || c.count_type}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      {c.total_counted || 0} items &bull; {formatDate(c.completed_at || c.created_at)}
                    </Typography>
                    <VarianceSeverityBadge totalItems={c.total_items || 1} varianceCount={varianceCount} />
                  </Box>
                </Box>
              );
            })}
          </Paper>
        </Grid>

        {/* Right Panel — Count Detail */}
        <Grid item xs={12} md={8}>
          <CountDetailPanel
            count={selectedCount}
            onAction={handleAction}
            actionLoading={actionLoading}
          />
        </Grid>
      </Grid>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onClose={() => setConfirmDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog?.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={confirmDialog?.action === 'reject' ? 'error' : confirmDialog?.action === 'recount' ? 'warning' : 'success'}
            onClick={executeAction}
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CycleCountReview;
