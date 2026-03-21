/**
 * ActionItemsWidget — Follow-up action items panel.
 *
 * Calls GET /api/notes/action-items on mount.
 * Collapsible panel showing upcoming follow-ups from voice notes.
 * Deployed in POS and Quotation sidebars.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip } from '@mui/material';
import { ChevronDown, ChevronUp, Calendar, User } from 'lucide-react';
import apiClient from '../../services/apiClient';

export default function ActionItemsWidget({ refreshTrigger = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();

  const fetchItems = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/notes/action-items');
      setItems(data.data || []);
    } catch {
      // Silent — widget is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems, refreshTrigger]);

  if (loading || items.length === 0) {
    if (loading) return null;
    // Empty state
    return (
      <div style={{
        background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px',
        padding: '14px 16px', marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '14px', fontWeight: 600, color: '#6b7280',
        }}>
          <Calendar size={16} />
          Your Follow-ups (0)
        </div>
        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
          No follow-ups due this week.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px',
      padding: '14px 16px', marginBottom: '16px',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: '14px', fontWeight: 600, color: '#1e293b',
        }}
      >
        <Calendar size={16} color="#3b82f6" />
        Your Follow-ups ({items.length})
        <span style={{ marginLeft: 'auto' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Items */}
      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {items.map((item) => {
            const dueDate = new Date(item.follow_up_date + 'T00:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isToday = dueDate.getTime() === today.getTime();
            const isPast = dueDate < today;

            return (
              <div
                key={item.id}
                onClick={() => navigate(`/customers/${item.customer_id}`)}
                style={{
                  padding: '10px 12px', marginBottom: '8px',
                  background: isPast ? '#fef2f2' : isToday ? '#fffbeb' : '#f9fafb',
                  border: `1px solid ${isPast ? '#fecaca' : isToday ? '#fde68a' : '#e5e7eb'}`,
                  borderRadius: '8px', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isPast ? '#fef2f2' : isToday ? '#fffbeb' : '#f9fafb';
                }}
              >
                {/* Customer name */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px',
                }}>
                  <User size={13} color="#6b7280" />
                  {item.customer_company || item.customer_name}
                </div>

                {/* Action items */}
                {item.action_items.slice(0, 2).map((action, i) => (
                  <div key={i} style={{
                    fontSize: '12px', color: '#4b5563', marginBottom: '2px',
                    paddingLeft: '19px',
                  }}>
                    {action}
                  </div>
                ))}
                {item.action_items.length > 2 && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', paddingLeft: '19px' }}>
                    +{item.action_items.length - 2} more
                  </div>
                )}

                {/* Due date chip */}
                <div style={{ marginTop: '6px', paddingLeft: '19px' }}>
                  <Chip
                    label={isToday ? 'Today' : dueDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    size="small"
                    sx={{
                      fontSize: '10px', fontWeight: 700, height: '20px',
                      backgroundColor: isPast ? '#fee2e2' : isToday ? '#fef3c7' : '#eff6ff',
                      color: isPast ? '#991b1b' : isToday ? '#92400e' : '#1e40af',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
