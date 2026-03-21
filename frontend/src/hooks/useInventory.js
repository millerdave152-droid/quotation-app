/**
 * useInventory Hook
 * Handles inventory data fetching for dashboard, products, and low-stock
 */

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';

export function useInventorySummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/inventory/summary');
      setSummary(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { summary, loading, error, refresh: fetch };
}

export function useInventoryProducts(initialFilters = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: '', stockStatus: '', manufacturer: '', category: '', ...initialFilters,
  });

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (filters.search) params.set('search', filters.search);
      if (filters.stockStatus) params.set('stockStatus', filters.stockStatus);
      if (filters.manufacturer) params.set('manufacturer', filters.manufacturer);
      if (filters.category) params.set('category', filters.category);

      const res = await apiClient.get(`/api/inventory/products?${params}`);
      setProducts(res.data.products || []);
      if (res.data.pagination) {
        setPagination((p) => ({ ...p, ...res.data.pagination }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateFilters = (newFilters) => {
    setFilters((f) => ({ ...f, ...newFilters }));
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const setPage = (page) => setPagination((p) => ({ ...p, page }));

  return {
    products, loading, error, pagination,
    filters, updateFilters, setPage, refresh: fetch,
  };
}

export function useLowStock() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/api/inventory/low-stock')
      .then((res) => setItems(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { items, loading };
}
