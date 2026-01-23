/**
 * CustomerTags - Customer tagging and segmentation system
 * Manage tags, assign to customers, and filter by tags
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

function CustomerTags({ customerId, mode = 'manage', onTagsChange }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState([]);
  const [customerTags, setCustomerTags] = useState([]);
  const [tagStats, setTagStats] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [activeTab, setActiveTab] = useState('tags');

  useEffect(() => {
    fetchTags();
    if (mode === 'manage') {
      fetchTagStats();
    }
  }, [mode]);

  useEffect(() => {
    if (customerId) {
      fetchCustomerTags();
    }
  }, [customerId]);

  const fetchTags = async () => {
    try {
      const response = await api.get('/customers/tags');
      setAllTags(response.data?.data || response.data || []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerTags = async () => {
    if (!customerId) return;
    try {
      const response = await api.get(`/customers/${customerId}/tags`);
      setCustomerTags(response.data?.data || response.data || []);
    } catch (error) {
      console.error('Failed to fetch customer tags:', error);
    }
  };

  const fetchTagStats = async () => {
    try {
      const response = await api.get('/customers/tags/stats');
      setTagStats(response.data?.data || response.data);
    } catch (error) {
      console.error('Failed to fetch tag stats:', error);
    }
  };

  const handleAddTag = async (tagId) => {
    if (!customerId) return;
    try {
      await api.post(`/customers/${customerId}/tags/${tagId}`);
      toast.success('Tag added');
      fetchCustomerTags();
      onTagsChange?.();
    } catch (error) {
      toast.error('Failed to add tag');
    }
  };

  const handleRemoveTag = async (tagId) => {
    if (!customerId) return;
    try {
      await api.delete(`/customers/${customerId}/tags/${tagId}`);
      toast.success('Tag removed');
      fetchCustomerTags();
      onTagsChange?.();
    } catch (error) {
      toast.error('Failed to remove tag');
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (!window.confirm('Are you sure you want to delete this tag? It will be removed from all customers.')) {
      return;
    }
    try {
      await api.delete(`/customers/tags/${tagId}`);
      toast.success('Tag deleted');
      fetchTags();
      fetchTagStats();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete tag');
    }
  };

  // Customer tag assignment view (inline)
  if (mode === 'assign') {
    const assignedTagIds = customerTags.map(t => t.id);
    const availableTags = allTags.filter(t => !assignedTagIds.includes(t.id));

    return (
      <div className="customer-tags-assign">
        <div className="assigned-tags">
          {customerTags.length === 0 ? (
            <span className="no-tags">No tags assigned</span>
          ) : (
            customerTags.map(tag => (
              <span
                key={tag.id}
                className="tag-badge"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
                <button
                  className="tag-remove"
                  onClick={() => handleRemoveTag(tag.id)}
                  title="Remove tag"
                >
                  &times;
                </button>
              </span>
            ))
          )}
        </div>
        {availableTags.length > 0 && (
          <div className="add-tag-dropdown">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleAddTag(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="">+ Add tag</option>
              {availableTags.map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>
        )}

        <style>{`
          .customer-tags-assign {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
          }
          .assigned-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }
          .no-tags {
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-style: italic;
          }
          .tag-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            color: white;
          }
          .tag-remove {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 0;
            margin-left: 2px;
            font-size: 1rem;
            line-height: 1;
            opacity: 0.7;
          }
          .tag-remove:hover {
            opacity: 1;
          }
          .add-tag-dropdown select {
            padding: 4px 8px;
            border: 1px dashed var(--border-color);
            border-radius: 12px;
            background: transparent;
            font-size: 0.75rem;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  // Tag management view (full page)
  return (
    <div className="customer-tags-manager">
      <div className="tags-header">
        <div>
          <h1>Customer Tags</h1>
          <p>Organize and segment customers with custom tags</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + Create Tag
        </button>
      </div>

      {/* Stats Summary */}
      {tagStats && (
        <div className="tags-stats-grid">
          <div className="stat-card">
            <span className="stat-value">{tagStats.totalTags}</span>
            <span className="stat-label">Total Tags</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{tagStats.totalAssignments}</span>
            <span className="stat-label">Tag Assignments</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{tagStats.customersWithTags}</span>
            <span className="stat-label">Customers Tagged</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {tagStats.totalTags > 0
                ? (tagStats.totalAssignments / tagStats.totalTags).toFixed(1)
                : 0}
            </span>
            <span className="stat-label">Avg per Tag</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tags-tabs">
        <button
          className={`tab ${activeTab === 'tags' ? 'active' : ''}`}
          onClick={() => setActiveTab('tags')}
        >
          All Tags ({allTags.length})
        </button>
        <button
          className={`tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          System Tags
        </button>
        <button
          className={`tab ${activeTab === 'custom' ? 'active' : ''}`}
          onClick={() => setActiveTab('custom')}
        >
          Custom Tags
        </button>
      </div>

      {/* Tags List */}
      <div className="tags-list">
        {loading ? (
          <div className="loading-state">Loading tags...</div>
        ) : (
          filteredTags().map(tag => (
            <div key={tag.id} className="tag-card">
              <div className="tag-info">
                <div
                  className="tag-color-badge"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </div>
                {tag.is_system && (
                  <span className="system-badge">System</span>
                )}
              </div>
              {tag.description && (
                <p className="tag-description">{tag.description}</p>
              )}
              <div className="tag-meta">
                <span className="customer-count">
                  {tag.customer_count || 0} customers
                </span>
                <div className="tag-actions">
                  {!tag.is_system && (
                    <>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setEditingTag(tag)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteTag(tag.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => window.location.href = `/customers?tag=${tag.id}`}
                  >
                    View Customers
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTag) && (
        <TagModal
          tag={editingTag}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTag(null);
          }}
          onSave={() => {
            fetchTags();
            fetchTagStats();
            setShowCreateModal(false);
            setEditingTag(null);
          }}
        />
      )}

      <style>{`
        .customer-tags-manager {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .tags-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .tags-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
        }
        .tags-header p {
          margin: 4px 0 0;
          color: var(--text-secondary);
        }
        .tags-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .stat-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stat-value {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary-color);
        }
        .stat-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .tags-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 1rem;
          border-bottom: 1px solid var(--border-color);
        }
        .tags-tabs .tab {
          padding: 0.75rem 1rem;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
          color: var(--text-secondary);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }
        .tags-tabs .tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }
        .tags-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }
        .tag-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .tag-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .tag-color-badge {
          padding: 6px 12px;
          border-radius: 16px;
          color: white;
          font-weight: 500;
          font-size: 0.875rem;
        }
        .system-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          background: #e5e7eb;
          border-radius: 4px;
          color: #6b7280;
        }
        .tag-description {
          margin: 0 0 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .tag-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 8px;
          border-top: 1px solid var(--border-color);
        }
        .customer-count {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .tag-actions {
          display: flex;
          gap: 4px;
        }
        .loading-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 2rem;
          color: var(--text-secondary);
        }
        @media (max-width: 768px) {
          .tags-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .tags-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );

  function filteredTags() {
    switch (activeTab) {
      case 'system':
        return allTags.filter(t => t.is_system);
      case 'custom':
        return allTags.filter(t => !t.is_system);
      default:
        return allTags;
    }
  }
}

