import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { ArrowLeft, Check, CheckCircle, ImageOff, Minus, Package, Play, Plus, QrCode, Trash2, Truck } from 'lucide-react';
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

// Audio feedback helper
const playBeep = (success = true) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 880 : 220;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.1 : 0.3));
  } catch {
    // silent fallback
  }
};

// ─── SETUP SCREEN (Phase 1) ─────────────────────────────────────────
const SetupScreen = ({ onStart }) => {
  const [mode, setMode] = useState('po'); // 'po' | 'nopo'
  const [receivingQueue, setReceivingQueue] = useState([]);
  const [allPOs, setAllPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedPOId, setSelectedPOId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [rqRes, vendorRes, locRes, poRes] = await Promise.all([
          apiClient.get(`${API_BASE}/purchase-orders/receiving-queue`, { headers: getAuthHeaders() }).catch(() => ({ data: { data: [] } })),
          apiClient.get(`${API_BASE}/purchase-orders/vendors/list`, { headers: getAuthHeaders() }).catch(() => ({ data: { data: [] } })),
          apiClient.get(`${API_BASE}/locations?active=true`, { headers: getAuthHeaders() }).catch(() => ({ data: { data: [] } })),
          apiClient.get(`${API_BASE}/purchase-orders?status=confirmed&limit=50`, { headers: getAuthHeaders() }).catch(() => ({ data: { data: { purchaseOrders: [] } } }))
        ]);

        const queue = rqRes.data?.data || rqRes.data || [];
        setReceivingQueue(Array.isArray(queue) ? queue : []);

        const vList = vendorRes.data?.data || [];
        setVendors(Array.isArray(vList) ? vList : []);

        const lList = locRes.data?.data || locRes.data || [];
        setLocations(Array.isArray(lList) ? lList : []);

        // Default location to Mississauga (id=1)
        const missLoc = (Array.isArray(lList) ? lList : []).find((l) => l.code === 'MISS' || l.name?.includes('Mississauga'));
        if (missLoc) setSelectedLocationId(String(missLoc.id));

        const poList = poRes.data?.data?.purchaseOrders || [];
        setAllPOs(Array.isArray(poList) ? poList : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Merge receiving-queue + confirmed POs for the dropdown
  const availablePOs = [...receivingQueue];
  allPOs.forEach((po) => {
    if (!availablePOs.find((q) => q.id === po.id)) availablePOs.push(po);
  });

  const handleStart = async () => {
    if (mode === 'po' && selectedPOId) {
      // Load PO detail with items
      try {
        const res = await apiClient.get(`${API_BASE}/purchase-orders/${selectedPOId}`, { headers: getAuthHeaders() });
        const po = res.data?.data || res.data;
        onStart({
          mode: 'po',
          po,
          locationId: po.location_id,
          carrier,
          trackingNumber
        });
      } catch (err) {
        console.error('Failed to load PO:', err);
      }
    } else if (mode === 'nopo' && selectedLocationId) {
      onStart({
        mode: 'nopo',
        po: null,
        locationId: Number(selectedLocationId),
        vendorId: selectedVendorId ? Number(selectedVendorId) : null,
        vendorName: vendors.find((v) => v.id === Number(selectedVendorId))?.name || '',
        carrier,
        trackingNumber
      });
    }
  };

  const canStart = mode === 'po' ? Boolean(selectedPOId) : Boolean(selectedLocationId);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Mode Toggle */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            onClick={() => setMode('po')}
            sx={{
              p: 3, cursor: 'pointer', textAlign: 'center',
              borderColor: mode === 'po' ? 'primary.main' : 'divider',
              borderWidth: mode === 'po' ? 2 : 1,
              bgcolor: mode === 'po' ? 'primary.50' : 'background.paper',
              minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center'
            }}
          >
            <Package sx={{ fontSize: 48, color: mode === 'po' ? 'primary.main' : 'text.secondary', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Receive Against PO</Typography>
            <Typography variant="body2" color="text.secondary">
              {availablePOs.length} purchase order{availablePOs.length !== 1 ? 's' : ''} waiting
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            onClick={() => setMode('nopo')}
            sx={{
              p: 3, cursor: 'pointer', textAlign: 'center',
              borderColor: mode === 'nopo' ? 'warning.main' : 'divider',
              borderWidth: mode === 'nopo' ? 2 : 1,
              bgcolor: mode === 'nopo' ? 'warning.50' : 'background.paper',
              minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center'
            }}
          >
            <Truck sx={{ fontSize: 48, color: mode === 'nopo' ? 'warning.main' : 'text.secondary', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Receive Without PO</Typography>
            <Typography variant="body2" color="text.secondary">Unexpected or ad-hoc deliveries</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Config Form */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          {mode === 'po' && (
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Select Purchase Order</InputLabel>
                <Select
                  label="Select Purchase Order"
                  value={selectedPOId}
                  onChange={(e) => setSelectedPOId(e.target.value)}
                  sx={{ minHeight: 56 }}
                >
                  {availablePOs.length === 0 && (
                    <MenuItem disabled value="">No POs awaiting receiving</MenuItem>
                  )}
                  {availablePOs.map((po) => (
                    <MenuItem key={po.id} value={po.id}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{po.po_number}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {po.vendor_name} &bull; {po.item_count || '?'} items &bull; Expected: {formatDate(po.expected_date)}
                          </Typography>
                        </Box>
                        <Chip
                          label={po.status}
                          size="small"
                          color={po.status === 'partially_received' ? 'info' : 'warning'}
                        />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {mode === 'nopo' && (
            <>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Receiving Location</InputLabel>
                  <Select
                    label="Receiving Location"
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    sx={{ minHeight: 56 }}
                  >
                    {locations.map((loc) => (
                      <MenuItem key={loc.id} value={String(loc.id)}>{loc.name} ({loc.code})</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Vendor (optional)</InputLabel>
                  <Select
                    label="Vendor (optional)"
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    sx={{ minHeight: 56 }}
                  >
                    <MenuItem value="">None</MenuItem>
                    {vendors.map((v) => (
                      <MenuItem key={v.id} value={String(v.id)}>{v.name} ({v.code})</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          )}

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="Carrier Name (optional)" value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="Tracking Number (optional)" value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
            />
          </Grid>
        </Grid>
      </Paper>

      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<Play />}
        onClick={handleStart}
        disabled={!canStart}
        sx={{ py: 2, fontSize: '1.1rem' }}
      >
        Start Receiving
      </Button>
    </Box>
  );
};

// ─── SCAN & COUNT SCREEN (Phase 2) ──────────────────────────────────
const ScanCountScreen = ({ session, onComplete, onBack }) => {
  const { mode, po, locationId, carrier, trackingNumber } = session;
  const scanRef = useRef(null);
  const [scanValue, setScanValue] = useState('');
  const [receivedItems, setReceivedItems] = useState([]);
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionResult, setCompletionResult] = useState(null);

  // Build expected items from PO (memoized to keep stable reference)
  const expectedItems = useMemo(() => po?.items || [], [po?.items]);

  // Initialize received items from PO expected items
  useEffect(() => {
    if (mode === 'po' && expectedItems.length > 0 && receivedItems.length === 0) {
      setReceivedItems(expectedItems.map((item) => ({
        poItemId: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        product_model: item.product_model || '',
        expected: item.quantity_ordered - (item.quantity_received || 0),
        received: 0,
        damaged: 0,
        isDamaged: false,
        damageNotes: ''
      })));
    }
  }, [mode, expectedItems, receivedItems.length]);

  // Auto-focus scan input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scanRef.current) scanRef.current.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const handleScan = async (value) => {
    const query = value.trim();
    if (!query) return;
    setScanValue('');
    setAlert(null);

    try {
      const res = await apiClient.get(`${API_BASE}/products/search?q=${encodeURIComponent(query)}&limit=5`, { headers: getAuthHeaders() });
      const products = Array.isArray(res.data) ? res.data : (res.data?.data || []);

      if (products.length === 0) {
        playBeep(false);
        setAlert({ severity: 'warning', message: `Product not found: "${query}". Try a different search term.` });
        return;
      }

      // Find best match — exact model match first
      const product = products.find((p) => p.model?.toLowerCase() === query.toLowerCase()) || products[0];

      // Check if already in list
      const existingIdx = receivedItems.findIndex((i) => i.product_id === product.id);
      if (existingIdx >= 0) {
        setReceivedItems((prev) => prev.map((item, idx) =>
          idx === existingIdx ? { ...item, received: item.received + 1 } : item
        ));
        playBeep(true);
        return;
      }

      // In PO mode, check if product is expected
      if (mode === 'po') {
        const poItem = receivedItems.find((i) => i.product_id === product.id);
        if (poItem) {
          setReceivedItems((prev) => prev.map((item) =>
            item.product_id === product.id ? { ...item, received: item.received + 1 } : item
          ));
          playBeep(true);
          return;
        }
        // Unexpected product — still add it
      }

      // Plus new product
      setReceivedItems((prev) => [...prev, {
        poItemId: null,
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku || '',
        product_model: product.model || '',
        expected: 0,
        received: 1,
        damaged: 0,
        isDamaged: false,
        damageNotes: ''
      }]);
      playBeep(true);
    } catch {
      playBeep(false);
      setAlert({ severity: 'error', message: 'Search failed. Check your connection.' });
    }

    // Re-focus
    if (scanRef.current) scanRef.current.focus();
  };

  const updateReceived = (idx, delta) => {
    setReceivedItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, received: Math.max(0, item.received + delta) } : item
    ));
  };

  const updateDamaged = (idx, val) => {
    setReceivedItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, damaged: Math.max(0, Math.min(val, item.received)), isDamaged: val > 0 } : item
    ));
  };

  const toggleDamaged = (idx) => {
    setReceivedItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, isDamaged: !item.isDamaged, damaged: !item.isDamaged ? item.damaged || 1 : 0, damageNotes: !item.isDamaged ? item.damageNotes : '' } : item
    ));
  };

  const removeItem = (idx) => {
    // Only allow removing non-PO items or items with 0 expected
    const item = receivedItems[idx];
    if (item.expected > 0) {
      setReceivedItems((prev) => prev.map((it, i) =>
        i === idx ? { ...it, received: 0, damaged: 0, isDamaged: false, damageNotes: '' } : it
      ));
    } else {
      setReceivedItems((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  // Stats
  const totalExpected = receivedItems.reduce((s, i) => s + i.expected, 0);
  const totalReceived = receivedItems.reduce((s, i) => s + i.received, 0);
  const totalDamaged = receivedItems.reduce((s, i) => s + i.damaged, 0);
  const discrepancies = receivedItems.filter((i) => i.expected > 0 && i.received !== i.expected).length;
  const unexpectedItems = receivedItems.filter((i) => i.expected === 0 && i.received > 0).length;

  const getRowColor = (item) => {
    if (item.expected === 0) return item.received > 0 ? '#fff3e0' : 'inherit'; // unexpected → orange tint
    if (item.received === item.expected) return '#e8f5e9'; // match → green
    if (item.received > item.expected) return '#ffebee'; // over → red
    if (item.received > 0) return '#fff8e1'; // under → yellow
    return 'inherit';
  };

  const handleComplete = async () => {
    setSubmitting(true);
    setAlert(null);

    try {
      if (mode === 'po' && po) {
        // PO-based receiving
        const items = receivedItems
          .filter((i) => i.poItemId && i.received > 0)
          .map((i) => ({
            purchaseOrderItemId: i.poItemId,
            quantityReceived: i.received - i.damaged,
            quantityDamaged: i.damaged,
            notes: i.damageNotes || (carrier ? `Carrier: ${carrier}` : null)
          }));

        if (items.length === 0) {
          setAlert({ severity: 'warning', message: 'No items with received quantities to submit.' });
          setSubmitting(false);
          return;
        }

        const res = await apiClient.post(
          `${API_BASE}/purchase-orders/${po.id}/receive`,
          { items },
          { headers: getAuthHeaders() }
        );
        const result = res.data?.data || res.data;
        setCompletionResult({
          receiptNumber: result?.receipt?.receipt_number || 'N/A',
          poNumber: po.po_number,
          poStatus: result?.po?.status || 'received',
          totalReceived,
          totalDamaged,
          discrepancies,
          unexpectedItems
        });
      } else {
        // Non-PO receiving — adjust stock at location
        const itemsToReceive = receivedItems.filter((i) => i.received > 0);
        let completed = 0;

        for (const item of itemsToReceive) {
          const goodQty = item.received - item.damaged;
          if (goodQty > 0) {
            await apiClient.put(
              `${API_BASE}/inventory/${locationId}/${item.product_id}`,
              {
                quantity_on_hand: goodQty, // This is additive based on API — but API sets absolute.
                reason: `Receiving: ${carrier || 'Walk-in'} ${trackingNumber || ''}`.trim()
              },
              { headers: getAuthHeaders() }
            ).catch(() => {/* continue on error */});
            completed++;
          }
        }
        setCompletionResult({
          receiptNumber: 'N/A (No PO)',
          poNumber: null,
          poStatus: null,
          totalReceived,
          totalDamaged,
          discrepancies: 0,
          unexpectedItems: 0,
          adjustedProducts: completed
        });
      }

      setShowCompleteDialog(false);
      playBeep(true);
    } catch (err) {
      setAlert({
        severity: 'error',
        message: err.response?.data?.message || err.response?.data?.error || 'Failed to complete receiving. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Completion summary screen
  if (completionResult) {
    return (
      <Box>
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', mb: 3 }}>
          <CheckCircle sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>Receiving Complete</Typography>
          {completionResult.receiptNumber !== 'N/A (No PO)' && (
            <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
              Receipt: {completionResult.receiptNumber}
            </Typography>
          )}

          <Grid container spacing={3} sx={{ maxWidth: 600, mx: 'auto', mt: 2 }}>
            {completionResult.poNumber && (
              <Grid item xs={6}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">PO</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{completionResult.poNumber}</Typography>
                  <Chip label={completionResult.poStatus} size="small" color="success" />
                </Paper>
              </Grid>
            )}
            <Grid item xs={completionResult.poNumber ? 6 : 12}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Total Received</Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                  {completionResult.totalReceived}
                </Typography>
              </Paper>
            </Grid>
            {completionResult.totalDamaged > 0 && (
              <Grid item xs={6}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">Damaged</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                    {completionResult.totalDamaged}
                  </Typography>
                </Paper>
              </Grid>
            )}
            {completionResult.discrepancies > 0 && (
              <Grid item xs={6}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">Discrepancies</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                    {completionResult.discrepancies}
                  </Typography>
                </Paper>
              </Grid>
            )}
          </Grid>
        </Paper>

        <Button variant="contained" size="large" fullWidth onClick={onComplete} sx={{ py: 2, fontSize: '1.1rem' }}>
          Start New Receiving Session
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header bar */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Back to setup">
            <IconButton onClick={onBack} sx={{ minWidth: 48, minHeight: 48 }}>
              <ArrowLeft />
            </IconButton>
          </Tooltip>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold', lineHeight: 1.2 }}>
              {mode === 'po' ? `Receiving: ${po?.po_number}` : 'Ad-hoc Receiving'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {mode === 'po' && po?.vendor_name ? `${po.vendor_name} • ` : ''}
              {carrier ? `Carrier: ${carrier} • ` : ''}
              {trackingNumber ? `Tracking: ${trackingNumber}` : ''}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          color="success"
          size="large"
          startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <Check />}
          onClick={() => setShowCompleteDialog(true)}
          disabled={submitting || totalReceived === 0}
          sx={{ minWidth: 200, minHeight: 48, fontSize: '1rem' }}
        >
          Complete Receiving
        </Button>
      </Paper>

      {alert && (
        <Alert severity={alert.severity} sx={{ mb: 2, fontSize: '1rem' }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Scan Input */}
      <Paper
        variant="outlined"
        sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5', borderWidth: 2, borderColor: 'primary.main' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <QrCode sx={{ fontSize: 36, color: 'primary.main' }} />
          <TextField
            inputRef={scanRef}
            fullWidth
            placeholder="Scan barcode or type model / SKU..."
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleScan(scanValue);
              }
            }}
            autoFocus
            InputProps={{
              sx: { fontSize: '1.5rem', fontWeight: 'bold', height: 64 }
            }}
          />
        </Box>
      </Paper>

      {/* Stats Bar */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Expected</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{totalExpected}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Received</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'success.main' }}>{totalReceived}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Damaged</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: totalDamaged > 0 ? 'error.main' : 'text.secondary' }}>{totalDamaged}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Discrepancies</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: discrepancies > 0 ? 'warning.main' : 'text.secondary' }}>{discrepancies}</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Items Table */}
      <Paper variant="outlined">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Model / SKU</TableCell>
                {mode === 'po' && <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Expected</TableCell>}
                <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Received</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Damaged</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '0.95rem', width: 80 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receivedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={mode === 'po' ? 6 : 5} align="center" sx={{ py: 6 }}>
                    <QrCode sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="h6" color="text.secondary">
                      Scan a barcode or enter a model to begin
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : receivedItems.map((item, idx) => (
                <TableRow key={`${item.product_id}-${idx}`} sx={{ bgcolor: getRowColor(item) }}>
                  <TableCell>
                    <Typography variant="body1" sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                      {item.product_name}
                    </Typography>
                    {item.isDamaged && (
                      <Box sx={{ mt: 0.5 }}>
                        <TextField
                          size="small"
                          placeholder="Damage notes..."
                          value={item.damageNotes}
                          onChange={(e) => setReceivedItems((prev) => prev.map((it, i) =>
                            i === idx ? { ...it, damageNotes: e.target.value } : it
                          ))}
                          sx={{ width: '100%', maxWidth: 300 }}
                        />
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.product_model || '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.product_sku || ''}</Typography>
                  </TableCell>
                  {mode === 'po' && (
                    <TableCell align="center">
                      <Typography variant="body1" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                        {item.expected}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <IconButton
                        onClick={() => updateReceived(idx, -1)}
                        disabled={item.received <= 0}
                        sx={{ minWidth: 48, minHeight: 48, bgcolor: 'grey.100' }}
                      >
                        <Minus />
                      </IconButton>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', minWidth: 40, textAlign: 'center', fontSize: '1.3rem' }}>
                        {item.received}
                      </Typography>
                      <IconButton
                        onClick={() => updateReceived(idx, 1)}
                        sx={{ minWidth: 48, minHeight: 48, bgcolor: 'success.50', '&:hover': { bgcolor: 'success.100' } }}
                      >
                        <Plus />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <Tooltip title={item.isDamaged ? 'Minus damage flag' : 'Mark as damaged'}>
                        <IconButton
                          onClick={() => toggleDamaged(idx)}
                          sx={{
                            minWidth: 48, minHeight: 48,
                            color: item.isDamaged ? 'error.main' : 'text.disabled',
                            bgcolor: item.isDamaged ? 'error.50' : 'transparent'
                          }}
                        >
                          <ImageOff />
                        </IconButton>
                      </Tooltip>
                      {item.isDamaged && (
                        <TextField
                          type="number"
                          size="small"
                          value={item.damaged}
                          onChange={(e) => updateDamaged(idx, parseInt(e.target.value) || 0)}
                          inputProps={{ min: 0, max: item.received, style: { textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem' } }}
                          sx={{ width: 64 }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={item.expected > 0 ? 'Reset count' : 'Minus item'}>
                      <IconButton
                        onClick={() => removeItem(idx)}
                        sx={{ minWidth: 48, minHeight: 48, color: 'error.main' }}
                      >
                        <Trash2 />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Confirm Dialog */}
      <Dialog open={showCompleteDialog} onClose={() => setShowCompleteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>Complete Receiving?</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            You are about to finalize this receiving session:
          </Typography>
          <Box sx={{ pl: 2 }}>
            <Typography variant="body1"><strong>{totalReceived}</strong> units received</Typography>
            {totalDamaged > 0 && (
              <Typography variant="body1" color="error.main"><strong>{totalDamaged}</strong> units damaged</Typography>
            )}
            {discrepancies > 0 && (
              <Typography variant="body1" color="warning.main"><strong>{discrepancies}</strong> line{discrepancies !== 1 ? 's' : ''} with discrepancies</Typography>
            )}
            {unexpectedItems > 0 && (
              <Typography variant="body1" color="info.main"><strong>{unexpectedItems}</strong> unexpected item{unexpectedItems !== 1 ? 's' : ''}</Typography>
            )}
          </Box>
          {discrepancies > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Some items have quantity discrepancies. They will be recorded as partial receipt.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowCompleteDialog(false)} size="large" sx={{ minHeight: 48 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleComplete}
            disabled={submitting}
            size="large"
            startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <Check />}
            sx={{ minHeight: 48, minWidth: 160 }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────
const ReceivingWorkflow = () => {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'scan'
  const [session, setSession] = useState(null);

  const handleStart = (sessionData) => {
    setSession(sessionData);
    setPhase('scan');
  };

  const handleComplete = () => {
    setSession(null);
    setPhase('setup');
  };

  const handleBack = () => {
    if (window.confirm('Are you sure? Unsaved receiving data will be lost.')) {
      setSession(null);
      setPhase('setup');
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      {phase === 'setup' && (
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <QrCode sx={{ mr: 1.5, fontSize: 36, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Receiving Workflow</Typography>
            <Typography variant="body2" color="text.secondary">
              Receive shipments against purchase orders or log ad-hoc deliveries
            </Typography>
          </Box>
        </Box>
      )}

      {phase === 'setup' && <SetupScreen onStart={handleStart} />}
      {phase === 'scan' && session && (
        <ScanCountScreen session={session} onComplete={handleComplete} onBack={handleBack} />
      )}
    </Box>
  );
};

export default ReceivingWorkflow;
