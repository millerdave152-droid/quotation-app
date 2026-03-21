/**
 * StoreManagerDashboard — Real-time retail KPIs for managers/admins.
 *
 * Layout (MUI Grid + Recharts):
 *   Row 1: 4 StatCards (Today Revenue, MTD Revenue, Avg Transaction, Open Quotes)
 *   Row 2: 30-day sales trend LineChart with period selector
 *   Row 3: Brand margin table | Aging inventory alerts
 *   Row 4: Rep leaderboard horizontal BarChart
 *   Row 5: Institutional summary strip
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, Button, ButtonGroup, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Alert, Skeleton,
} from '@mui/material';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  FileText, AlertTriangle, Building2, BarChart3,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import apiClient from '../../services/apiClient';

const API = '/api/retail-dashboard';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'WTD' },
  { value: 'month', label: 'MTD' },
  { value: 'quarter', label: 'QTD' },
  { value: 'year', label: 'YTD' },
];

const fmtCurrency = (cents) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
    .format((cents || 0) / 100);

const fmtNum = (n) => new Intl.NumberFormat('en-CA').format(n || 0);

// ── StatCard ────────────────────────────────────────────────────

function StatCard({ title, value, trendPct, icon: Icon, color = '#4f46e5', loading }) {
  if (loading) {
    return (
      <Paper sx={{ p: 2.5, height: '100%' }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" height={40} />
        <Skeleton variant="text" width="30%" />
      </Paper>
    );
  }

  const isPositive = trendPct >= 0;

  return (
    <Paper sx={{ p: 2.5, height: '100%', borderTop: `3px solid ${color}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
          {title}
        </Typography>
        <Icon size={20} style={{ color, opacity: 0.7 }} />
      </Box>
      <Typography variant="h5" fontWeight={700} sx={{ mt: 1 }}>
        {value}
      </Typography>
      {trendPct !== undefined && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          {isPositive ? (
            <TrendingUp size={14} style={{ color: '#10b981' }} />
          ) : (
            <TrendingDown size={14} style={{ color: '#ef4444' }} />
          )}
          <Typography variant="caption" sx={{ color: isPositive ? '#10b981' : '#ef4444', fontWeight: 600 }}>
            {isPositive ? '+' : ''}{trendPct}%
          </Typography>
          <Typography variant="caption" color="text.disabled">
            vs prior period
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// ── Custom Recharts Tooltip ─────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Paper sx={{ p: 1.5, boxShadow: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {payload.map((p, i) => (
        <Typography key={i} variant="body2" sx={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.name.includes('Revenue') ? fmtCurrency(p.value) : fmtNum(p.value)}
        </Typography>
      ))}
    </Paper>
  );
}

// ── Aging Status Chip ───────────────────────────────────────────

const AGING_COLORS = {
  critical: { bg: '#fef2f2', color: '#dc2626' },
  warning: { bg: '#fffbeb', color: '#d97706' },
  watch: { bg: '#eff6ff', color: '#2563eb' },
  healthy: { bg: '#f0fdf4', color: '#16a34a' },
  never_sold: { bg: '#f5f3ff', color: '#7c3aed' },
};

// ── Main Component ──────────────────────────────────────────────

export default function StoreManagerDashboard() {
  const [period, setPeriod] = useState('month');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);

  // Data state
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [brands, setBrands] = useState([]);
  const [aging, setAging] = useState([]);
  const [reps, setReps] = useState([]);
  const [institutional, setInstitutional] = useState(null);
  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = { period };
    if (location) params.location = location;

    try {
      const [sumRes, trendRes, brandRes, agingRes, repRes, instRes] = await Promise.all([
        apiClient.get(`${API}/sales/summary`, { params }).catch(() => ({ data: { data: null } })),
        apiClient.get(`${API}/sales/trend`, { params }).catch(() => ({ data: { data: [] } })),
        apiClient.get(`${API}/brands/margins`, { params }).catch(() => ({ data: { data: [] } })),
        apiClient.get(`${API}/inventory/aging`, { params: { agingStatus: 'critical' } }).catch(() => ({ data: { data: [] } })),
        apiClient.get(`${API}/reps/performance`, { params }).catch(() => ({ data: { data: [] } })),
        apiClient.get(`${API}/institutional/summary`, { params }).catch(() => ({ data: { data: null } })),
      ]);

      setSummary(sumRes.data.data);
      setTrend(trendRes.data.data || []);
      setBrands(brandRes.data.data || []);
      setAging(agingRes.data.data || []);
      setReps(repRes.data.data || []);
      setInstitutional(instRes.data.data);

      // Open quotes count from summary
      const totalOpenQuotes = (repRes.data.data || []).reduce((sum, r) => sum + (r.openQuotesCount || 0), 0);
      setOpenQuotesCount(totalOpenQuotes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period, location]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Retail Dashboard</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Location</InputLabel>
            <Select value={location} onChange={(e) => setLocation(e.target.value)} label="Location">
              <MenuItem value="">All Locations</MenuItem>
              <MenuItem value="Main Store">Main Store</MenuItem>
              <MenuItem value="Warehouse">Warehouse</MenuItem>
            </Select>
          </FormControl>
          <ButtonGroup size="small" variant="outlined">
            {PERIODS.map(p => (
              <Button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                variant={period === p.value ? 'contained' : 'outlined'}
              >
                {p.label}
              </Button>
            ))}
          </ButtonGroup>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Row 1: Stat Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={period === 'today' ? "Today's Revenue" : 'Period Revenue'}
            value={summary ? fmtCurrency(summary.current.totalRevenue) : '—'}
            trendPct={summary?.trends.revenueChangePct}
            icon={DollarSign}
            color="#10b981"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Transactions"
            value={summary ? fmtNum(summary.current.totalTransactions) : '—'}
            trendPct={summary?.trends.transactionChangePct}
            icon={ShoppingCart}
            color="#3b82f6"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Transaction"
            value={summary ? fmtCurrency(summary.current.avgTransaction) : '—'}
            icon={BarChart3}
            color="#8b5cf6"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Open Quotes"
            value={fmtNum(openQuotesCount)}
            icon={FileText}
            color="#f59e0b"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Row 2: Sales Trend Chart */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Sales Trend
        </Typography>
        {loading ? (
          <Skeleton variant="rectangular" height={300} />
        ) : trend.length === 0 ? (
          <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">No data for this period</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                fontSize={12}
              />
              <YAxis
                yAxisId="revenue"
                tickFormatter={(v) => `$${(v / 100).toLocaleString()}`}
                fontSize={12}
              />
              <YAxis yAxisId="txns" orientation="right" fontSize={12} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="txns"
                type="monotone"
                dataKey="transactions"
                name="Transactions"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Paper>

      {/* Row 3: Brand Margins + Aging Inventory */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Brand Margins */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
              Brand Margins — Top 10
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={250} />
            ) : (
              <TableContainer sx={{ maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Brand</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Revenue</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Margin %</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Units</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {brands.slice(0, 10).map((b, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{b.brandName}</TableCell>
                        <TableCell align="right">{fmtCurrency(b.revenueCents)}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${b.avgMarginPct}%`}
                            size="small"
                            sx={{
                              fontWeight: 600,
                              bgcolor: b.avgMarginPct >= 30 ? '#f0fdf4' : b.avgMarginPct >= 15 ? '#fffbeb' : '#fef2f2',
                              color: b.avgMarginPct >= 30 ? '#16a34a' : b.avgMarginPct >= 15 ? '#d97706' : '#dc2626',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{fmtNum(b.unitsSold)}</TableCell>
                      </TableRow>
                    ))}
                    {brands.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                          No brand data for this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Aging Inventory Alerts */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                <AlertTriangle size={16} style={{ marginRight: 6, color: '#dc2626', verticalAlign: 'text-bottom' }} />
                Aging Inventory
              </Typography>
              <Chip label={`${aging.length} critical`} size="small" color="error" variant="outlined" />
            </Box>
            {loading ? (
              <Skeleton variant="rectangular" height={250} />
            ) : (
              <TableContainer sx={{ maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Days</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {aging.slice(0, 8).map((item, i) => {
                      const agingColor = AGING_COLORS[item.agingStatus] || AGING_COLORS.healthy;
                      return (
                        <TableRow key={i} hover>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                              {item.productName}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">{item.sku}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            {item.daysSinceLastSale != null ? `${item.daysSinceLastSale}d` : 'Never'}
                          </TableCell>
                          <TableCell align="right">{item.qtyOnHand}</TableCell>
                          <TableCell align="center">
                            <Chip
                              label={item.agingStatus}
                              size="small"
                              sx={{
                                fontWeight: 600,
                                fontSize: 10,
                                bgcolor: agingColor.bg,
                                color: agingColor.color,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {aging.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                          No critical aging items
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Row 4: Rep Leaderboard */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Sales Rep Leaderboard
        </Typography>
        {loading ? (
          <Skeleton variant="rectangular" height={280} />
        ) : reps.length === 0 ? (
          <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">No rep data for this period</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, reps.length * 45 + 40)}>
            <BarChart data={reps} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `$${(v / 100).toLocaleString()}`}
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="repName"
                width={90}
                fontSize={12}
              />
              <Tooltip
                formatter={(v) => fmtCurrency(v)}
                labelStyle={{ fontWeight: 700 }}
              />
              <Bar dataKey="revenueCents" name="Revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Paper>

      {/* Row 5: Institutional Summary */}
      {institutional && (
        <Grid container spacing={2.5}>
          <Grid item xs={12} sm={4}>
            <Paper sx={{ p: 2, borderLeft: '3px solid #6366f1' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Building2 size={16} style={{ color: '#6366f1' }} />
                <Typography variant="body2" color="text.secondary">Open B2B Quotes</Typography>
              </Box>
              <Typography variant="h6" fontWeight={700}>
                {institutional.openQuotes.count}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {fmtCurrency(institutional.openQuotes.totalCents)} total
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Paper sx={{ p: 2, borderLeft: '3px solid #f59e0b' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <FileText size={16} style={{ color: '#f59e0b' }} />
                <Typography variant="body2" color="text.secondary">Outstanding AR</Typography>
              </Box>
              <Typography variant="h6" fontWeight={700}>
                {fmtCurrency(institutional.outstandingAR.outstandingCents)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {institutional.outstandingAR.count} invoice(s)
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Paper sx={{ p: 2, borderLeft: '3px solid #10b981' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <DollarSign size={16} style={{ color: '#10b981' }} />
                <Typography variant="body2" color="text.secondary">B2B Revenue (Period)</Typography>
              </Box>
              <Typography variant="h6" fontWeight={700}>
                {fmtCurrency(institutional.revenueSplit.b2bCents)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vs {fmtCurrency(institutional.revenueSplit.b2cCents)} B2C
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
