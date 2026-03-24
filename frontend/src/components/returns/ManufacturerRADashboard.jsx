import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Button,
  TextField, Select, MenuItem, FormControl, InputLabel, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Alert,
  CircularProgress, Tooltip
} from '@mui/material';
import {
  RefreshCw, Plus, Download, ChevronRight, AlertTriangle,
  Clock, CheckCircle, XCircle, Truck, DollarSign, MessageSquare
} from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { useAuth } from '../../contexts/AuthContext';

const API = (process.env.REACT_APP_API_URL || '') + '/api';

const STATUS_CONFIG = {
  pending_approval: { label: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
  approved: { label: 'Approved', color: '#3b82f6', bg: '#dbeafe' },
  shipped: { label: 'Shipped', color: '#8b5cf6', bg: '#ede9fe' },
  received: { label: 'Received', color: '#06b6d4', bg: '#cffafe' },
  credited: { label: 'Credited', color: '#10b981', bg: '#dcfce7' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#f3f4f6' },
  denied: { label: 'Denied', color: '#dc2626', bg: '#fee2e2' }
};

const REASONS = ['defective', 'warranty', 'damaged', 'wrong_item'];
const CARRIERS = ['FedEx', 'UPS', 'Purolator', 'Canada Post', 'DHL', 'Other'];

const fmt = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

export default function ManufacturerRADashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;

  const [ras, setRAs] = useState([]);
  const [summary, setSummary] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [filterMfr, setFilterMfr] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Dialogs
  const [detailRA, setDetailRA] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [creditDialog, setCreditDialog] = useState(null);
  const [creditAmt, setCreditAmt] = useState('');
  const [creditRef, setCreditRef] = useState('');

  // Create form
  const [newRA, setNewRA] = useState({
    manufacturer: '', reason: 'defective', product_id: '',
    serial_number: '', notes: '', shipping_tracking_number: '',
    shipping_carrier: '', expected_credit_date: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterMfr) params.set('manufacturer', filterMfr);
      if (filterStatus) params.set('status', filterStatus);
      if (overdueOnly) params.set('overdue_only', 'true');

      const [listRes, summaryRes] = await Promise.all([
        authFetch(`${API}/manufacturer-ras?${params}`),
        authFetch(`${API}/manufacturer-ras/report/by-manufacturer`)
      ]);
      const listData = await listRes.json();
      const summaryData = await summaryRes.json();

      setRAs(listData.data?.rows || []);
      setTotal(listData.data?.total || 0);
      setSummary(summaryData.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterMfr, filterStatus, overdueOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    try {
      await authFetch(`${API}/manufacturer-ras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRA)
      });
      setShowCreate(false);
      setNewRA({ manufacturer: '', reason: 'defective', product_id: '', serial_number: '', notes: '', shipping_tracking_number: '', shipping_carrier: '', expected_credit_date: '' });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !detailRA) return;
    try {
      await authFetch(`${API}/manufacturer-ras/${detailRA.id}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText })
      });
      setNoteText('');
      const res = await authFetch(`${API}/manufacturer-ras/${detailRA.id}`);
      const data = await res.json();
      setDetailRA(data.data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCredit = async () => {
    if (!creditDialog) return;
    try {
      await authFetch(`${API}/manufacturer-ras/${creditDialog.id}/credit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credit_amount: Math.round(parseFloat(creditAmt) * 100),
          credit_reference: creditRef
        })
      });
      setCreditDialog(null);
      setCreditAmt('');
      setCreditRef('');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExport = () => {
    window.open(`${API}/manufacturer-ras/report/export`, '_blank');
  };

  const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.closed;
    return (
      <Chip
        label={cfg.label}
        size="small"
        sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: '0.75rem' }}
      />
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Manufacturer Return Authorizations</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isManager && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setShowCreate(true)}>
              New RA
            </Button>
          )}
          <Button variant="outlined" startIcon={<Download size={18} />} onClick={handleExport}>Export CSV</Button>
          <IconButton onClick={fetchData}><RefreshCw size={20} /></IconButton>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Manufacturer Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {summary.map((m) => (
          <Grid item xs={12} sm={6} md={3} key={m.manufacturer}>
            <Card variant="outlined">
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">{m.manufacturer}</Typography>
                <Typography variant="h4" fontWeight={700}>{m.open_ras}</Typography>
                <Typography variant="caption" color="text.secondary">open RAs</Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                  {parseInt(m.overdue_ras) > 0 && (
                    <Chip icon={<AlertTriangle size={14} />} label={`${m.overdue_ras} overdue`}
                      size="small" sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontWeight: 600 }} />
                  )}
                  {parseInt(m.expected_credit) > 0 && (
                    <Typography variant="caption" color="success.main">
                      {fmt(m.expected_credit)} expected
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" label="Manufacturer" value={filterMfr}
          onChange={(e) => setFilterMfr(e.target.value)} sx={{ minWidth: 180 }} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select value={filterStatus} label="Status" onChange={(e) => setFilterStatus(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant={overdueOnly ? 'contained' : 'outlined'} color="error" size="small"
          onClick={() => setOverdueOnly(!overdueOnly)} startIcon={<AlertTriangle size={16} />}>
          Overdue Only
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {total} total RAs
        </Typography>
      </Paper>

      {/* RA Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700 }}>RA #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Manufacturer</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Serial</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Days Out</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Credit</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {ras.map((ra) => {
                const overdue = ra.days_outstanding > 30 && !['closed', 'denied', 'credited'].includes(ra.status);
                return (
                  <TableRow key={ra.id} hover sx={overdue ? { bgcolor: '#fef2f2' } : {}}>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{ra.ra_number}</TableCell>
                    <TableCell>{ra.manufacturer}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{ra.product_name || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{ra.product_sku || ''}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ra.serial_number || '—'}</TableCell>
                    <TableCell><Chip label={ra.reason} size="small" variant="outlined" /></TableCell>
                    <TableCell><StatusBadge status={ra.status} /></TableCell>
                    <TableCell align="right" sx={{
                      fontWeight: 600, color: overdue ? '#dc2626' : '#374151'
                    }}>
                      {ra.days_outstanding || 0}d
                      {overdue && <AlertTriangle size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                    </TableCell>
                    <TableCell align="right">{ra.credit_amount ? fmt(ra.credit_amount) : '—'}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setDetailRA(ra)}>
                        <ChevronRight size={18} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
              {ras.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No return authorizations found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailRA} onClose={() => setDetailRA(null)} maxWidth="md" fullWidth>
        {detailRA && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>{detailRA.ra_number}</Typography>
                <Typography variant="body2" color="text.secondary">{detailRA.manufacturer}</Typography>
              </Box>
              <StatusBadge status={detailRA.status} />
            </DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Product</Typography>
                  <Typography>{detailRA.product_name || '—'} ({detailRA.product_sku || '—'})</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Serial Number</Typography>
                  <Typography fontFamily="monospace">{detailRA.serial_number || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Manufacturer RA#</Typography>
                  <Typography fontFamily="monospace">{detailRA.manufacturer_ra_number || 'Not assigned'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Reason</Typography>
                  <Typography>{detailRA.reason}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Shipped</Typography>
                  <Typography>{detailRA.shipped_date || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Tracking</Typography>
                  <Typography fontFamily="monospace" fontSize="0.85rem">
                    {detailRA.shipping_tracking_number || '—'}
                    {detailRA.shipping_carrier && ` (${detailRA.shipping_carrier})`}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Expected Credit Date</Typography>
                  <Typography>{detailRA.expected_credit_date || '—'}</Typography>
                </Grid>
                {detailRA.credit_amount > 0 && (
                  <Grid item xs={12}>
                    <Alert severity="success" icon={<DollarSign size={20} />}>
                      Credited: {fmt(detailRA.credit_amount)} — Ref: {detailRA.credit_reference || '—'} — Date: {detailRA.credit_date || '—'}
                    </Alert>
                  </Grid>
                )}
                {detailRA.notes && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">Notes</Typography>
                    <Typography>{detailRA.notes}</Typography>
                  </Grid>
                )}
              </Grid>

              {/* Communication Log */}
              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1 }}>
                Communication Log
              </Typography>
              <Box sx={{ maxHeight: 200, overflow: 'auto', bgcolor: '#f8fafc', borderRadius: 1, p: 1.5 }}>
                {(detailRA.communication_log || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No notes yet</Typography>
                ) : (
                  (detailRA.communication_log || []).map((entry, i) => (
                    <Box key={i} sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px solid #e5e7eb' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" fontWeight={600}>{entry.user_name || 'System'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(entry.date).toLocaleString('en-CA')}
                        </Typography>
                      </Box>
                      <Typography variant="body2">{entry.note}</Typography>
                    </Box>
                  ))
                )}
              </Box>

              {/* Add Note */}
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <TextField size="small" fullWidth placeholder="Add a note..."
                  value={noteText} onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()} />
                <Button variant="contained" size="small" onClick={handleAddNote}
                  startIcon={<MessageSquare size={16} />}>Add</Button>
              </Box>
            </DialogContent>
            <DialogActions>
              {isAdmin && detailRA.status !== 'credited' && detailRA.status !== 'closed' && detailRA.status !== 'denied' && (
                <Button color="success" variant="contained" startIcon={<DollarSign size={16} />}
                  onClick={() => { setCreditDialog(detailRA); setDetailRA(null); }}>
                  Mark Credited
                </Button>
              )}
              <Button onClick={() => setDetailRA(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Manufacturer RA</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Manufacturer" required value={newRA.manufacturer}
            onChange={(e) => setNewRA({ ...newRA, manufacturer: e.target.value })} />
          <FormControl>
            <InputLabel>Reason</InputLabel>
            <Select value={newRA.reason} label="Reason"
              onChange={(e) => setNewRA({ ...newRA, reason: e.target.value })}>
              {REASONS.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Serial Number" value={newRA.serial_number}
            onChange={(e) => setNewRA({ ...newRA, serial_number: e.target.value })} />
          <TextField label="Tracking Number" value={newRA.shipping_tracking_number}
            onChange={(e) => setNewRA({ ...newRA, shipping_tracking_number: e.target.value })} />
          <FormControl>
            <InputLabel>Carrier</InputLabel>
            <Select value={newRA.shipping_carrier} label="Carrier"
              onChange={(e) => setNewRA({ ...newRA, shipping_carrier: e.target.value })}>
              {CARRIERS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Expected Credit Date" type="date" InputLabelProps={{ shrink: true }}
            value={newRA.expected_credit_date}
            onChange={(e) => setNewRA({ ...newRA, expected_credit_date: e.target.value })} />
          <TextField label="Notes" multiline rows={2} value={newRA.notes}
            onChange={(e) => setNewRA({ ...newRA, notes: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newRA.manufacturer}>Create RA</Button>
        </DialogActions>
      </Dialog>

      {/* Credit Dialog */}
      <Dialog open={!!creditDialog} onClose={() => setCreditDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark as Credited</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Typography variant="body2">RA: {creditDialog?.ra_number} — {creditDialog?.manufacturer}</Typography>
          <TextField label="Credit Amount ($)" type="number" required value={creditAmt}
            onChange={(e) => setCreditAmt(e.target.value)} />
          <TextField label="Credit Reference #" value={creditRef}
            onChange={(e) => setCreditRef(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreditDialog(null)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleCredit}
            disabled={!creditAmt}>Confirm Credit</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
