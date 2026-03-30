/**
 * LeadsPipelineContainer — Routes between Pipeline list and Lead detail
 * Includes RemindersPanel toggle
 */

import React, { useState } from 'react';
import LeadsPipelineView from './LeadsPipelineView';
import LeadDetailView from './LeadDetailView';
import RemindersPanel from './RemindersPanel';

function LeadsPipelineContainer() {
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showReminders, setShowReminders] = useState(false);

  const handleLeadSelect = (lead) => {
    setSelectedLeadId(lead.id);
    setShowReminders(false);
  };

  const handleBack = () => {
    setSelectedLeadId(null);
  };

  const handleQuoteSelect = (quote) => {
    if (quote.viewAllForCustomer) {
      window.location.href = `/quotations?customer=${quote.viewAllForCustomer}`;
    } else if (quote.id) {
      window.location.href = `/quotations/${quote.id}`;
    }
  };

  const handleViewLeadFromReminder = (leadId) => {
    setSelectedLeadId(leadId);
    setShowReminders(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Reminders toggle button */}
      {!selectedLeadId && (
        <button
          onClick={() => setShowReminders(!showReminders)}
          style={{
            position: 'fixed', top: '16px', right: '24px', zIndex: 1050,
            padding: '8px 16px', background: showReminders ? '#a8503d' : '#C8614A',
            color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(200, 97, 74, 0.3)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          {'\uD83D\uDD14'} Reminders
        </button>
      )}

      {/* Main content */}
      {selectedLeadId ? (
        <LeadDetailView
          leadId={selectedLeadId}
          onBack={handleBack}
          onQuoteSelect={handleQuoteSelect}
        />
      ) : (
        <LeadsPipelineView onLeadSelect={handleLeadSelect} />
      )}

      {/* Reminders slide-in panel */}
      {showReminders && (
        <RemindersPanel
          onClose={() => setShowReminders(false)}
          onViewLead={handleViewLeadFromReminder}
        />
      )}
    </div>
  );
}

export default LeadsPipelineContainer;
