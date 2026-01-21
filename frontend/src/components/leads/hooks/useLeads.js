/**
 * useLeads Hook
 * Handles lead data fetching, caching, and state management
 */

import { useState, useEffect, useCallback } from 'react';
import { cachedFetch, invalidateCache } from '../../../services/apiCache';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export function useLeads(options = {}) {
  const {
    autoFetch = true,
    initialPage = 1,
    initialLimit = 25
  } = options;

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: initialPage,
    limit: initialLimit,
    total: 0,
    totalPages: 0
  });
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    assignedTo: ''
  });
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  const fetchLeads = useCallback(async (customFilters = null) => {
    setLoading(true);
    setError(null);

    const activeFilters = customFilters || filters;
    const params = new URLSearchParams({
      page: pagination.page.toString(),
      limit: pagination.limit.toString(),
      sortBy,
      sortOrder,
      ...(activeFilters.search && { search: activeFilters.search }),
      ...(activeFilters.status && { status: activeFilters.status }),
      ...(activeFilters.priority && { priority: activeFilters.priority }),
      ...(activeFilters.assignedTo && { assignedTo: activeFilters.assignedTo })
    });

    try {
      const response = await cachedFetch(
        `${API_BASE}/leads?${params}`,
        { headers: getAuthHeaders() },
        { ttl: 30000 } // 30 second cache
      );

      if (!response.ok) {
        throw new Error('Failed to fetch leads');
      }

      const data = await response.json();
      setLeads(data.leads || []);
      setPagination(prev => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, sortBy, sortOrder]);

  useEffect(() => {
    if (autoFetch) {
      fetchLeads();
    }
  }, [fetchLeads, autoFetch]);

  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1 on filter change
  }, []);

  const setPage = useCallback((page) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setLimit = useCallback((limit) => {
    setPagination(prev => ({ ...prev, limit, page: 1 }));
  }, []);

  const refresh = useCallback(() => {
    invalidateCache('leads');
    fetchLeads();
  }, [fetchLeads]);

  return {
    leads,
    loading,
    error,
    pagination,
    filters,
    sortBy,
    sortOrder,
    fetchLeads,
    updateFilters,
    setPage,
    setLimit,
    setSortBy,
    setSortOrder,
    refresh
  };
}

export function useLeadStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await cachedFetch(
        `${API_BASE}/leads/stats`,
        { headers: getAuthHeaders() },
        { ttl: 60000 } // 1 minute cache
      );

      if (!response.ok) throw new Error('Failed to fetch stats');

      const data = await response.json();
      setStats(data.data || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
}

export function useLead(id) {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLead = useCallback(async () => {
    if (!id) {
      setLead(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/leads/${id}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) throw new Error('Failed to fetch lead');

      const data = await response.json();
      setLead(data.data || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  return { lead, loading, error, refresh: fetchLead };
}

export async function createLead(data) {
  const response = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to create lead');
  }

  invalidateCache('leads');
  return response.json();
}

export async function updateLead(id, data) {
  const response = await fetch(`${API_BASE}/leads/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to update lead');
  }

  invalidateCache('leads');
  return response.json();
}

export async function updateLeadStatus(id, status, lostReason = null) {
  const response = await fetch(`${API_BASE}/leads/${id}/status`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status, lost_reason: lostReason })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to update status');
  }

  invalidateCache('leads');
  return response.json();
}

export async function convertToQuote(id, options = {}) {
  const response = await fetch(`${API_BASE}/leads/${id}/convert-to-quote`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to convert to quote');
  }

  invalidateCache('leads');
  invalidateCache('quotations');
  return response.json();
}

export async function addLeadActivity(id, activityType, description, metadata = null) {
  const response = await fetch(`${API_BASE}/leads/${id}/activities`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      activity_type: activityType,
      description,
      metadata
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to add activity');
  }

  return response.json();
}

export async function deleteLead(id) {
  const response = await fetch(`${API_BASE}/leads/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to delete lead');
  }

  invalidateCache('leads');
  return true;
}

// AI Helpers
export async function generateAISummary(id) {
  const response = await fetch(`${API_BASE}/leads/${id}/ai/summarize`, {
    method: 'POST',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to generate summary');
  }

  return response.json();
}

export async function generateProductSuggestions(id) {
  const response = await fetch(`${API_BASE}/leads/${id}/ai/suggest-products`, {
    method: 'POST',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to generate suggestions');
  }

  return response.json();
}

export async function generateFollowUpDraft(id, tone = 'professional') {
  const response = await fetch(`${API_BASE}/leads/${id}/ai/draft-followup`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tone })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to generate draft');
  }

  return response.json();
}
