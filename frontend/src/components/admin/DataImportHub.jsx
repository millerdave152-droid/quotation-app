import React, { useState, Suspense } from 'react';

const SkulyticsImport = React.lazy(() => import('./SkulyticsImport'));
const CEProductImport = React.lazy(() => import('./CEProductImport'));
const SkulyticsHealth = React.lazy(() => import('./SkulyticsHealth'));

const tabs = [
  { id: 'skulytics', label: 'Skulytics Import' },
  { id: 'ce-import', label: 'CE Import' },
  { id: 'sync-health', label: 'Sync Health' },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
);

export default function DataImportHub() {
  const [activeTab, setActiveTab] = useState('skulytics');

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Data Import</h1>
        <p style={{ color: '#6b7280', margin: '0 0 20px', fontSize: '14px' }}>
          Import products from Skulytics catalogue, Barcode Lookup / Icecat, and monitor sync health.
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
          {activeTab === 'skulytics' && <SkulyticsImport />}
          {activeTab === 'ce-import' && <CEProductImport />}
          {activeTab === 'sync-health' && <SkulyticsHealth />}
        </Suspense>
      </div>
    </div>
  );
}
