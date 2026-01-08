import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Tooltip,
  IconButton,
  Card,
  CardContent
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Inventory2,
  LocalShipping,
  Assessment,
  Refresh,
  Visibility,
  Warning,
  CheckCircle,
  Info
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '-';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA');
};

const DemandBadge = ({ demandTag }) => {
  const badgeConfig = {
    fast_mover: { label: 'Fast Mover', color: 'success', icon: <TrendingUp fontSize="small" /> },
    slow_mover: { label: 'Slow Mover', color: 'warning', icon: <TrendingDown fontSize="small" /> },
    steady: { label: 'Steady', color: 'info', icon: <TrendingFlat fontSize="small" /> },
    high_interest_low_conversion: { label: 'High Interest', color: 'secondary', icon: <Visibility fontSize="small" /> },
    overstocked: { label: 'Overstocked', color: 'error', icon: <Inventory2 fontSize="small" /> },
    stockout_risk: { label: 'Stockout Risk', color: 'error', icon: <Warning fontSize="small" /> },
    normal: { label: 'Normal', color: 'default', icon: <CheckCircle fontSize="small" /> }
  };

  const config = badgeConfig[demandTag] || badgeConfig.normal;

  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size="small"
      sx={{ fontWeight: 'bold' }}
    />
  );
};

const StockStatusBadge = ({ status }) => {
  const statusConfig = {
    in_stock: { label: 'In Stock', color: 'success' },
    low_stock: { label: 'Low Stock', color: 'warning' },
    out_of_stock: { label: 'Out of Stock', color: 'error' },
    on_order: { label: 'On Order', color: 'info' }
  };

  const config = statusConfig[status] || statusConfig.in_stock;

  return (
    <Chip label={config.label} color={config.color} size="small" />
  );
};

const MetricCard = ({ title, value, subtitle, icon, color = 'primary' }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Box sx={{ color: `${color}.main`, mr: 1 }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold', color: `${color}.main` }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const ProductIntelligence = ({ productId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (productId) {
      fetchIntelligence();
    }
  }, [productId]);

  const fetchIntelligence = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE}/product-metrics/${productId}/intelligence`);
      setIntelligence(response.data);
    } catch (err) {
      console.error('Error fetching product intelligence:', err);
      setError(err.response?.data?.error || 'Failed to load product intelligence');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshMetrics = async () => {
    try {
      setRefreshing(true);
      await axios.post(`${API_BASE}/product-metrics/${productId}/refresh`);
      await fetchIntelligence();
    } catch (err) {
      console.error('Error refreshing metrics:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!intelligence) return null;

  const { product, metrics, inventory, recentQuotes, priceHistory } = intelligence;

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            {product.model_number}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {product.manufacturer} | {product.name}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <StockStatusBadge status={product.stockStatus} />
          <DemandBadge demandTag={metrics?.demand_tag} />
          <Tooltip title="Refresh Metrics">
            <IconButton onClick={handleRefreshMetrics} disabled={refreshing} size="small">
              <Refresh className={refreshing ? 'rotating' : ''} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Metrics Summary */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Sold (30 days)"
            value={metrics?.qty_sold_30d || 0}
            subtitle={`${metrics?.qty_sold_90d || 0} in 90 days`}
            icon={<Assessment />}
            color="primary"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Win Rate"
            value={metrics?.win_rate_30d ? `${metrics.win_rate_30d}%` : '-'}
            subtitle={`${metrics?.quotes_won_30d || 0} won / ${metrics?.quotes_lost_30d || 0} lost`}
            icon={<TrendingUp />}
            color="success"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Quoted (30 days)"
            value={metrics?.qty_quoted_30d || 0}
            icon={<Visibility />}
            color="info"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Avg Sell Price"
            value={formatCurrency(metrics?.avg_sell_price_cents)}
            subtitle={`MSRP: ${formatCurrency(product.msrp_cents)}`}
            icon={<Assessment />}
            color="secondary"
          />
        </Grid>
      </Grid>

      {/* Inventory Section */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Inventory2 sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6">Inventory Status</Typography>
        </Box>
        <Grid container spacing={3}>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">On Hand</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {inventory.onHand}
            </Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">Reserved</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
              {inventory.reserved}
            </Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">Available</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: inventory.available > 0 ? 'success.main' : 'error.main' }}>
              {inventory.available}
            </Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">On Order</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'info.main' }}>
              {inventory.onOrder}
            </Typography>
          </Grid>
        </Grid>

        {inventory.nextPO && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <LocalShipping sx={{ mr: 1, color: 'info.main' }} />
              <Typography variant="body2">
                <strong>{inventory.nextPO.quantity} units</strong> expected on{' '}
                <strong>{formatDate(inventory.nextPO.date)}</strong>
              </Typography>
            </Box>
          </Box>
        )}

        {inventory.lastSync && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Last synced: {new Date(inventory.lastSync).toLocaleString()}
          </Typography>
        )}
      </Paper>

      {/* Price Points */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Price Points</Typography>
        <Grid container spacing={2}>
          {[
            { label: 'MSRP', value: product.msrp_cents },
            { label: 'MAP', value: product.map_cents },
            { label: 'LAP', value: product.lap_cents },
            { label: 'UMRP', value: product.umrp_cents },
            { label: 'Cost', value: product.cost_cents }
          ].map((price) => (
            <Grid item xs={4} sm={2.4} key={price.label}>
              <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{price.label}</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {formatCurrency(price.value)}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {product.hasPromo && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'success.light', borderRadius: 1 }}>
            <Typography variant="body2" color="success.dark">
              <strong>Promo Price: {formatCurrency(product.promo_price_cents)}</strong>
              {' '}(Valid until {formatDate(product.promo_end_date)})
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Recent Quote Activity */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Recent Quote Activity</Typography>
        {recentQuotes && recentQuotes.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Quote #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentQuotes.map((quote) => (
                  <TableRow key={quote.id} hover>
                    <TableCell>{quote.quote_number}</TableCell>
                    <TableCell>{quote.customer_name || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        label={quote.status}
                        size="small"
                        color={
                          quote.status === 'WON' ? 'success' :
                          quote.status === 'LOST' ? 'error' :
                          quote.status === 'SENT' ? 'info' : 'default'
                        }
                      />
                    </TableCell>
                    <TableCell align="right">{quote.quantity}</TableCell>
                    <TableCell align="right">{formatCurrency(quote.unit_price_cents)}</TableCell>
                    <TableCell>{formatDate(quote.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No recent quote activity
          </Typography>
        )}
      </Paper>

      {/* Price History */}
      {priceHistory && priceHistory.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Price History</Typography>
          <TableContainer sx={{ maxHeight: 200 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell>Effective Date</TableCell>
                  <TableCell>Source</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {priceHistory.map((record, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Chip label={record.price_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(record.price_cents)}</TableCell>
                    <TableCell>{formatDate(record.effective_date)}</TableCell>
                    <TableCell>{record.source || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <style>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rotating {
          animation: rotate 1s linear infinite;
        }
      `}</style>
    </Box>
  );
};

export default ProductIntelligence;
