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
import apiClient from '../../services/apiClient';
import { Link as RouterLink } from 'react-router-dom';

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

  // Stock Browser state
  const [stockProducts, setStockProducts] = useState([]);
  const [stockFilters, setStockFilters] = useState({
    search: '',
    stockStatus: 'in_stock', // Default to show in-stock items
    manufacturer: '',
    category: ''
  });
  const [stockPage, setStockPage] = useState(0);
  const [stockRowsPerPage, setStockRowsPerPage] = useState(25);
  const [stockTotal, setStockTotal] = useState(0);
  const [manufacturers, setManufacturers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (tabValue === 1) {
      fetchReservations();
    }
  }, [tabValue, reservationFilters]);

  // Fetch stock products when Stock Browser tab is active or filters change
  useEffect(() => {
    if (tabValue === 2) {
      fetchStockProducts();
    }
  }, [tabValue, stockFilters, stockPage, stockRowsPerPage]);

  const fetchStockProducts = async () => {
    try {
      setStockLoading(true);
      const params = new URLSearchParams({
        search: stockFilters.search,
        stockStatus: stockFilters.stockStatus,
        manufacturer: stockFilters.manufacturer,
        category: stockFilters.category,
        page: stockPage + 1,
        limit: stockRowsPerPage
      });
      const response = await apiClient.get(`${API_BASE}/inventory/products?${params}`, {
        headers: getAuthHeaders()
      });
      setStockProducts(response.data.products || []);
      setStockTotal(response.data.pagination?.total || 0);
      setManufacturers(response.data.manufacturers || []);
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Error fetching stock products:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
      setError(`Failed to load stock products: ${errorMsg}`);
    } finally {
      setStockLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch inventory summary and low stock products in parallel
      const [summaryRes, lowStockRes] = await Promise.all([
        apiClient.get(`${API_BASE}/inventory/summary`, { headers: getAuthHeaders() }).catch(() => ({ data: null })),
        apiClient.get(`${API_BASE}/inventory/low-stock`, { headers: getAuthHeaders() }).catch(() => ({ data: [] }))
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
      const response = await apiClient.get(`${API_BASE}/inventory/reservations`, {
        params: reservationFilters,
        headers: getAuthHeaders()
      });
      setReservations(response.data?.reservations || response.data?.data || []);
    } catch (err) {
      console.error('Error fetching reservations:', err);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);

      const response = await apiClient.post(`${API_BASE}/inventory/sync`, {}, { headers: getAuthHeaders() });
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
      await apiClient.delete(`${API_BASE}/inventory/reservations/${reservationId}`, { headers: getAuthHeaders() });
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
        <Tab
          icon={<Search sx={{ fontSize: 18, mr: 0.5 }} />}
          iconPosition="start"
          label="Stock Browser"
        />
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
          <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} sm={6} md={5}>
                <TextField
                  fullWidth
                  placeholder="Search by quote/order number..."
                  value={reservationFilters.search}
                  onChange={(e) => setReservationFilters({ ...reservationFilters, search: e.target.value })}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
                    sx: { height: 48 }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={reservationFilters.status}
                    label="Status"
                    onChange={(e) => setReservationFilters({ ...reservationFilters, status: e.target.value })}
                    sx={{ height: 48 }}
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    <MenuItem value="reserved">Reserved</MenuItem>
                    <MenuItem value="converted">Converted</MenuItem>
                    <MenuItem value="released">Released</MenuItem>
                    <MenuItem value="expired">Expired</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={fetchReservations}
                  sx={{ height: 48 }}
                >
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

      {/* Stock Browser Tab */}
      {tabValue === 2 && (
        <>
          {/* Quick Search Banner */}
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                component={RouterLink}
                to="/quick-search"
              >
                Open Quick Search
              </Button>
            }
          >
            <Typography variant="body2">
              Need advanced filters? Try <strong>Quick Search</strong> for intelligent product finding with clearance tracking, role-based pricing, and preset filters.
            </Typography>
          </Alert>

          {/* Stock Browser Filters */}
          <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  placeholder="Search model, name, brand..."
                  value={stockFilters.search}
                  onChange={(e) => {
                    setStockFilters({ ...stockFilters, search: e.target.value });
                    setStockPage(0);
                  }}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
                    sx: { height: 48 }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2.5}>
                <FormControl fullWidth>
                  <InputLabel>Stock Status</InputLabel>
                  <Select
                    value={stockFilters.stockStatus}
                    label="Stock Status"
                    onChange={(e) => {
                      setStockFilters({ ...stockFilters, stockStatus: e.target.value });
                      setStockPage(0);
                    }}
                    sx={{ height: 48 }}
                  >
                    <MenuItem value="all">All Products</MenuItem>
                    <MenuItem value="in_stock">In Stock</MenuItem>
                    <MenuItem value="low_stock">Low Stock</MenuItem>
                    <MenuItem value="out_of_stock">Out of Stock</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2.5}>
                <FormControl fullWidth>
                  <InputLabel>Brand</InputLabel>
                  <Select
                    value={stockFilters.manufacturer}
                    label="Brand"
                    onChange={(e) => {
                      setStockFilters({ ...stockFilters, manufacturer: e.target.value });
                      setStockPage(0);
                    }}
                    sx={{ height: 48, minWidth: 160 }}
                    MenuProps={{
                      PaperProps: {
                        style: { maxHeight: 300 }
                      }
                    }}
                  >
                    <MenuItem value="">All Brands</MenuItem>
                    {manufacturers.map((mfr) => (
                      <MenuItem key={mfr} value={mfr}>{mfr}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={6} md={1.5}>
                <Button
                  fullWidth
                  variant="outlined"
                  sx={{ height: 48 }}
                  onClick={() => {
                    setStockFilters({ search: '', stockStatus: 'in_stock', manufacturer: '', category: '' });
                    setStockPage(0);
                  }}
                >
                  Clear
                </Button>
              </Grid>
              <Grid item xs={6} sm={6} md={1.5}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<Refresh />}
                  sx={{ height: 48 }}
                  onClick={fetchStockProducts}
                >
                  Refresh
                </Button>
              </Grid>
            </Grid>

            {/* Category Chips */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
              <Chip
                label={`All (${stockTotal})`}
                onClick={() => {
                  setStockFilters(f => ({ ...f, category: '' }));
                  setStockPage(0);
                }}
                color={stockFilters.category === '' ? 'primary' : 'default'}
                variant={stockFilters.category === '' ? 'filled' : 'outlined'}
                size="small"
              />
              {categories.map((cat) => (
                <Chip
                  key={cat.master_category}
                  label={`${cat.master_category} (${cat.count})`}
                  onClick={() => {
                    setStockFilters(f => ({ ...f, category: cat.master_category }));
                    setStockPage(0);
                  }}
                  color={stockFilters.category === cat.master_category ? 'primary' : 'default'}
                  variant={stockFilters.category === cat.master_category ? 'filled' : 'outlined'}
                  size="small"
                />
              ))}
            </Box>
          </Paper>

          {/* Stock Products Table */}
          <Paper variant="outlined">
            {stockLoading && <LinearProgress />}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Model</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Product Name</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Brand</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>On Hand</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Reserved</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Available</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stockProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        {stockLoading ? (
                          <Typography color="text.secondary">Loading...</Typography>
                        ) : (
                          <>
                            <Inventory2 sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                            <Typography color="text.secondary">
                              No products found matching your filters
                            </Typography>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockProducts.map((product) => (
                      <TableRow key={product.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {product.model || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {product.name || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={product.master_category || 'Misc.'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '11px' }}
                          />
                        </TableCell>
                        <TableCell>{product.manufacturer || '-'}</TableCell>
                        <TableCell align="center">{product.qty_on_hand || 0}</TableCell>
                        <TableCell align="center" sx={{ color: product.qty_reserved > 0 ? 'warning.main' : 'text.secondary' }}>
                          {product.qty_reserved || 0}
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            sx={{
                              fontWeight: 'bold',
                              color: product.qty_available <= 0 ? 'error.main' : product.qty_available <= 3 ? 'warning.main' : 'success.main'
                            }}
                          >
                            {product.qty_available || 0}
                          </Typography>
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
            <TablePagination
              component="div"
              count={stockTotal}
              page={stockPage}
              onPageChange={(e, p) => setStockPage(p)}
              rowsPerPage={stockRowsPerPage}
              onRowsPerPageChange={(e) => { setStockRowsPerPage(parseInt(e.target.value)); setStockPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Paper>
        </>
      )}
    </Box>
  );
};

export default InventoryDashboard;
