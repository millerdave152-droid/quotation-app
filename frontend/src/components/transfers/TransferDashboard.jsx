/**
 * TransferDashboard — Stock transfer management
 * Combines TransferRequest form and TransferList
 */

import React, { useState } from 'react';
import TransferRequest from './TransferRequest';
import TransferList from './TransferList';

function TransferDashboard() {
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreated = () => {
    setShowRequestForm(false);
    setRefreshKey(k => k + 1);
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: '20px 24px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', borderBottom: '1px solid #e5e7eb'
      }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#111827' }}>
          Stock Transfers
        </h1>
        <button
          onClick={() => setShowRequestForm(!showRequestForm)}
          style={{
            padding: '8px 20px', background: showRequestForm ? '#6B7280' : '#1e40af',
            color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer'
          }}
        >
          {showRequestForm ? 'Close Form' : '+ Request Transfer'}
        </button>
      </div>

      {/* Request form (collapsible) */}
      {showRequestForm && (
        <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
          <TransferRequest
            onCreated={handleCreated}
            onCancel={() => setShowRequestForm(false)}
          />
        </div>
      )}

      {/* Transfer list */}
      <TransferList key={refreshKey} />
    </div>
  );
}

export default TransferDashboard;