// Tag Create/Edit Modal Component
function TagModal({ tag, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: tag?.name || '',
    color: tag?.color || '#3b82f6',
    description: tag?.description || ''
  });

  const colorOptions = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Tag name is required');
      return;
    }

    setSaving(true);
    try {
      if (tag) {
        await api.put(`/customers/tags/${tag.id}`, form);
        toast.success('Tag updated');
      } else {
        await api.post('/customers/tags', form);
        toast.success('Tag created');
      }
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tag ? 'Edit Tag' : 'Create Tag'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tag Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Premium Customer"
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {colorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${form.color === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setForm({ ...form, color })}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="custom-color"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description for this tag"
              rows={3}
            />
          </div>
          <div className="preview-section">
            <label>Preview</label>
            <span
              className="tag-preview"
              style={{ backgroundColor: form.color }}
            >
              {form.name || 'Tag Name'}
            </span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : (tag ? 'Update Tag' : 'Create Tag')}
            </button>
          </div>
        </form>

        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: white;
            border-radius: 12px;
            width: 100%;
            max-width: 450px;
            max-height: 90vh;
            overflow-y: auto;
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid var(--border-color);
          }
          .modal-header h2 {
            margin: 0;
            font-size: 1.125rem;
            font-weight: 600;
          }
          .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--text-secondary);
          }
          .modal-content form {
            padding: 1.25rem;
          }
          .form-group {
            margin-bottom: 1rem;
          }
          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 0.875rem;
          }
          .form-group input[type="text"],
          .form-group textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 0.875rem;
          }
          .color-picker {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .color-option {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid transparent;
            cursor: pointer;
          }
          .color-option.selected {
            border-color: #1f2937;
            box-shadow: 0 0 0 2px white inset;
          }
          .custom-color {
            width: 32px;
            height: 32px;
            padding: 0;
            border: none;
            border-radius: 50%;
            cursor: pointer;
          }
          .preview-section {
            margin-bottom: 1rem;
            padding: 1rem;
            background: #f9fafb;
            border-radius: 8px;
          }
          .preview-section label {
            display: block;
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
          }
          .tag-preview {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 16px;
            color: white;
            font-weight: 500;
            font-size: 0.875rem;
          }
          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
          }
        `}</style>
      </div>
    </div>
  );
}

// Customer Tags Badge Component (for display in lists)
export function CustomerTagsBadge({ tags = [], maxDisplay = 3 }) {
  const displayTags = tags.slice(0, maxDisplay);
  const remaining = tags.length - maxDisplay;

  return (
    <div className="customer-tags-badge">
      {displayTags.map(tag => (
        <span
          key={tag.id}
          className="mini-tag"
          style={{ backgroundColor: tag.color }}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {remaining > 0 && (
        <span className="more-tags">+{remaining}</span>
      )}

      <style>{`
        .customer-tags-badge {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .mini-tag {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 0.7rem;
          color: white;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .more-tags {
          padding: 2px 6px;
          background: #e5e7eb;
          border-radius: 8px;
          font-size: 0.7rem;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}

// Tag Filter Component (for filtering customer lists)
export function TagFilter({ selectedTags = [], onChange, allTags = [] }) {
  return (
    <div className="tag-filter">
      <label>Filter by Tags:</label>
      <div className="tag-filter-options">
        {allTags.map(tag => (
          <button
            key={tag.id}
            className={`tag-filter-btn ${selectedTags.includes(tag.id) ? 'active' : ''}`}
            style={{
              backgroundColor: selectedTags.includes(tag.id) ? tag.color : 'transparent',
              borderColor: tag.color,
              color: selectedTags.includes(tag.id) ? 'white' : tag.color
            }}
            onClick={() => {
              const newSelected = selectedTags.includes(tag.id)
                ? selectedTags.filter(id => id !== tag.id)
                : [...selectedTags, tag.id];
              onChange(newSelected);
            }}
          >
            {tag.name}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <button
            className="clear-filters"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        )}
      </div>

      <style>{`
        .tag-filter {
          margin-bottom: 1rem;
        }
        .tag-filter label {
          display: block;
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .tag-filter-options {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tag-filter-btn {
          padding: 4px 10px;
          border: 1px solid;
          border-radius: 12px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tag-filter-btn:hover {
          opacity: 0.8;
        }
        .clear-filters {
          padding: 4px 10px;
          background: none;
          border: 1px dashed var(--border-color);
          border-radius: 12px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default CustomerTags;
