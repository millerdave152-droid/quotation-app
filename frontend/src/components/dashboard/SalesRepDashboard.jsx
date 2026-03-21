/**
 * SalesRepDashboard — Personal sales dashboard for reps.
 *
 * Layout:
 *   Row 1: My Sales Today | My MTD | My Open Quotes | My Close Rate
 *   Row 2: My Pipeline — PieChart (quote status breakdown)
 *   Row 3: My Top Products last 30 days — table
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Skeleton,
  Alert, ButtonGroup, Button,
} from '@mui/material';
import {
  DollarSign, ShoppingCart, FileText, Target,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import apiClient from '../../services/apiClient';

const API = '/api/retail-dashboard';

const fmtCurrency = (cents) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
    .format((cents || 0) / 100);

const fmtNum = (n) => new Intl.NumberFormat('en-CA').format(n || 0);

const PIE_COLORS = {
  DRAFT: '#94a3b8',
  SENT: '#3b82f6',
  WON: '#10b981',
  LOST: '#ef4444',
};

// ── StatCard (simplified) ───────────────────────────────────────

function StatCard({ title, value, subtitle, icon: Icon, color, loading }) {
  if (loading) {
    return (
      <Paper sx={{ p: 2.5, height: '100%' }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" height={40} />
      </Paper>
    );
  }

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
      {subtitle && (
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      )}
    </Paper>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function SalesRepDashboard() {
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [todaySummary, setTodaySummary] = useState(null);
  const [periodSummary, setPeriodSummary] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [todayRes, periodRes, pipelineRes, productsRes] = await Promise.all([
        apiClient.get(`${API}/my/summary`, { params: { period: 'today' } }).catch(() => ({ data: { data: null } })),
        apiClient.get(`${API}/my/summary`, { params: { period } }).catch(() => ({ data: { data: null } })),
        apiClient.get(`${API}/my/pipeline`).catch(() => ({ data: { data: [] } })),
        apiClient.get(`${API}/my/top-products`).catch(() => ({ data: { data: [] } })),
      ]);

      setTodaySummary(todayRes.data.data);
      setPeriodSummary(periodRes.data.data);
      setPipeline(pipelineRes.data.data || []);
      setTopProducts(productsRes.data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Compute close rate from pipeline
  const wonCount = parseInt(pipeline.find(p => p.status === 'WON')?.count, 10) || 0;
  const lostCount = parseInt(pipeline.find(p => p.status === 'LOST')?.count, 10) || 0;
  const closeRate = (wonCount + lostCount) > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : 0;

  const openQuotes = pipeline
    .filter(p => ['DRAFT', 'SENT'].includes(p.status))
    .reduce((s, p) => s + (parseInt(p.count, 10) || 0), 0);

  // Pie chart data
  const pieData = pipeline.map(p => ({
    name: p.status,
    value: parseInt(p.count, 10) || 0,
    totalCents: parseInt(p.total_cents, 10) || 0,
  }));

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>My Dashboard</Typography>
        <ButtonGroup size="small" variant="outlined">
          {[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'WTD' },
            { value: 'month', label: 'MTD' },
            { value: 'quarter', label: 'QTD' },
          ].map(p => (
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Row 1: Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="My Sales Today"
            value={todaySummary ? fmtCurrency(todaySummary.current.totalRevenue) : '—'}
            subtitle={todaySummary ? `${todaySummary.current.totalTransactions} transactions` : ''}
            icon={DollarSign}
            color="#10b981"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={period === 'today' ? 'Today' : `My ${period.toUpperCase()}`}
            value={periodSummary ? fmtCurrency(periodSummary.current.totalRevenue) : '—'}
            subtitle={periodSummary ? `${periodSummary.current.totalTransactions} transactions` : ''}
            icon={ShoppingCart}
            color="#3b82f6"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="My Open Quotes"
            value={fmtNum(openQuotes)}
            icon={FileText}
            color="#f59e0b"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Close Rate (90d)"
            value={`${closeRate}%`}
            subtitle={`${wonCount} won / ${wonCount + lostCount} decided`}
            icon={Target}
            color="#8b5cf6"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Row 2: Pipeline PieChart */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
              My Pipeline (Last 90 Days)
            </Typography>
            {loading ? (
              <Skeleton variant="circular" width={200} height={200} sx={{ mx: 'auto' }} />
            ) : pieData.length === 0 ? (
              <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No quotes in pipeline</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, props) => [
                      `${value} quotes (${fmtCurrency(props.payload.totalCents)})`,
                      name,
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Row 3: Top Products */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
              My Top Products (Last 30 Days)
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={250} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Brand</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Units</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Revenue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topProducts.map((p, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                            {p.product_name}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">{p.sku}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={p.brand_name || 'Unknown'} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{fmtNum(p.units_sold)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#10b981' }}>
                          {fmtCurrency(parseInt(p.revenue_cents))}
                        </TableCell>
                      </TableRow>
                    ))}
                    {topProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                          No sales data in the last 30 days
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
    </Box>
  );
}
