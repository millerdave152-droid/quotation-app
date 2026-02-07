import { authFetch } from '../../../services/authFetch';
/**
 * RecommendationRulesPage - Admin interface for managing product recommendations
 * Location: Admin > Products > Recommendation Rules
 */

import { useState, useCallback } from 'react';
import {
  SparklesIcon,
  LinkIcon,
  Square3Stack3DIcon,
  BeakerIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import AutoRelationshipsTable from './AutoRelationshipsTable';
import CuratedRelationshipEditor from './CuratedRelationshipEditor';
import CategoryRulesEditor from './CategoryRulesEditor';
import RecommendationTester from './RecommendationTester';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Tab configuration
 */
const TABS = [
  {
    id: 'auto',
    name: 'Auto-Generated',
    icon: SparklesIcon,
    description: 'Frequently bought together (data-driven)',
  },
  {
    id: 'curated',
    name: 'Curated',
    icon: LinkIcon,
    description: 'Manually linked products',
  },
  {
    id: 'rules',
    name: 'Category Rules',
    icon: Square3Stack3DIcon,
    description: 'Category-based suggestions',
  },
  {
    id: 'tester',
    name: 'Test Tool',
    icon: BeakerIcon,
    description: 'Debug recommendations',
  },
];

/**
 * Stats card component
 */
function StatCard({ label, value, icon: Icon, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <Icon className="w-8 h-8 opacity-50" />
      </div>
    </div>
  );
}

/**
 * Main recommendation rules page
 */
export default function RecommendationRulesPage() {
  const [activeTab, setActiveTab] = useState('auto');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [stats, setStats] = useState({
    autoRelationships: 0,
    curatedRelationships: 0,
    activeRules: 0,
    totalImpressions: 0,
  });

  // Load stats on mount
  const loadStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/api/recommendations/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.metrics) {
          const totalImpressions = data.data.metrics.reduce(
            (sum, m) => sum + (m.impressions || 0),
            0
          );
          setStats((prev) => ({ ...prev, totalImpressions }));
        }
      }

      // Get relationship counts
      const relResponse = await authFetch(
        `${API_BASE}/api/recommendations/relationships?limit=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (relResponse.ok) {
        const relData = await relResponse.json();
        if (relData.pagination) {
          setStats((prev) => ({
            ...prev,
            autoRelationships: relData.pagination.total || 0,
          }));
        }
      }

      // Get curated count
      const curatedResponse = await authFetch(
        `${API_BASE}/api/recommendations/relationships?curated=true&limit=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (curatedResponse.ok) {
        const curatedData = await curatedResponse.json();
        if (curatedData.pagination) {
          setStats((prev) => ({
            ...prev,
            curatedRelationships: curatedData.pagination.total || 0,
          }));
        }
      }

      // Get rules count
      const rulesResponse = await authFetch(
        `${API_BASE}/api/recommendations/rules?active=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (rulesResponse.ok) {
        const rulesData = await rulesResponse.json();
        if (rulesData.data) {
          setStats((prev) => ({
            ...prev,
            activeRules: rulesData.data.length || 0,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  // Trigger refresh of auto-generated relationships
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshResult(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/api/recommendations/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          minCoPurchases: 2,
          minConfidence: 0.05,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRefreshResult({
          type: 'success',
          message: `Refreshed ${data.data.relationshipsUpdated} relationships in ${data.data.duration}`,
        });
        loadStats();
      } else {
        setRefreshResult({
          type: 'error',
          message: data.error || 'Refresh failed',
        });
      }
    } catch (error) {
      setRefreshResult({
        type: 'error',
        message: error.message || 'Failed to refresh recommendations',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'auto':
        return <AutoRelationshipsTable onStatsUpdate={loadStats} />;
      case 'curated':
        return <CuratedRelationshipEditor onStatsUpdate={loadStats} />;
      case 'rules':
        return <CategoryRulesEditor onStatsUpdate={loadStats} />;
      case 'tester':
        return <RecommendationTester />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Recommendation Rules
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage product recommendations and cross-sell suggestions
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh Result */}
              {refreshResult && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    refreshResult.type === 'success'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {refreshResult.type === 'success' ? (
                    <CheckCircleIcon className="w-4 h-4" />
                  ) : (
                    <ExclamationCircleIcon className="w-4 h-4" />
                  )}
                  {refreshResult.message}
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowPathIcon
                  className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <StatCard
              label="Auto Relationships"
              value={stats.autoRelationships.toLocaleString()}
              icon={SparklesIcon}
              color="blue"
            />
            <StatCard
              label="Curated Links"
              value={stats.curatedRelationships.toLocaleString()}
              icon={LinkIcon}
              color="green"
            />
            <StatCard
              label="Active Rules"
              value={stats.activeRules.toLocaleString()}
              icon={Square3Stack3DIcon}
              color="purple"
            />
            <StatCard
              label="Total Impressions"
              value={stats.totalImpressions.toLocaleString()}
              icon={BeakerIcon}
              color="orange"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 mt-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    group flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isActive
                        ? 'text-blue-500'
                        : 'text-gray-400 group-hover:text-gray-500'
                    }`}
                  />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="py-6">{renderTabContent()}</div>
      </div>
    </div>
  );
}
