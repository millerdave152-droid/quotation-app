/**
 * LeadsPipelineContainer — Routes between Pipeline list and Lead detail
 * Reads :id from URL params to auto-open lead detail when navigated to /leads/:id
 * Includes RemindersPanel toggle and PushNotificationToggle
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LeadsPipelineView from './LeadsPipelineView';
import LeadDetailView from './LeadDetailView';
import RemindersPanel from './RemindersPanel';
import PushNotificationToggle from './PushNotificationToggle';

const BANNER_DISMISSED_KEY = 'leads_push_banner_dismissed';

function LeadsPipelineContainer() {
  const { id: urlLeadId } = useParams();
  const navigate = useNavigate();

  const [selectedLeadId, setSelectedLeadId] = useState(
    urlLeadId && urlLeadId !== 'pipeline' ? parseInt(urlLeadId) : null
  );
  const [showReminders, setShowReminders] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);

  useEffect(() => {
    if (urlLeadId && urlLeadId !== 'pipeline') {
      setSelectedLeadId(parseInt(urlLeadId));
    }
  }, [urlLeadId]);

  useEffect(() => {
    if (!localStorage.getItem(BANNER_DISMISSED_KEY)
      && 'Notification' in window
      && Notification.permission === 'default') {
      setShowPushBanner(true);
    }
  }, []);

  const dismissBanner = () => {
    setShowPushBanner(false);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  const handleLeadSelect = (lead) => {
    setSelectedLeadId(lead.id);
    setShowReminders(false);
    navigate(`/leads/${lead.id}`, { replace: true });
  };

  const handleBack = () => {
    setSelectedLeadId(null);
    navigate('/leads', { replace: true });
  };

  const handleQuoteSelect = (quote) => {
    if (quote.viewAllForCustomer) {
      navigate(`/quotes?customer=${quote.viewAllForCustomer}`);
    } else if (quote.id) {
      navigate(`/quotes?view=detail&id=${quote.id}`);
    }
  };

  const handleViewLeadFromReminder = (leadId) => {
    setSelectedLeadId(leadId);
    setShowReminders(false);
    navigate(`/leads/${leadId}`, { replace: true });
  };

  if (selectedLeadId) {
    return (
      <LeadDetailView
        leadId={selectedLeadId}
        onBack={handleBack}
        onQuoteSelect={handleQuoteSelect}
      />
    );
  }

  return (
    <div>
      {/* Push opt-in banner (shown once per browser) */}
      {showPushBanner && (
        <div style={{
          margin: '16px 24px 0', padding: '12px 16px',
          background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px'
        }}>
          <PushNotificationToggle compact />
          <button
            onClick={dismissBanner}
            style={{
              background: 'none', border: 'none', color: '#9ca3af',
              fontSize: '18px', cursor: 'pointer', padding: '4px', flexShrink: 0
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Pipeline list with inline Reminders button */}
      <LeadsPipelineView
        onLeadSelect={handleLeadSelect}
        onToggleReminders={() => setShowReminders(!showReminders)}
        showRemindersActive={showReminders}
      />

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
