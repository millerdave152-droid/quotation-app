import React, { useState, useEffect, useCallback } from 'react';
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
  Tooltip,
  Tabs,
  Tab,
  LinearProgress,
  Collapse,
  Autocomplete
} from '@mui/material';
import { ArrowLeftRight, CheckCircle, ChevronDown, ChevronUp, Package, Plus, RefreshCw, Search, Send, ThumbsDown, ThumbsUp, Trash2, Truck, XCircle } from 'lucide-react';
import apiClient from '../../services/apiClient';

const API_BASE = (process.env.REACT_APP_API_URL || '') + '/api';

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

const statusConfig = {
  draft:      { color: 'default',  label: 'Draft' },
  requested:  { color: 'info',     label: 'Requested' },
  approved:   { color: 'success',  label: 'Approved' },
  in_transit: { color: 'warning',  label: 'In Transit' },
  received:   { color: 'info',     label: 'Received' },
  completed:  { color: 'success',  label: 'Completed' },
  cancelled:  { color: 'error',    label: 'Cancelled' }
};

const StatusBadge = ({ status }) => {
  const cfg = statusConfig[status] || { color: 'default', label: status };
  return <Chip label={cfg.label} color={cfg.color} size="small" />;
};

// ─── TRANSFER DETAIL ROW ────────────────────────────────────────────
const TransferDetailRow = ({ transfer, onAction, actionLoading }) => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = async () => {
    if (detail) { setOpen(!open); return; }
    try {
      setLoading(true);
      const res = await apiClient.get(`${API_BASE}/inventory/transfers/${transfer.id}`, { headers: getAuthHeaders() });
      setDetail(res.data.transfer || res.data);
      setOpen(true);
    } catch (err) {
      console.error('Failed to load transfer detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const items = detail?.items || [];

  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer', '& > *': { borderBottom: open ? 'none' : undefined } }} onClick={loadDetail}>
        <TableCell sx={{ width: 32, pr: 0 }}>
          {loading ? <CircularProgress size={16} /> : open ? <ChevronUp fontSize="small" /> : <ChevronDown fontSize="small" />}
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            {transfer.transfer_number}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">
            {transfer.from_location_name} &rarr; {transfer.to_location_name}
          </Typography>
        </TableCell>
        <TableCell align="center">{transfer.item_count} items / {transfer.total_units} units</TableCell>
        <TableCell><StatusBadge status={transfer.status} /></TableCell>
        <TableCell>
          <Typography variant="body2">{transfer.requested_by_name || '-'}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDateTime(transfer.requested_at || transfer.created_at)}</Typography>
        </TableCell>
        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
          {transfer.status === 'draft' && (
            <Tooltip title="Submit Request">
              <IconButton size="small" color="primary" disabled={actionLoading} onClick={() => onAction(transfer.id, 'submit')}>
                <Send fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {transfer.status === 'requested' && (
            <>
              <Tooltip title="Approve">
                <IconButton size="small" color="success" disabled={actionLoading} onClick={() => onAction(transfer.id, 'approve')}>
                  <ThumbsUp fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reject">
                <IconButton size="small" color="error" disabled={actionLoading} onClick={() => onAction(transfer.id, 'cancel', { reason: 'Rejected' })}>
                  <ThumbsDown fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          {transfer.status === 'approved' && (
            <Tooltip title="Mark Shipped">
              <IconButton size="small" color="warning" disabled={actionLoading} onClick={() => onAction(transfer.id, 'ship')}>
                <Truck fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {transfer.status === 'in_transit' && (
            <Tooltip title="Mark Received">
              <IconButton size="small" color="success" disabled={actionLoading} onClick={() => onAction(transfer.id, 'receive')}>
                <CheckCircle fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!['completed', 'cancelled'].includes(transfer.status) && (
            <Tooltip title="Cancel Transfer">
              <IconButton size="small" color="error" disabled={actionLoading} onClick={() => onAction(transfer.id, 'cancel', { reason: 'Cancelled by user' })}>
                <XCircle fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 1 }}>
              {transfer.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Notes:</strong> {transfer.notes}
                </Typography>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Model</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Requested</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Shipped</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Received</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography variant="body2" color="text.secondary">No items</Typography>
                      </TableCell>
                    </TableRow>
                  ) : items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.product_sku || '-'}</TableCell>
                      <TableCell>{item.product_model || '-'}</TableCell>
                      <TableCell align="center">{item.quantity_requested}</TableCell>
                      <TableCell align="center">{item.quantity_shipped ?? '-'}</TableCell>
                      <TableCell align="center">{item.quantity_received ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {detail && (
                <Box sx={{ display: 'flex', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
                  {detail.approved_by_name && <Typography variant="caption" color="text.secondary">Approved by {detail.approved_by_name} on {formatDate(detail.approved_at)}</Typography>}
                  {detail.shipped_by_name && <Typography variant="caption" color="text.secondary">Shipped by {detail.shipped_by_name} on {formatDate(detail.shipped_at)}</Typography>}
                  {detail.received_by_name && <Typography variant="caption" color="text.secondary">Received by {detail.received_by_name} on {formatDate(detail.received_at)}</Typography>}
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ─── CREATE TRANSFER FORM ───────────────────────────────────────────
const CreateTransferForm = ({ locations, onCreated }) => {
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const toLocations = locations.filter((l) => l.id !== Number(fromLocationId));

  // Reset toLocationId if it matches fromLocationId
  useEffect(() => {
    if (toLocationId && Number(toLocationId) === Number(fromLocationId)) {
      setToLocationId('');
    }
  }, [fromLocationId, toLocationId]);

  const searchProducts = useCallback(async (query) => {
    if (!query || query.length < 2 || !fromLocationId) return;
    try {
      setSearchLoading(true);
      const res = await apiClient.get(
        `${API_BASE}/inventory?search=${encodeURIComponent(query)}&location_id=${fromLocationId}&limit=15`,
        { headers: getAuthHeaders() }
      );
      const inv = res.data.inventory || res.data.products || [];
      setSearchResults(inv.filter((p) => {
        const avail = (p.quantity_on_hand || 0) - (p.quantity_reserved || 0);
        return avail > 0;
      }));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [fromLocationId]);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  const addItem = (product) => {
    const productId = product.product_id || product.id;
    if (items.find((i) => i.product_id === productId)) return;
    const available = (product.quantity_on_hand || 0) - (product.quantity_reserved || 0);
    setItems([...items, {
      product_id: productId,
      product_name: product.product_name || product.name,
      product_sku: product.product_sku || product.sku || '',
      product_model: product.product_model || product.model || '',
      available_at_from: available,
      quantity: 1
    }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const updateQuantity = (productId, qty) => {
    setItems(items.map((i) =>
      i.product_id === productId ? { ...i, quantity: Math.max(1, Math.min(qty, i.available_at_from)) } : i
    ));
  };

  const removeItem = (productId) => {
    setItems(items.filter((i) => i.product_id !== productId));
  };

  const handleSubmit = async () => {
    if (!fromLocationId || !toLocationId || items.length === 0) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiClient.post(`${API_BASE}/inventory/transfers`, {
        from_location_id: Number(fromLocationId),
        to_location_id: Number(toLocationId),
        notes: notes || undefined,
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }))
      }, { headers: getAuthHeaders() });
      setSuccess('Transfer created successfully');
      setFromLocationId('');
      setToLocationId('');
      setNotes('');
      setItems([]);
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Transfer Details</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={5}>
            <FormControl fullWidth>
              <InputLabel>From Location</InputLabel>
              <Select label="From Location" value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
                {locations.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>{loc.name} ({loc.code})</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeftRight sx={{ fontSize: 32, color: 'text.secondary' }} />
          </Grid>
          <Grid item xs={12} sm={5}>
            <FormControl fullWidth>
              <InputLabel>To Location</InputLabel>
              <Select label="To Location" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} disabled={!fromLocationId}>
                {toLocations.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>{loc.name} ({loc.code})</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} />
          </Grid>
        </Grid>
      </Paper>

      {/* Product Search */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Add Products</Typography>
        {!fromLocationId ? (
          <Alert severity="info">Select a &quot;From Location&quot; first to search products.</Alert>
        ) : (
          <>
            <Autocomplete
              freeSolo
              options={searchResults}
              getOptionLabel={(opt) =>
                typeof opt === 'string' ? opt : `${opt.product_model || opt.model || ''} — ${opt.product_name || opt.name || ''} (${opt.product_sku || opt.sku || ''})`
              }
              inputValue={searchQuery}
              onInputChange={(_, val) => setSearchQuery(val)}
              onChange={(_, val) => { if (val && typeof val !== 'string') addItem(val); }}
              loading={searchLoading}
              renderOption={(props, opt) => {
                const avail = (opt.quantity_on_hand || 0) - (opt.quantity_reserved || 0);
                return (
                  <li {...props} key={opt.product_id || opt.id}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {opt.product_model || opt.model || '-'} &mdash; {opt.product_name || opt.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        SKU: {opt.product_sku || opt.sku || '-'} &bull; Available: {avail}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search products by name, model, or SKU..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
                  }}
                />
              )}
            />
          </>
        )}

        {/* Selected Items */}
        {items.length > 0 && (
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Model</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Available</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Transfer Qty</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.product_id}>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell>{item.product_sku || '-'}</TableCell>
                    <TableCell>{item.product_model || '-'}</TableCell>
                    <TableCell align="center">{item.available_at_from}</TableCell>
                    <TableCell align="center" sx={{ width: 120 }}>
                      <TextField
                        type="number"
                        size="small"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.product_id, parseInt(e.target.value) || 1)}
                        inputProps={{ min: 1, max: item.available_at_from, style: { textAlign: 'center' } }}
                        sx={{ width: 80 }}
                        error={item.quantity > item.available_at_from}
                        helperText={item.quantity > item.available_at_from ? 'Exceeds stock' : ''}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" color="error" onClick={() => removeItem(item.product_id)}>
                        <Trash2 fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Submit */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <Send />}
          onClick={handleSubmit}
          disabled={submitting || !fromLocationId || !toLocationId || items.length === 0}
        >
          Create Transfer ({items.reduce((s, i) => s + i.quantity, 0)} units)
        </Button>
      </Box>
    </Box>
  );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────
const TransferManagement = () => {
  const [tabValue, setTabValue] = useState(0);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalTransfers, setTotalTransfers] = useState(0);

  // History state
  const [historyTransfers, setHistoryTransfers] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(25);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilters, setHistoryFilters] = useState({
    status: '',
    from_location: '',
    to_location: '',
    date_from: '',
    date_to: ''
  });

  // Fetch locations once
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get(`${API_BASE}/locations?active=true`, { headers: getAuthHeaders() });
        setLocations(res.data.data || res.data || []);
      } catch (err) {
        console.error('Failed to load locations:', err);
      }
    })();
  }, []);

  // Fetch active transfers
  const fetchActive = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('limit', String(rowsPerPage));
      // Active = not completed/cancelled
      const res = await apiClient.get(`${API_BASE}/inventory/transfers?${params}`, { headers: getAuthHeaders() });
      const data = res.data;
      const all = data.transfers || [];
      // Filter client-side to active statuses
      const active = all.filter((t) => !['completed', 'cancelled'].includes(t.status));
      setTransfers(active);
      setTotalTransfers(data.pagination?.total || all.length);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(historyPage + 1));
      params.set('limit', String(historyRowsPerPage));
      if (historyFilters.status) params.set('status', historyFilters.status);
      if (historyFilters.from_location) params.set('from_location', historyFilters.from_location);
      if (historyFilters.to_location) params.set('to_location', historyFilters.to_location);
      if (historyFilters.date_from) params.set('date_from', historyFilters.date_from);
      if (historyFilters.date_to) params.set('date_to', historyFilters.date_to);
      const res = await apiClient.get(`${API_BASE}/inventory/transfers?${params}`, { headers: getAuthHeaders() });
      const data = res.data;
      const all = data.transfers || [];
      const hist = historyFilters.status ? all : all.filter((t) => ['completed', 'cancelled'].includes(t.status));
      setHistoryTransfers(hist);
      setHistoryTotal(data.pagination?.total || hist.length);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historyRowsPerPage, historyFilters]);

  useEffect(() => { if (tabValue === 2) fetchHistory(); }, [tabValue, fetchHistory]);

  // Status actions
  const handleAction = async (transferId, action, payload) => {
    try {
      setActionLoading(true);
      setError(null);
      if (action === 'cancel') {
        await apiClient.post(`${API_BASE}/inventory/transfers/${transferId}/cancel`, payload || { reason: 'Cancelled' }, { headers: getAuthHeaders() });
      } else {
        await apiClient.put(`${API_BASE}/inventory/transfers/${transferId}/${action}`, payload || {}, { headers: getAuthHeaders() });
      }
      fetchActive();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || `Failed to ${action} transfer`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreated = () => {
    setTabValue(0);
    fetchActive();
  };

  // ─── TABLE RENDERER (shared between Active & History) ─────────────
  const renderTransferTable = (data, isLoading, pg, rpg, total, onPageChange, onRppChange) => (
    <Paper variant="outlined">
      {isLoading && <LinearProgress />}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 32 }} />
              <TableCell sx={{ fontWeight: 'bold' }}>Transfer #</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>From &rarr; To</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>Items</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Requested</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  {isLoading ? (
                    <CircularProgress size={28} />
                  ) : (
                    <>
                      <Package sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography color="text.secondary">No transfers found</Typography>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : data.map((t) => (
              <TransferDetailRow key={t.id} transfer={t} onAction={handleAction} actionLoading={actionLoading} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={pg}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={rpg}
        onRowsPerPageChange={(e) => onRppChange(parseInt(e.target.value))}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </Paper>
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          <Truck sx={{ mr: 1, fontSize: 32 }} />
          Inventory Transfers
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshCw />} onClick={() => { fetchActive(); if (tabValue === 2) fetchHistory(); }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<Plus />} onClick={() => setTabValue(1)}>
            New Transfer
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Tabs */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Active Transfers" />
          <Tab label="Create Transfer" />
          <Tab label="History" />
        </Tabs>
      </Paper>

      {/* Tab 0: Active Transfers */}
      {tabValue === 0 && renderTransferTable(
        transfers, loading, page, rowsPerPage, totalTransfers,
        (p) => setPage(p),
        (rpp) => { setRowsPerPage(rpp); setPage(0); }
      )}

      {/* Tab 1: Create Transfer */}
      {tabValue === 1 && (
        <CreateTransferForm locations={locations} onCreated={handleCreated} />
      )}

      {/* Tab 2: History */}
      {tabValue === 2 && (
        <>
          <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={2.4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    label="Status"
                    value={historyFilters.status}
                    onChange={(e) => { setHistoryFilters({ ...historyFilters, status: e.target.value }); setHistoryPage(0); }}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="completed">Completed</MenuItem>
                    <MenuItem value="cancelled">Cancelled</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <FormControl fullWidth size="small">
                  <InputLabel>From Location</InputLabel>
                  <Select
                    label="From Location"
                    value={historyFilters.from_location}
                    onChange={(e) => { setHistoryFilters({ ...historyFilters, from_location: e.target.value }); setHistoryPage(0); }}
                  >
                    <MenuItem value="">All</MenuItem>
                    {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={3} md={2.4}>
                <TextField
                  fullWidth size="small" type="date" label="From Date" InputLabelProps={{ shrink: true }}
                  value={historyFilters.date_from}
                  onChange={(e) => { setHistoryFilters({ ...historyFilters, date_from: e.target.value }); setHistoryPage(0); }}
                />
              </Grid>
              <Grid item xs={6} sm={3} md={2.4}>
                <TextField
                  fullWidth size="small" type="date" label="To Date" InputLabelProps={{ shrink: true }}
                  value={historyFilters.date_to}
                  onChange={(e) => { setHistoryFilters({ ...historyFilters, date_to: e.target.value }); setHistoryPage(0); }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Button fullWidth variant="outlined" onClick={() => { setHistoryFilters({ status: '', from_location: '', to_location: '', date_from: '', date_to: '' }); setHistoryPage(0); }}>
                  Clear Filters
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {renderTransferTable(
            historyTransfers, historyLoading, historyPage, historyRowsPerPage, historyTotal,
            (p) => setHistoryPage(p),
            (rpp) => { setHistoryRowsPerPage(rpp); setHistoryPage(0); }
          )}
        </>
      )}
    </Box>
  );
};

export default TransferManagement;
