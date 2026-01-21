import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  FunnelChart, Funnel, LabelList, Cell,
  LineChart, Line, PieChart, Pie
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PipelineAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('funnel');
  const [pipelineData, setPipelineData] = useState(null);
  const [salesVelocity, setSalesVelocity] = useState(null);
  const [atRiskQuotes, setAtRiskQuotes] = useState([]);
  const [dateRange, setDateRange] = useState(90);

  useEffect(() => {
    fetchPipelineData();
  }, [dateRange]);

  const fetchPipelineData = async () => {
    setLoading(true);
    try {
      const [pipelineRes, velocityRes, atRiskRes] = await Promise.all([
        fetch(`${API_URL}/api/quotations/analytics/pipeline-win-rates`).then(r => r.json()),
        fetch(`${API_URL}/api/analytics/sales-velocity?days=${dateRange}`).then(r => r.json()),
        fetch(`${API_URL}/api/quotations/analytics/at-risk?limit=10`).then(r => r.json())
      ]);

      setPipelineData(pipelineRes.data);
      setSalesVelocity(velocityRes.data);
      setAtRiskQuotes(atRiskRes.data || []);
    } catch (error) {
      console.error('Error fetching pipeline analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const STAGE_COLORS = {
    'DRAFT': '#9E9E9E',
    'SENT': '#2196F3',
    'VIEWED': '#03A9F4',
    'PENDING_APPROVAL': '#FF9800',
    'APPROVED': '#8BC34A',
    'COUNTER_OFFER': '#9C27B0',
    'NEGOTIATING': '#673AB7',
    'WON': '#4CAF50',
    'LOST': '#F44336',
    'EXPIRED': '#795548'
  };

  const funnelData = useMemo(() => {
    if (!pipelineData?.stages) return [];

    const activeStages = ['DRAFT', 'SENT', 'VIEWED', 'PENDING_APPROVAL', 'APPROVED', 'WON'];
    return activeStages
      .map(stage => {
        const stageData = pipelineData.stages.find(s => s.stage === stage);
        return stageData ? {
          name: stage.replace('_', ' '),
          value: stageData.count,
          fill: STAGE_COLORS[stage],
          winRate: stageData.actualWinRate
        } : null;
      })
      .filter(Boolean);
  }, [pipelineData]);

  const stageMetrics = useMemo(() => {
    if (!pipelineData?.stages) return [];

    return pipelineData.stages.map(stage => ({
      stage: stage.stage.replace('_', ' '),
      count: stage.count,
      value: stage.value / 100,
      expectedWinRate: stage.expectedProbability,
      actualWinRate: stage.actualWinRate,
      avgDealSize: stage.count > 0 ? Math.round(stage.value / stage.count / 100) : 0
    }));
  }, [pipelineData]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const renderFunnelTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Sales Pipeline Funnel
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip
                formatter={(value, name, props) => [
                  `${value} quotes (${props.payload.winRate}% win rate)`,
                  props.payload.name
                ]}
              />
              <Funnel
                data={funnelData}
                dataKey="value"
                nameKey="name"
                isAnimationActive
              >
                <LabelList
                  position="right"
                  fill="#000"
                  stroke="none"
                  dataKey="name"
                />
                <LabelList
                  position="center"
                  fill="#fff"
                  stroke="none"
                  dataKey="value"
                />
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stageMetrics.slice(0, 6).map((stage, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {stage.stage}
              </span>
              <span
                className="px-2 py-1 text-xs rounded-full"
                style={{
                  backgroundColor: STAGE_COLORS[stage.stage.replace(' ', '_')] + '20',
                  color: STAGE_COLORS[stage.stage.replace(' ', '_')]
                }}
              >
                {stage.count} quotes
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(stage.value)}
            </div>
            <div className="flex items-center mt-2 space-x-4 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Avg: {formatCurrency(stage.avgDealSize)}
              </span>
              <span className={stage.actualWinRate >= stage.expectedWinRate ? 'text-green-600' : 'text-red-600'}>
                {stage.actualWinRate}% win rate
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderWinRatesTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Win Rate by Stage: Expected vs Actual
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageMetrics} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="stage" width={120} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
              <Bar dataKey="expectedWinRate" name="Expected" fill="#90CAF9" />
              <Bar dataKey="actualWinRate" name="Actual" fill="#4CAF50" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Stage Conversion Analysis
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Stage
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Quotes
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total Value
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Avg Deal Size
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Expected Win %
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actual Win %
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Performance
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {stageMetrics.map((stage, idx) => {
                const performance = stage.actualWinRate - stage.expectedWinRate;
                return (
                  <tr key={idx}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="px-2 py-1 text-xs rounded-full"
                        style={{
                          backgroundColor: STAGE_COLORS[stage.stage.replace(' ', '_')] + '20',
                          color: STAGE_COLORS[stage.stage.replace(' ', '_')]
                        }}
                      >
                        {stage.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                      {stage.count}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                      {formatCurrency(stage.value)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                      {formatCurrency(stage.avgDealSize)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                      {stage.expectedWinRate}%
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {stage.actualWinRate}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${
                        performance >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {performance >= 0 ? '+' : ''}{performance.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSalesTeamTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Sales Team Performance (Last {dateRange} Days)
        </h3>
        {salesVelocity?.salespeople?.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesVelocity.salespeople.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="salesperson" />
                <YAxis yAxisId="left" orientation="left" stroke="#4CAF50" />
                <YAxis yAxisId="right" orientation="right" stroke="#2196F3" />
                <Tooltip formatter={(value, name) => [
                  name === 'winRate' ? `${value}%` : formatCurrency(value),
                  name === 'winRate' ? 'Win Rate' : 'Revenue'
                ]} />
                <Legend />
                <Bar yAxisId="left" dataKey="totalRevenue" name="Revenue" fill="#4CAF50" />
                <Bar yAxisId="right" dataKey="winRate" name="Win Rate %" fill="#2196F3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No sales data available for this period
          </p>
        )}
      </div>

      {salesVelocity?.salespeople?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Salesperson Leaderboard
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Salesperson
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Quotes
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Won
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Win Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Avg Deal
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Avg Days to Close
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {salesVelocity.salespeople.map((sp, idx) => (
                  <tr key={idx} className={idx < 3 ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {idx < 3 ? (
                        <span className={`
                          inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold
                          ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : 'bg-amber-700'}
                        `}>
                          {idx + 1}
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">{idx + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {sp.salesperson}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                      {sp.totalQuotes}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-green-600 font-medium">
                      {sp.wonQuotes}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${
                        sp.winRate >= 50 ? 'text-green-600' : sp.winRate >= 30 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {sp.winRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(sp.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                      {formatCurrency(sp.avgDealSize)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                      {sp.avgDaysToClose ? `${Math.round(sp.avgDaysToClose)} days` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderAtRiskTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          At-Risk Quotes (Low Win Probability)
        </h3>
        {atRiskQuotes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Quote
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Win Probability
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Risk Level
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Key Factors
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Recommendations
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {atRiskQuotes.map((quote, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {quote.quoteNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="px-2 py-1 text-xs rounded-full"
                        style={{
                          backgroundColor: STAGE_COLORS[quote.status] + '20',
                          color: STAGE_COLORS[quote.status]
                        }}
                      >
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${quote.winProbability}%`,
                              backgroundColor: quote.winProbability < 20 ? '#F44336' :
                                quote.winProbability < 40 ? '#FF9800' : '#4CAF50'
                            }}
                          />
                        </div>
                        <span className={`text-sm font-medium ${
                          quote.winProbability < 20 ? 'text-red-600' :
                          quote.winProbability < 40 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {quote.winProbability}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        quote.riskLevel === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        quote.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {quote.riskLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        {quote.factors?.quoteAge?.daysOld > 14 && (
                          <div>Age: {quote.factors.quoteAge.daysOld} days old</div>
                        )}
                        {quote.factors?.engagement?.views === 0 && (
                          <div>No views recorded</div>
                        )}
                        {quote.factors?.salesperson?.winRate < 30 && (
                          <div>Low salesperson win rate</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs space-y-1">
                        {quote.recommendations?.slice(0, 2).map((rec, ridx) => (
                          <div
                            key={ridx}
                            className={`px-2 py-1 rounded ${
                              rec.priority === 'high' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            }`}
                          >
                            {rec.message.substring(0, 50)}...
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No at-risk quotes found
          </p>
        )}
      </div>
    </div>
  );

  const tabs = [
    { id: 'funnel', label: 'Pipeline Funnel' },
    { id: 'winRates', label: 'Win Rates' },
    { id: 'salesTeam', label: 'Sales Team' },
    { id: 'atRisk', label: 'At-Risk Quotes' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pipeline Analytics
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Win rates, conversion analysis, and sales performance
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>

          <button
            onClick={fetchPipelineData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'funnel' && renderFunnelTab()}
      {activeTab === 'winRates' && renderWinRatesTab()}
      {activeTab === 'salesTeam' && renderSalesTeamTab()}
      {activeTab === 'atRisk' && renderAtRiskTab()}
    </div>
  );
};

export default PipelineAnalytics;
