/**
 * LeadStatusBadge - Displays lead status as a styled pill
 */

import React from 'react';

const statusConfig = {
  new: { label: 'New', className: 'status-new' },
  contacted: { label: 'Contacted', className: 'status-contacted' },
  qualified: { label: 'Qualified', className: 'status-qualified' },
  quote_created: { label: 'Quote Created', className: 'status-quote_created' },
  converted: { label: 'Converted', className: 'status-converted' },
  lost: { label: 'Lost', className: 'status-lost' }
};

function LeadStatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, className: '' };

  return (
    <span className={`status-badge ${config.className}`}>
      {config.label}
    </span>
  );
}

export default LeadStatusBadge;
