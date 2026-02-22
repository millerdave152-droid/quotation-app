import React, { useState, Suspense } from 'react';

const ClientErrorDashboard = React.lazy(() => import('./ClientErrorDashboard'));
const DiscountAnalyticsDashboard = React.lazy(() => import('./DiscountAnalyticsDashboard'));

const tabs = [
  { id: 'errors', label: 'Client Errors' },
  { id: 'discounts', label: 'Discount Analytics' },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
);

export default function MonitoringHub() {
  const [activeTab, setActiveTab] = useState('errors');

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Monitoring</h1>
        <p style={{ color: '#6b7280', margin: '0 0 20px', fontSize: '14px' }}>
          Track frontend errors and analyze discount usage across the platform.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab.id ? '#667eea' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Suspense fallback={<Loading />}>
          {activeTab === 'errors' && <ClientErrorDashboard />}
          {activeTab === 'discounts' && <DiscountAnalyticsDashboard />}
        </Suspense>
      </div>
    </div>
  );
}
