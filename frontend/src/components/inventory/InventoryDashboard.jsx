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
  LinearProgress,
  Badge
} from '@mui/material';
import {
  Inventory2,
  Warning,
  CheckCircle,
  LocalShipping,
  Sync,
  Refresh,
  Search,
  FilterList,
  Delete,
  Visibility,
  Assignment,
  TrendingUp,
  TrendingDown,
  Schedule
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:3001') + '/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA');
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-CA');
};

const StockStatusBadge = ({ available, reserved, onHand }) => {
  let status = 'in_stock';
  let color = 'success';
  let label = 'In Stock';

  if (available <= 0) {
    status = 'out_of_stock';
    color = 'error';
    label = 'Out of Stock';
  } else if (available <= 3) {
    status = 'low_stock';
    color = 'warning';
    label = 'Low Stock';
  }

  return <Chip label={label} color={color} size="small" />;
};

const ReservationStatusChip = ({ status }) => {
  const statusConfig = {
    reserved: { color: 'info', label: 'Reserved' },
    released: { color: 'default', label: 'Released' },
    converted: { color: 'success', label: 'Converted' },
    expired: { color: 'error', label: 'Expired' }
  };

  const config = statusConfig[status] || { color: 'default', label: status };
  return <Chip label={config.label} color={config.color} size="small" />;
};

const SummaryCard = ({ title, value, subtitle, icon, color = 'primary', trend }) => (
  <Card variant="outlined">
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Box sx={{ color: `${color}.main`, mr: 1 }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: `${color}.main` }}>
          {value}
        </Typography>
        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: trend > 0 ? 'success.main' : 'error.main' }}>
            {trend > 0 ? <TrendingUp fontSize="small" /> : <TrendingDown fontSize="small" />}
            <Typography variant="caption">{Math.abs(trend)}%</Typography>
          </Box>
        )}
      </Box>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      )}
    </CardContent>
  </Card>
);

const InventoryDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  // Summary data
  const [summary, setSummary] = useState({
    totalProducts: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
    totalReserved: 0,
    lastSync: null
  });

  // Products with low stock
  const [lowStockProducts, setLowStockProducts] = useState([]);

  // Reservations
  const [reservations, setReservations] = useState([]);
  const [reservationFilters, setReservationFilters] = useState({
    status: 'reserved',
    search: ''
  });

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (tabValue === 1) {
      fetchReservations();
    }
  }, [tabValue, reservationFilters]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch inventory summary and low stock products in parallel
      const [summaryRes, lowStockRes] = await Promise.all([
        axios.get(`${API_BASE}/inventory/summary`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/inventory/low-stock`).catch(() => ({ data: [] }))
      ]);

      if (summaryRes.data) {
        setSummary(summaryRes.data);
      }
      setLowStockProducts(lowStockRes.data || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const fetchReservations = async () => {
    try {
      const response = await axios.get(`${API_BASE}/inventory/reservations`, {
        params: reservationFilters
      });
      setReservations(response.data);
    } catch (err) {
      console.error('Error fetching reservations:', err);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);

      const response = await axios.post(`${API_BASE}/inventory/sync`);
      setSyncResult({
        success: true,
        message: `Synced ${response.data.updated || 0} products`
      });
      fetchDashboardData();
    } catch (err) {
      setSyncResult({
        success: false,
        message: err.response?.data?.error || 'Sync failed'
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleReleaseReservation = async (reservationId) => {
    if (!window.confirm('Are you sure you want to release this reservation?')) return;

    try {
      await axios.delete(`${API_BASE}/inventory/reservations/${reservationId}`);
      fetchReservations();
      fetchDashboardData();
    } catch (err) {
      setError('Failed to release reservation');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          <Inventory2 sx={{ mr: 1, fontSize: 32 }} /> Inventory Dashboard
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchDashboardData}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <Sync />}
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync from ERP'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {syncResult && (
        <Alert
          severity={syncResult.success ? 'success' : 'error'}
          sx={{ mb: 3 }}
          onClose={() => setSyncResult(null)}
        >
          {syncResult.message}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={2.4}>
          <SummaryCard
            title="Total Products"
            value={summary.totalProducts || 0}
            icon={<Inventory2 />}
            color="primary"
          />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <SummaryCard
            title="In Stock"
            value={summary.inStock || 0}
            icon={<CheckCircle />}
            color="success"
          />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <SummaryCard
            title="Low Stock"
            value={summary.lowStock || 0}
            icon={<Warning />}
            color="warning"
          />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <SummaryCard
            title="Out of Stock"
            value={summary.outOfStock || 0}
            icon={<Warning />}
            color="error"
          />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <SummaryCard
            title="Reserved"
            value={summary.totalReserved || 0}
            icon={<Assignment />}
            color="info"
          />
        </Grid>
      </Grid>

      {/* Last Sync Info */}
      {summary.lastSync && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Schedule sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              Last synced: {formatDateTime(summary.lastSync)}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab
          label={
            <Badge badgeContent={lowStockProducts.length} color="warning">
              Low Stock Alerts
            </Badge>
          }
        />
        <Tab label="Reservations" />
      </Tabs>

      {/* Low Stock Tab */}
      {tabValue === 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Manufacturer</TableCell>
                  <TableCell align="center">On Hand</TableCell>
                  <TableCell align="center">Reserved</TableCell>
                  <TableCell align="center">Available</TableCell>
                  <TableCell align="center">On Order</TableCell>
                  <TableCell>Next PO</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lowStockProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                      <Typography color="text.secondary">No low stock alerts</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  lowStockProducts.map((product) => (
                    <TableRow key={product.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {product.model_number}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {product.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{product.manufacturer}</TableCell>
                      <TableCell align="center">{product.qty_on_hand || 0}</TableCell>
                      <TableCell align="center" sx={{ color: 'warning.main' }}>
                        {product.qty_reserved || 0}
                      </TableCell>
                      <TableCell align="center">
                        <Typography
                          sx={{
                            fontWeight: 'bold',
                            color: (product.qty_available || 0) <= 0 ? 'error.main' : 'success.main'
                          }}
                        >
                          {product.qty_available || 0}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ color: 'info.main' }}>
                        {product.qty_on_order || 0}
                      </TableCell>
                      <TableCell>
                        {product.next_po_date ? (
                          <Box>
                            <Typography variant="body2">{formatDate(product.next_po_date)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {product.next_po_qty} units
                            </Typography>
                          </Box>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge
                          available={product.qty_available}
                          reserved={product.qty_reserved}
                          onHand={product.qty_on_hand}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Reservations Tab */}
      {tabValue === 1 && (
        <>
          {/* Reservation Filters */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search by quote/order number..."
                  value={reservationFilters.search}
                  onChange={(e) => setReservationFilters({ ...reservationFilters, search: e.target.value })}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={reservationFilters.status}
                    label="Status"
                    onChange={(e) => setReservationFilters({ ...reservationFilters, status: e.target.value })}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="reserved">Reserved</MenuItem>
                    <MenuItem value="converted">Converted</MenuItem>
                    <MenuItem value="released">Released</MenuItem>
                    <MenuItem value="expired">Expired</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button fullWidth variant="outlined" startIcon={<Refresh />} onClick={fetchReservations}>
                  Refresh
                </Button>
              </Grid>
            </Grid>
          </Paper>

          <Paper variant="outlined">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>Quote/Order</TableCell>
                    <TableCell align="center">Quantity</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Reserved At</TableCell>
                    <TableCell>Expires At</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reservations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No reservations found</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reservations.map((reservation) => (
                      <TableRow key={reservation.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {reservation.model_number || reservation.product_id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {reservation.quote_number && (
                            <Chip label={`Q: ${reservation.quote_number}`} size="small" variant="outlined" />
                          )}
                          {reservation.order_number && (
                            <Chip label={`O: ${reservation.order_number}`} size="small" color="success" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                          {reservation.quantity}
                        </TableCell>
                        <TableCell>
                          <ReservationStatusChip status={reservation.status} />
                        </TableCell>
                        <TableCell>{formatDateTime(reservation.reserved_at)}</TableCell>
                        <TableCell>
                          {reservation.expires_at ? (
                            <Typography
                              variant="body2"
                              sx={{
                                color: new Date(reservation.expires_at) < new Date() ? 'error.main' : 'text.primary'
                              }}
                            >
                              {formatDateTime(reservation.expires_at)}
                            </Typography>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {reservation.status === 'reserved' && (
                            <Tooltip title="Release Reservation">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleReleaseReservation(reservation.id)}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={reservations.length}
              page={page}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            />
          </Paper>
        </>
      )}
    </Box>
  );
};

export default InventoryDashboard;
