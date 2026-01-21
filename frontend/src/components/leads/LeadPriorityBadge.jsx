/**
 * LeadPriorityBadge - Displays lead priority as a styled badge
 */

import React from 'react';

const priorityConfig = {
  hot: { label: 'HOT', className: 'priority-hot' },
  warm: { label: 'WARM', className: 'priority-warm' },
  cold: { label: 'COLD', className: 'priority-cold' }
};

function LeadPriorityBadge({ priority }) {
  const config = priorityConfig[priority] || { label: priority, className: '' };

  return (
    <span className={`priority-badge ${config.className}`}>
      {config.label}
    </span>
  );
}

export default LeadPriorityBadge;
