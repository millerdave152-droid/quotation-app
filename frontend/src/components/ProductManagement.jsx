import React, { useState, useEffect, useRef } from 'react';
import logger from '../utils/logger';
import { cachedFetch, invalidateCache } from '../services/apiCache';
import { handleApiError } from '../utils/errorHandler';
import ProductImportWizard from './ProductImportWizard';
import ManufacturerTemplateManager from './ManufacturerTemplateManager';
import { Model3DUploader } from './ProductConfigurator';
import CategoryPicker from './CategoryPicker';
import { ModelTooltip } from './nomenclature';

import { authFetch } from '../services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const ProductManagement = () => {
  // State Management
  const [view, setView] = useState('browser');
  const [productViewMode, setProductViewMode] = useState(() => {
    return localStorage.getItem('productViewMode') || 'table'; // 'table' or 'grid'
  });
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [notification, setNotification] = useState(null);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Bulk Selection States
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCategorySlug, setFilterCategorySlug] = useState(null); // New: normalized category slug
  const [sortBy, setSortBy] = useState('updated_desc');
  const [manufacturerSearch, setManufacturerSearch] = useState('');
  const [showManufacturerDropdown, setShowManufacturerDropdown] = useState(false);

  // Inline Edit States
  const [inlineEdit, setInlineEdit] = useState(null); // { productId, field, value }
  const [inlineEditSaving, setInlineEditSaving] = useState(false);
  const inlineEditRef = useRef(null);

  // Bulk Price Update States
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkPriceConfig, setBulkPriceConfig] = useState({
    field: 'both', // 'cost', 'msrp', or 'both'
    mode: 'percent', // 'fixed', 'percent', 'amount'
    value: '',
    direction: 'increase' // 'increase' or 'decrease'
  });
  const [bulkPriceUpdating, setBulkPriceUpdating] = useState(false);

  // Product Comparison States
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Keyboard Shortcuts States
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const searchInputRef = useRef(null);

  // New Advanced Filters
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [priceField, setPriceField] = useState('cost'); // 'cost' or 'msrp'
  const [showRecent, setShowRecent] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [tags, setTags] = useState({});
  const [selectedTags, setSelectedTags] = useState([]);
  const [favorites, setFavorites] = useState([]);

  // Edit States
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({});

  // CSV Import States
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [showImportWizard, setShowImportWizard] = useState(false);

  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  // Load initial data ONCE
  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      loadAllData();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Filter products when filters change (with debouncing for search)
  useEffect(() => {
    if (products.length > 0) {
      setFiltering(true);
      const timer = setTimeout(() => {
        filterProducts();
        setCurrentPage(1); // Reset to first page on filter change
        setFiltering(false);
      }, searchTerm ? 300 : 0); // Debounce search by 300ms
      return () => clearTimeout(timer);
    }
  }, [products, searchTerm, filterManufacturer, filterCategory, filterCategorySlug, sortBy, minPrice, maxPrice, priceField, showRecent, showFavorites, selectedTags, favorites]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      const isModalOpen = showBulkPriceModal || showCompareModal || showShortcutsModal || showImportWizard;

      // Escape key - close modals or clear selection
      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
          return;
        }
        if (showCompareModal) {
          setShowCompareModal(false);
          return;
        }
        if (showBulkPriceModal) {
          closeBulkPriceModal();
          return;
        }
        if (inlineEdit) {
          cancelInlineEdit();
          return;
        }
        if (isInputActive && document.activeElement) {
          document.activeElement.blur();
          return;
        }
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          setSelectAll(false);
          return;
        }
      }

      // Don't process other shortcuts if in input or modal is open
      if (isInputActive || isModalOpen) return;

      // Only process shortcuts when in browser view
      if (view !== 'browser') return;

      // ? or Ctrl+/ - Show keyboard shortcuts help
      if (e.key === '?' || (e.ctrlKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      // / or Ctrl+F - Focus search
      if (e.key === '/' || (e.ctrlKey && e.key === 'f')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Ctrl+N - New product
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setFormData({});
        setView('add');
        return;
      }

      // Ctrl+E - Export (selected or all)
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        exportToCSV();
        return;
      }

      // Ctrl+A - Select all on current page
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        const pageProducts = getCurrentPageProducts();
        setSelectedIds(new Set(pageProducts.map(p => p.id)));
        setSelectAll(true);
        return;
      }

      // Ctrl+D - Deselect all
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setSelectedIds(new Set());
        setSelectAll(false);
        return;
      }

      // Ctrl+K - Compare selected (if 2+ selected)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (selectedIds.size >= 2) {
          openCompareModal();
        } else {
          showNotification('Select at least 2 products to compare', 'info');
        }
        return;
      }

      // Ctrl+P - Bulk price update (if selected)
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        if (selectedIds.size > 0) {
          openBulkPriceModal();
        } else {
          showNotification('Select products to update prices', 'info');
        }
        return;
      }

      // Ctrl+R or F5 - Refresh
      if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        loadAllData();
        return;
      }

      // Delete or Backspace - Delete selected (with confirmation)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        executeBulkDelete();
        return;
      }

      // Arrow keys for pagination
      if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        setCurrentPage(p => p - 1);
        return;
      }
      if (e.key === 'ArrowRight' && currentPage < getTotalPages()) {
        e.preventDefault();
        setCurrentPage(p => p + 1);
        return;
      }

      // Home - First page
      if (e.key === 'Home' && !e.ctrlKey) {
        e.preventDefault();
        setCurrentPage(1);
        return;
      }

      // End - Last page
      if (e.key === 'End' && !e.ctrlKey) {
        e.preventDefault();
        setCurrentPage(getTotalPages());
        return;
      }

      // F - Toggle favorites filter
      if (e.key === 'f' && !e.ctrlKey) {
        e.preventDefault();
        setShowFavorites(!showFavorites);
        return;
      }

      // R - Toggle recent filter
      if (e.key === 'r' && !e.ctrlKey) {
        e.preventDefault();
        setShowRecent(!showRecent);
        return;
      }

      // C - Clear all filters
      if (e.key === 'c' && !e.ctrlKey) {
        e.preventDefault();
        clearAllFilters();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, selectedIds, showBulkPriceModal, showCompareModal, showShortcutsModal, showImportWizard,
      inlineEdit, currentPage, showFavorites, showRecent]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // Load products, stats, tags, and favorites in parallel with caching
      const [productsData, statsData, tagsData, favoritesData] = await Promise.all([
        cachedFetch('/api/products?limit=15000').catch(err => {
          handleApiError(err, { context: 'Loading products', silent: true });
          return [];
        }),
        cachedFetch('/api/products/stats').catch(err => {
          handleApiError(err, { context: 'Loading stats', silent: true });
          return {};
        }),
        cachedFetch('/api/products/tags').catch(err => {
          handleApiError(err, { context: 'Loading tags', silent: true });
          return {};
        }),
        cachedFetch('/api/products/favorites').catch(err => {
          handleApiError(err, { context: 'Loading favorites', silent: true });
          return [];
        })
      ]);

      if (isMounted.current) {
        setProducts(Array.isArray(productsData) ? productsData : []);
        setStats(statsData);
        setTags(tagsData || {});
        setFavorites(Array.isArray(favoritesData) ? favoritesData.map(f => f.id) : []);
      }

    } catch (error) {
      handleApiError(error, { context: 'Loading products' });
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      if (isMounted.current) {
        setNotification(null);
      }
    }, 4000);
  };

  const filterProducts = () => {
    let filtered = [...products];

    // Search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.model?.toLowerCase().includes(search) ||
        p.name?.toLowerCase().includes(search) ||
        p.manufacturer?.toLowerCase().includes(search) ||
        p.description?.toLowerCase().includes(search)
      );
    }

    // Manufacturer filter (case-insensitive)
    if (filterManufacturer !== 'all') {
      filtered = filtered.filter(p =>
        (p.manufacturer || '').toUpperCase() === filterManufacturer.toUpperCase()
      );
    }

    // Category filter (dual-mode: supports both legacy raw text and normalized slug)
    if (filterCategorySlug) {
      // New: filter by normalized category slug (from CategoryPicker)
      filtered = filtered.filter(p =>
        p.category_info?.slug === filterCategorySlug ||
        p.subcategory_info?.slug === filterCategorySlug
      );
    } else if (filterCategory !== 'all') {
      // Legacy: filter by raw category text
      filtered = filtered.filter(p => p.category === filterCategory);
    }

    // Price range filter
    if (minPrice) {
      const minCents = parseFloat(minPrice) * 100;
      const field = priceField === 'msrp' ? 'msrp_cents' : 'cost_cents';
      filtered = filtered.filter(p => (p[field] || 0) >= minCents);
    }
    if (maxPrice) {
      const maxCents = parseFloat(maxPrice) * 100;
      const field = priceField === 'msrp' ? 'msrp_cents' : 'cost_cents';
      filtered = filtered.filter(p => (p[field] || 0) <= maxCents);
    }

    // Recent filter (last 7 days)
    if (showRecent) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filtered = filtered.filter(p => {
        const createdAt = p.created_at ? new Date(p.created_at) : null;
        const updatedAt = p.updated_at ? new Date(p.updated_at) : null;
        return (createdAt && createdAt >= sevenDaysAgo) || (updatedAt && updatedAt >= sevenDaysAgo);
      });
    }

    // Favorites filter
    if (showFavorites) {
      filtered = filtered.filter(p => favorites.includes(p.id));
    }

    // Sort
    switch (sortBy) {
      case 'name_asc':
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'name_desc':
        filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'price_asc':
        filtered.sort((a, b) => (a.cost_cents || 0) - (b.cost_cents || 0));
        break;
      case 'price_desc':
        filtered.sort((a, b) => (b.cost_cents || 0) - (a.cost_cents || 0));
        break;
      case 'msrp_asc':
        filtered.sort((a, b) => (a.msrp_cents || 0) - (b.msrp_cents || 0));
        break;
      case 'msrp_desc':
        filtered.sort((a, b) => (b.msrp_cents || 0) - (a.msrp_cents || 0));
        break;
      case 'margin_asc':
        filtered.sort((a, b) => {
          const marginA = a.cost_cents && a.msrp_cents ? ((a.msrp_cents - a.cost_cents) / a.msrp_cents) : 0;
          const marginB = b.cost_cents && b.msrp_cents ? ((b.msrp_cents - b.cost_cents) / b.msrp_cents) : 0;
          return marginA - marginB;
        });
        break;
      case 'margin_desc':
        filtered.sort((a, b) => {
          const marginA = a.cost_cents && a.msrp_cents ? ((a.msrp_cents - a.cost_cents) / a.msrp_cents) : 0;
          const marginB = b.cost_cents && b.msrp_cents ? ((b.msrp_cents - b.cost_cents) / b.msrp_cents) : 0;
          return marginB - marginA;
        });
        break;
      case 'updated_desc':
        filtered.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        break;
      case 'manufacturer_asc':
        filtered.sort((a, b) => (a.manufacturer || '').localeCompare(b.manufacturer || ''));
        break;
      default:
        break;
    }

    setFilteredProducts(filtered);
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return searchTerm || filterManufacturer !== 'all' || filterCategory !== 'all' ||
           filterCategorySlug || minPrice || maxPrice || showRecent || showFavorites || selectedTags.length > 0;
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterManufacturer('all');
    setFilterCategory('all');
    setFilterCategorySlug(null);
    setMinPrice('');
    setMaxPrice('');
    setShowRecent(false);
    setShowFavorites(false);
    setSelectedTags([]);
    setManufacturerSearch('');
    setSelectedIds(new Set());
    setSelectAll(false);
  };

  // Bulk selection functions
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      const pageProducts = getCurrentPageProducts();
      setSelectedIds(new Set(pageProducts.map(p => p.id)));
      setSelectAll(true);
    }
  };

  const toggleSelectProduct = (productId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(productId)) {
      newSet.delete(productId);
    } else {
      newSet.add(productId);
    }
    setSelectedIds(newSet);
    setSelectAll(false);
  };

  // Pagination helpers
  const getTotalPages = () => Math.ceil(filteredProducts.length / pageSize);
  const getCurrentPageProducts = () => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  };

  // Export functionality
  const exportToCSV = () => {
    const productsToExport = selectedIds.size > 0
      ? filteredProducts.filter(p => selectedIds.has(p.id))
      : filteredProducts;

    const headers = ['Model', 'Name', 'Manufacturer', 'Category', 'Cost', 'MSRP', 'Margin %'];
    const rows = productsToExport.map(p => [
      p.model || '',
      (p.name || '').replace(/"/g, '""'),
      p.manufacturer || '',
      simplifyCategory(p.category, p.manufacturer),
      ((p.cost_cents || 0) / 100).toFixed(2),
      ((p.msrp_cents || 0) / 100).toFixed(2),
      p.cost_cents && p.msrp_cents ? (((p.msrp_cents - p.cost_cents) / p.msrp_cents) * 100).toFixed(1) : '0'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-export-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showNotification(`Exported ${productsToExport.length} products to CSV`, 'success');
  };

  // Simplify category by removing manufacturer prefix
  const simplifyCategory = (category, manufacturer) => {
    if (!category) return '-';
    if (!manufacturer) return category;
    // Remove manufacturer name from beginning of category
    const mfrLower = manufacturer.toLowerCase();
    const catLower = category.toLowerCase();
    if (catLower.startsWith(mfrLower + ' - ')) {
      return category.slice(manufacturer.length + 3);
    }
    if (catLower.startsWith(mfrLower + ' ')) {
      return category.slice(manufacturer.length + 1);
    }
    return category;
  };

  // Toggle favorite
  const toggleFavorite = async (productId) => {
    try {
      if (favorites.includes(productId)) {
        await authFetch(`${API_BASE}/products/favorites/${productId}`, { method: 'DELETE' });
        setFavorites(favorites.filter(id => id !== productId));
      } else {
        await authFetch(`${API_BASE}/products/favorites/${productId}`, { method: 'POST' });
        setFavorites([...favorites, productId]);
      }
    } catch (err) {
      handleApiError(err, { context: 'Updating favorites' });
    }
  };

  // Inline Edit Functions
  const startInlineEdit = (productId, field, currentValue) => {
    const dollarValue = currentValue ? (currentValue / 100).toFixed(2) : '0.00';
    setInlineEdit({ productId, field, value: dollarValue });
    // Focus input after render
    setTimeout(() => {
      if (inlineEditRef.current) {
        inlineEditRef.current.focus();
        inlineEditRef.current.select();
      }
    }, 0);
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
  };

  const saveInlineEdit = async () => {
    if (!inlineEdit || inlineEditSaving) return;

    const { productId, field, value } = inlineEdit;
    const newCents = Math.round(parseFloat(value || 0) * 100);

    // Find the product to get current values
    const product = products.find(p => p.id === productId);
    if (!product) {
      setInlineEdit(null);
      return;
    }

    // Check if value actually changed
    const currentCents = field === 'cost' ? product.cost_cents : product.msrp_cents;
    if (newCents === currentCents) {
      setInlineEdit(null);
      return;
    }

    // Validation: MSRP should be >= Cost
    if (field === 'msrp' && newCents < product.cost_cents) {
      showNotification('MSRP cannot be less than Cost', 'error');
      return;
    }
    if (field === 'cost' && newCents > product.msrp_cents) {
      showNotification('Cost cannot be greater than MSRP', 'error');
      return;
    }
    if (newCents < 0) {
      showNotification('Price cannot be negative', 'error');
      return;
    }

    try {
      setInlineEditSaving(true);

      const updates = field === 'cost'
        ? { cost_cents: newCents }
        : { msrp_cents: newCents };

      const response = await authFetch(`${API_BASE}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update product');
      }

      // Update local state
      setProducts(products.map(p => {
        if (p.id === productId) {
          return { ...p, ...updates };
        }
        return p;
      }));

      showNotification(`${field === 'cost' ? 'Cost' : 'MSRP'} updated to ${formatPrice(newCents)}`, 'success');
    } catch (error) {
      handleApiError(error, { context: 'Updating price' });
    } finally {
      setInlineEditSaving(false);
      setInlineEdit(null);
    }
  };

  const handleInlineEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveInlineEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInlineEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Save current and move to next field
      const { productId, field } = inlineEdit;
      const product = products.find(p => p.id === productId);
      if (product) {
        saveInlineEdit();
        // If editing cost, move to msrp; if editing msrp, move to next row's cost
        if (field === 'cost') {
          setTimeout(() => startInlineEdit(productId, 'msrp', product.msrp_cents), 100);
        }
      }
    }
  };

  // Bulk Price Update Functions
  const openBulkPriceModal = () => {
    setBulkPriceConfig({
      field: 'both',
      mode: 'percent',
      value: '',
      direction: 'increase'
    });
    setShowBulkPriceModal(true);
  };

  const closeBulkPriceModal = () => {
    setShowBulkPriceModal(false);
    setBulkPriceConfig({
      field: 'both',
      mode: 'percent',
      value: '',
      direction: 'increase'
    });
  };

  const calculateNewPrice = (currentCents, config) => {
    const { mode, value, direction } = config;
    const numValue = parseFloat(value) || 0;

    if (mode === 'fixed') {
      return Math.round(numValue * 100);
    } else if (mode === 'percent') {
      const multiplier = direction === 'increase' ? (1 + numValue / 100) : (1 - numValue / 100);
      return Math.round(currentCents * multiplier);
    } else if (mode === 'amount') {
      const amountCents = Math.round(numValue * 100);
      return direction === 'increase' ? currentCents + amountCents : currentCents - amountCents;
    }
    return currentCents;
  };

  const getPreviewPrices = () => {
    const selectedProducts = products.filter(p => selectedIds.has(p.id));
    return selectedProducts.slice(0, 5).map(p => {
      const newCost = bulkPriceConfig.field !== 'msrp'
        ? calculateNewPrice(p.cost_cents || 0, bulkPriceConfig)
        : p.cost_cents;
      const newMsrp = bulkPriceConfig.field !== 'cost'
        ? calculateNewPrice(p.msrp_cents || 0, bulkPriceConfig)
        : p.msrp_cents;
      return {
        id: p.id,
        model: p.model,
        manufacturer: p.manufacturer,
        name: p.name,
        category: p.category,
        oldCost: p.cost_cents,
        newCost: Math.max(0, newCost),
        oldMsrp: p.msrp_cents,
        newMsrp: Math.max(0, newMsrp)
      };
    });
  };

  const executeBulkPriceUpdate = async () => {
    if (!bulkPriceConfig.value || selectedIds.size === 0) return;

    const selectedProducts = products.filter(p => selectedIds.has(p.id));

    // Validate
    for (const p of selectedProducts) {
      const newCost = bulkPriceConfig.field !== 'msrp'
        ? calculateNewPrice(p.cost_cents || 0, bulkPriceConfig)
        : p.cost_cents;
      const newMsrp = bulkPriceConfig.field !== 'cost'
        ? calculateNewPrice(p.msrp_cents || 0, bulkPriceConfig)
        : p.msrp_cents;

      if (newCost < 0 || newMsrp < 0) {
        showNotification('Price update would result in negative values. Please adjust.', 'error');
        return;
      }
      if (newCost > newMsrp && bulkPriceConfig.field === 'both') {
        // This is okay for bulk updates when both change proportionally
      }
    }

    try {
      setBulkPriceUpdating(true);

      let successCount = 0;
      let errorCount = 0;

      for (const p of selectedProducts) {
        const updates = {};

        if (bulkPriceConfig.field !== 'msrp') {
          updates.cost_cents = Math.max(0, calculateNewPrice(p.cost_cents || 0, bulkPriceConfig));
        }
        if (bulkPriceConfig.field !== 'cost') {
          updates.msrp_cents = Math.max(0, calculateNewPrice(p.msrp_cents || 0, bulkPriceConfig));
        }

        try {
          const response = await authFetch(`${API_BASE}/products/${p.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });

          if (response.ok) {
            successCount++;
            // Update local state
            setProducts(prev => prev.map(prod =>
              prod.id === p.id ? { ...prod, ...updates } : prod
            ));
          } else {
            errorCount++;
          }
        } catch (err) {
          errorCount++;
        }
      }

      if (errorCount === 0) {
        showNotification(`Successfully updated ${successCount} products`, 'success');
      } else {
        showNotification(`Updated ${successCount} products, ${errorCount} failed`, 'warning');
      }

      closeBulkPriceModal();
      setSelectedIds(new Set());
      setSelectAll(false);

    } catch (error) {
      handleApiError(error, { context: 'Bulk price update' });
    } finally {
      setBulkPriceUpdating(false);
    }
  };

  // Bulk Delete Function
  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.size} products? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const productId of selectedIds) {
        try {
          const response = await authFetch(`${API_BASE}/products/${productId}`, {
            method: 'DELETE'
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          errorCount++;
        }
      }

      // Update local state
      setProducts(prev => prev.filter(p => !selectedIds.has(p.id)));

      if (errorCount === 0) {
        showNotification(`Successfully deleted ${successCount} products`, 'success');
      } else {
        showNotification(`Deleted ${successCount} products, ${errorCount} failed`, 'warning');
      }

      setSelectedIds(new Set());
      setSelectAll(false);

    } catch (error) {
      handleApiError(error, { context: 'Bulk delete' });
    }
  };

  // Product Comparison Functions
  const getComparisonProducts = () => {
    return products.filter(p => selectedIds.has(p.id)).slice(0, 5); // Max 5 products
  };

  const openCompareModal = () => {
    if (selectedIds.size < 2) {
      showNotification('Select at least 2 products to compare', 'warning');
      return;
    }
    if (selectedIds.size > 5) {
      showNotification('Maximum 5 products can be compared. First 5 will be shown.', 'info');
    }
    setShowCompareModal(true);
  };

  const getComparisonValue = (product, field) => {
    switch (field) {
      case 'image':
        return product.image_url || null;
      case 'model':
        return product.model || '(Not specified)';
      case 'name':
        return product.name || '(Not specified)';
      case 'manufacturer':
        return product.manufacturer || '(Not specified)';
      case 'category':
        return simplifyCategory(product.category, product.manufacturer);
      case 'cost':
        return formatPrice(product.cost_cents);
      case 'msrp':
        return formatPrice(product.msrp_cents);
      case 'margin':
        if (product.cost_cents && product.msrp_cents) {
          return ((product.msrp_cents - product.cost_cents) / product.msrp_cents * 100).toFixed(1) + '%';
        }
        return '-';
      case 'profit':
        if (product.cost_cents && product.msrp_cents) {
          return formatPrice(product.msrp_cents - product.cost_cents);
        }
        return '-';
      case 'color':
        return product.color || '(Not specified)';
      case 'availability':
        return product.availability || '(Not specified)';
      case 'stock':
        if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
          return product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock';
        }
        return '(Not specified)';
      case 'updated':
        return product.updated_at ? new Date(product.updated_at).toLocaleDateString() : '(Not specified)';
      default:
        return product[field] || '(Not specified)';
    }
  };

  const getLowestPrice = (products, field) => {
    const prices = products.map(p => p[field] || 0).filter(p => p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  };

  const getHighestMargin = (products) => {
    const margins = products.map(p => {
      if (p.cost_cents && p.msrp_cents) {
        return (p.msrp_cents - p.cost_cents) / p.msrp_cents * 100;
      }
      return 0;
    });
    return Math.max(...margins);
  };

  const createProduct = async (productData) => {
    try {
      logger.log('➕ Creating product:', productData);

      const response = await authFetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create product');
      }

      showNotification('Product created successfully!', 'success');
      await loadAllData();
      setFormData({});
      setView('browser');
    } catch (error) {
      handleApiError(error, { context: 'Creating product' });
    }
  };

  const updateProduct = async (productId, updates) => {
    try {
      logger.log('📝 Updating product ID:', productId);
      logger.log('📝 Updates:', updates);

      const response = await authFetch(`${API_BASE}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update product');
      }

      showNotification('Product updated successfully!', 'success');
      await loadAllData();
      setEditingProduct(null);
      setView('browser');
    } catch (error) {
      handleApiError(error, { context: 'Updating product' });
    }
  };

  const handleCreateProduct = () => {
    // Validate required fields
    if (!formData.model || !formData.name || !formData.manufacturer) {
      showNotification('Model, Name, and Manufacturer are required', 'error');
      return;
    }

    const productData = {
      name: formData.name,
      model: formData.model,
      manufacturer: formData.manufacturer,
      category: formData.category || '',
      description: formData.description || '',
      cost_cents: Math.round(parseFloat(formData.cost || 0) * 100),
      msrp_cents: Math.round(parseFloat(formData.msrp || 0) * 100)
    };

    createProduct(productData);
  };

  const handleSaveProduct = () => {
    if (!editingProduct) return;

    const costValue = formData.cost !== undefined ? formData.cost : (editingProduct.cost_cents / 100).toFixed(2);
    const msrpValue = formData.msrp !== undefined ? formData.msrp : (editingProduct.msrp_cents / 100).toFixed(2);

    const updates = {
      name: formData.name !== undefined ? formData.name : editingProduct.name,
      model: formData.model !== undefined ? formData.model : editingProduct.model,
      manufacturer: formData.manufacturer !== undefined ? formData.manufacturer : editingProduct.manufacturer,
      category: formData.category !== undefined ? formData.category : editingProduct.category,
      description: formData.description !== undefined ? formData.description : editingProduct.description,
      cost_cents: Math.round(parseFloat(costValue || 0) * 100),
      msrp_cents: Math.round(parseFloat(msrpValue || 0) * 100)
    };

    updateProduct(editingProduct.id, updates);
  };

  const handleCSVImport = async () => {
    if (!importFile) {
      showNotification('Please select a file to import', 'error');
      return;
    }

    // Validate file type - support CSV and Excel files
    const fileName = importFile.name.toLowerCase();
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const isValidType = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidType) {
      showNotification('Please select a valid CSV or Excel file (.csv, .xlsx, .xls)', 'error');
      return;
    }

    // Validate file size (25MB max for Excel files)
    const maxSize = 25 * 1024 * 1024;
    if (importFile.size > maxSize) {
      showNotification('File size exceeds 25MB limit. Please use a smaller file.', 'error');
      return;
    }

    try {
      setImporting(true);
      setImportResults(null);

      const formData = new FormData();
      formData.append('file', importFile);

      // Use the new universal import endpoint
      const response = await authFetch(`${API_BASE}/products/import-universal`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setImportResults(result);
      const fileType = fileName.endsWith('.csv') ? 'CSV' : 'Excel';
      showNotification(`${fileType} import complete! ${result.summary?.inserted || 0} new, ${result.summary?.updated || 0} updated`, 'success');

      // Invalidate cache and reload products after successful import
      invalidateCache('/api/products');
      invalidateCache('/api/products/stats');
      await loadAllData();
      setImportFile(null);
    } catch (error) {
      handleApiError(error, { context: 'Importing products' });
    } finally {
      if (isMounted.current) {
        setImporting(false);
      }
    }
  };

  const downloadCSVTemplate = () => {
    const template = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
Samsung,RF28R7351SG,French Door Refrigerator 28 cu ft,Refrigerators,1299.99,2499.99
LG,WM9000HVA,Front Load Washer 5.2 cu ft,Washers,899.99,1599.99
Whirlpool,WRS325SDHZ,Side-by-Side Refrigerator 25 cu ft,Refrigerators,749.99,1299.99`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showNotification('CSV template downloaded successfully', 'success');
  };

  const formatPrice = (cents) => {
    if (!cents) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(cents / 100);
  };

  // Get filtered manufacturers for searchable dropdown
  const getFilteredManufacturers = () => {
    const manufacturers = getManufacturers();
    if (!manufacturerSearch) return manufacturers;
    return manufacturers.filter(m =>
      m.toLowerCase().includes(manufacturerSearch.toLowerCase())
    );
  };

  const getManufacturers = () => {
    const manufacturers = [...new Set(products.map(p => p.manufacturer).filter(Boolean))];
    return manufacturers.sort();
  };

  const getCategories = () => {
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    return categories.sort();
  };

  // Dashboard View
  const renderDashboard = () => {
    // Get recent products sorted by updated_at
    const recentProducts = [...products]
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA; // Most recent first
      })
      .slice(0, 10);

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #667eea' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Products</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.total_products || products.length}</div>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Manufacturers</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.manufacturers || getManufacturers().length}</div>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Categories</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.categories || getCategories().length}</div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600' }}>Recently Updated Products</h3>
          {recentProducts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
              <div style={{ fontSize: '16px' }}>No products yet. Add your first product!</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Model</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Manufacturer</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Cost</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>MSRP</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProducts.map(product => (
                    <tr key={product.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>
                        {product.model ? (
                          <ModelTooltip
                            modelNumber={product.model}
                            manufacturer={product.manufacturer}
                            productName={product.name}
                            category={product.category}
                          >
                            {product.model}
                          </ModelTooltip>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{product.name || '-'}</td>
                      <td style={{ padding: '12px' }}>{product.manufacturer || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatPrice(product.cost_cents)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>{formatPrice(product.msrp_cents)}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                        {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Browser View
  const renderBrowser = () => (
    <div>
      {/* Enhanced Search and Filters */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {/* Row 1: Search and Quick Filters */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '15px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ width: '650px', minWidth: '350px', flexShrink: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Search</label>
            <div style={{ position: 'relative' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by model #, name, or brand... (Press / to focus)"
                style={{ width: '100%', padding: '10px 36px 10px 36px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
              {filtering && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#667eea', animation: 'spin 1s linear infinite' }}>⏳</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              style={{
                padding: '10px 16px',
                background: showFavorites ? '#fef3c7' : '#f9fafb',
                color: showFavorites ? '#d97706' : '#6b7280',
                border: showFavorites ? '2px solid #f59e0b' : '2px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Show favorite products"
            >
              ⭐ Favorites
            </button>
            <button
              onClick={() => setShowRecent(!showRecent)}
              style={{
                padding: '10px 16px',
                background: showRecent ? '#dbeafe' : '#f9fafb',
                color: showRecent ? '#2563eb' : '#6b7280',
                border: showRecent ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Show products added/updated in last 7 days"
            >
              🕒 Recent
            </button>
            <button
              onClick={exportToCSV}
              style={{
                padding: '10px 16px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export all filtered products'}
            >
              📥 Export{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>

            {/* View Mode Toggle */}
            <div style={{
              display: 'flex',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              padding: '4px',
            }}>
              <button
                onClick={() => {
                  setProductViewMode('table');
                  localStorage.setItem('productViewMode', 'table');
                }}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: productViewMode === 'table' ? 'white' : 'transparent',
                  color: productViewMode === 'table' ? '#111827' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: productViewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                title="Table view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>
              <button
                onClick={() => {
                  setProductViewMode('grid');
                  localStorage.setItem('productViewMode', 'grid');
                }}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: productViewMode === 'grid' ? 'white' : 'transparent',
                  color: productViewMode === 'grid' ? '#111827' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: productViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                title="Grid view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </button>
            </div>
          </div>
          {hasActiveFilters() && (
            <button
              onClick={clearAllFilters}
              style={{
                padding: '10px 16px',
                background: '#fee2e2',
                color: '#dc2626',
                border: '2px solid #fca5a5',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              ✕ Clear All
            </button>
          )}
        </div>

        {/* Row 2: Dropdowns and Price Range */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Manufacturer
            </label>
            <div
              onClick={() => setShowManufacturerDropdown(!showManufacturerDropdown)}
              style={{
                width: '100%',
                padding: '10px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                background: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filterManufacturer === 'all' ? 'All Manufacturers' : filterManufacturer}</span>
              <span style={{ color: '#9ca3af' }}>{showManufacturerDropdown ? '▲' : '▼'}</span>
            </div>
            {showManufacturerDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100,
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: 'white' }}>
                  <input
                    type="text"
                    value={manufacturerSearch}
                    onChange={(e) => setManufacturerSearch(e.target.value)}
                    placeholder="Search manufacturers..."
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px' }}
                    autoFocus
                  />
                </div>
                <div
                  onClick={() => { setFilterManufacturer('all'); setShowManufacturerDropdown(false); setManufacturerSearch(''); }}
                  style={{ padding: '10px 12px', cursor: 'pointer', background: filterManufacturer === 'all' ? '#e0e7ff' : 'white', fontWeight: filterManufacturer === 'all' ? '600' : 'normal' }}
                  onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                  onMouseLeave={(e) => e.target.style.background = filterManufacturer === 'all' ? '#e0e7ff' : 'white'}
                >
                  All Manufacturers
                </div>
                {getFilteredManufacturers().map(mfr => (
                  <div
                    key={mfr}
                    onClick={() => { setFilterManufacturer(mfr); setShowManufacturerDropdown(false); setManufacturerSearch(''); }}
                    style={{ padding: '10px 12px', cursor: 'pointer', background: filterManufacturer === mfr ? '#e0e7ff' : 'white', fontWeight: filterManufacturer === mfr ? '600' : 'normal' }}
                    onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.target.style.background = filterManufacturer === mfr ? '#e0e7ff' : 'white'}
                  >
                    {mfr}
                  </div>
                ))}
                {getFilteredManufacturers().length === 0 && (
                  <div style={{ padding: '12px', color: '#9ca3af', textAlign: 'center', fontSize: '13px' }}>
                    No manufacturers found
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Category</label>
            <CategoryPicker
              value={filterCategorySlug}
              onChange={(slug, category) => {
                setFilterCategorySlug(slug);
                setFilterCategory('all'); // Reset legacy filter when using new picker
              }}
              placeholder="All Categories"
              showCounts={true}
              allowClear={true}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Price Range ({priceField === 'msrp' ? 'MSRP' : 'Cost'})
              <button
                onClick={() => setPriceField(priceField === 'cost' ? 'msrp' : 'cost')}
                style={{ marginLeft: '8px', fontSize: '11px', color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Switch to {priceField === 'cost' ? 'MSRP' : 'Cost'}
              </button>
            </label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min"
                style={{ flex: '1', minWidth: '60px', maxWidth: '80px', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ color: '#9ca3af', flexShrink: 0 }}>-</span>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max"
                style={{ flex: '1', minWidth: '60px', maxWidth: '80px', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
            >
              <option value="updated_desc">Recently Updated</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="manufacturer_asc">Manufacturer (A-Z)</option>
              <option value="price_asc">Cost (Low-High)</option>
              <option value="price_desc">Cost (High-Low)</option>
              <option value="msrp_asc">MSRP (Low-High)</option>
              <option value="msrp_desc">MSRP (High-Low)</option>
              <option value="margin_desc">Margin % (High-Low)</option>
              <option value="margin_asc">Margin % (Low-High)</option>
            </select>
          </div>
        </div>

        {/* Row 3: Price Quick Presets */}
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px', alignSelf: 'center' }}>Quick:</span>
          {[
            { label: 'Under $500', min: '', max: '500' },
            { label: '$500-$1k', min: '500', max: '1000' },
            { label: '$1k-$2k', min: '1000', max: '2000' },
            { label: '$2k-$5k', min: '2000', max: '5000' },
            { label: '$5k-$10k', min: '5000', max: '10000' },
            { label: '$10k-$20k', min: '10000', max: '20000' },
            { label: 'Over $20k', min: '20000', max: '' }
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => { setMinPrice(preset.min); setMaxPrice(preset.max); }}
              style={{
                padding: '4px 10px',
                background: (minPrice === preset.min && maxPrice === preset.max) ? '#667eea' : '#f3f4f6',
                color: (minPrice === preset.min && maxPrice === preset.max) ? 'white' : '#4b5563',
                border: 'none',
                borderRadius: '20px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Row 4: Active Filter Badges */}
        {hasActiveFilters() && (
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Active:</span>
            {searchTerm && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#e0e7ff', color: '#4338ca', borderRadius: '20px', fontSize: '12px' }}>
                Search: "{searchTerm}"
                <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: '#4338ca', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            )}
            {filterManufacturer !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#dcfce7', color: '#166534', borderRadius: '20px', fontSize: '12px' }}>
                {filterManufacturer}
                <button onClick={() => setFilterManufacturer('all')} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            )}
            {(filterCategorySlug || filterCategory !== 'all') && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#fef3c7', color: '#92400e', borderRadius: '20px', fontSize: '12px' }}>
                {filterCategorySlug ? filterCategorySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : filterCategory}
                <button onClick={() => { setFilterCategorySlug(null); setFilterCategory('all'); }} style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            )}
            {(minPrice || maxPrice) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#fce7f3', color: '#9d174d', borderRadius: '20px', fontSize: '12px' }}>
                ${minPrice || '0'} - ${maxPrice || '∞'}
                <button onClick={() => { setMinPrice(''); setMaxPrice(''); }} style={{ background: 'none', border: 'none', color: '#9d174d', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            )}
            {showFavorites && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#fef3c7', color: '#d97706', borderRadius: '20px', fontSize: '12px' }}>
                ★ Favorites
                <button onClick={() => setShowFavorites(false)} style={{ background: 'none', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            )}
            {showRecent && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#dbeafe', color: '#2563eb', borderRadius: '20px', fontSize: '12px' }}>
                ⏱ Recent (7 days)
                <button onClick={() => setShowRecent(false)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
              Showing {filteredProducts.length} of {products.length}
            </span>
          </div>
        )}
      </div>

      {/* Bulk Action Bar - appears when products are selected */}
      {selectedIds.size > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'white', fontWeight: '600', fontSize: '15px' }}>
              {selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Clear Selection
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={openCompareModal}
              disabled={selectedIds.size < 2}
              style={{
                background: selectedIds.size >= 2 ? 'white' : 'rgba(255,255,255,0.5)',
                color: selectedIds.size >= 2 ? '#4338ca' : 'rgba(67, 56, 202, 0.5)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: selectedIds.size >= 2 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={selectedIds.size < 2 ? 'Select at least 2 products to compare' : `Compare ${selectedIds.size} products`}
            >
              ⚖️ Compare
            </button>
            <button
              onClick={openBulkPriceModal}
              style={{
                background: 'white',
                color: '#4338ca',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              💰 Update Prices
            </button>
            <button
              onClick={exportToCSV}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📥 Export
            </button>
            <button
              onClick={executeBulkDelete}
              style={{
                background: 'rgba(239, 68, 68, 0.9)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {/* Header with count and pagination controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
              {filtering ? '⏳ Filtering...' : `${filteredProducts.length.toLocaleString()} products`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
            <button
              onClick={() => setShowShortcutsModal(true)}
              style={{
                padding: '6px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: '#f9fafb',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Keyboard shortcuts (Press ?)"
            >
              ⌨️ <span style={{ fontSize: '12px' }}>?</span>
            </button>
          </div>
        </div>

        {/* Grid View */}
        {productViewMode === 'grid' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
            padding: '4px',
          }}>
            {filteredProducts.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                No products match your filters
              </div>
            ) : (
              getCurrentPageProducts().map(product => {
                const margin = product.cost_cents && product.msrp_cents
                  ? (((product.msrp_cents - product.cost_cents) / product.msrp_cents) * 100).toFixed(1)
                  : null;
                const stockStatus = product.quantity_on_hand === 0 || product.quantity_on_hand === null
                  ? 'out'
                  : product.quantity_on_hand <= (product.reorder_point || 5)
                    ? 'low'
                    : 'ok';
                const stockColors = { out: '#ef4444', low: '#f59e0b', ok: '#22c55e' };
                const stockLabels = { out: 'Out of Stock', low: 'Low Stock', ok: 'In Stock' };

                return (
                  <div
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      padding: '16px',
                      boxShadow: selectedIds.has(product.id)
                        ? '0 0 0 2px #6366f1'
                        : '0 1px 3px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      border: favorites.includes(product.id) ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = selectedIds.has(product.id)
                        ? '0 0 0 2px #6366f1'
                        : '0 1px 3px rgba(0,0,0,0.1)';
                    }}
                  >
                    {/* Selection checkbox */}
                    <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectProduct(product.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                    </div>

                    {/* Favorite star */}
                    <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(product.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '18px',
                          color: favorites.includes(product.id) ? '#f59e0b' : '#d1d5db',
                          padding: '0',
                        }}
                      >
                        {favorites.includes(product.id) ? '★' : '☆'}
                      </button>
                    </div>

                    {/* Stock Badge */}
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '44px',
                      backgroundColor: stockColors[stockStatus],
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                    }}>
                      {stockLabels[stockStatus]}
                    </div>

                    {/* Product Info */}
                    <div style={{ marginTop: '32px' }}>
                      {/* Model Number */}
                      <div style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: '#6366f1',
                        marginBottom: '8px',
                        fontWeight: '600',
                      }}>
                        {product.model || 'No Model'}
                      </div>

                      {/* Product Name */}
                      <div style={{
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#111827',
                        marginBottom: '8px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: '1.4',
                        minHeight: '40px',
                      }}>
                        {product.name || 'Unnamed Product'}
                      </div>

                      {/* Brand & Category */}
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '12px',
                      }}>
                        {product.manufacturer && (
                          <span style={{
                            backgroundColor: '#f3f4f6',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            marginRight: '8px',
                          }}>
                            {product.manufacturer}
                          </span>
                        )}
                        {product.category && (
                          <span>{simplifyCategory(product.category, product.manufacturer)}</span>
                        )}
                      </div>

                      {/* Pricing */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        borderTop: '1px solid #f3f4f6',
                        paddingTop: '12px',
                        marginTop: '8px',
                      }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>Cost</div>
                          <div style={{ fontFamily: 'monospace', fontWeight: '600', color: '#374151' }}>
                            ${product.cost_cents ? (product.cost_cents / 100).toFixed(2) : '0.00'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>MSRP</div>
                          <div style={{ fontFamily: 'monospace', fontWeight: '600', color: '#111827' }}>
                            ${product.msrp_cents ? (product.msrp_cents / 100).toFixed(2) : '0.00'}
                          </div>
                        </div>
                        {margin && (
                          <div style={{
                            backgroundColor: parseFloat(margin) >= 20 ? '#dcfce7' : parseFloat(margin) >= 10 ? '#fef3c7' : '#fee2e2',
                            color: parseFloat(margin) >= 20 ? '#166534' : parseFloat(margin) >= 10 ? '#92400e' : '#991b1b',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                          }}>
                            {margin}%
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      {product.quantity_on_hand !== null && product.quantity_on_hand !== undefined && (
                        <div style={{
                          marginTop: '8px',
                          fontSize: '12px',
                          color: '#6b7280',
                        }}>
                          Qty: {product.quantity_on_hand}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Table View */}
        {productViewMode === 'table' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={toggleSelectAll}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    title="Select all on this page"
                  />
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', width: '40px' }} title="Favorites">⭐</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Model</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Brand</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Category</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Cost</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>MSRP</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Margin</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                    No products match your filters
                  </td>
                </tr>
              ) : (
                getCurrentPageProducts().map(product => {
                  const margin = product.cost_cents && product.msrp_cents
                    ? (((product.msrp_cents - product.cost_cents) / product.msrp_cents) * 100).toFixed(1)
                    : null;
                  return (
                    <tr
                      key={product.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: selectedIds.has(product.id) ? '#f0f9ff' : 'white'
                      }}
                    >
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelectProduct(product.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleFavorite(product.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '18px',
                            color: favorites.includes(product.id) ? '#f59e0b' : '#d1d5db',
                            padding: '4px'
                          }}
                          title={favorites.includes(product.id) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {favorites.includes(product.id) ? '★' : '☆'}
                        </button>
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>
                        {product.model ? (
                          <ModelTooltip
                            modelNumber={product.model}
                            manufacturer={product.manufacturer}
                            productName={product.name}
                            category={product.category}
                          >
                            {product.model}
                          </ModelTooltip>
                        ) : '(Not specified)'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: '500', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={product.name}>{product.name || '(Not specified)'}</td>
                      <td style={{ padding: '12px' }}>{product.manufacturer || '(Not specified)'}</td>
                      <td style={{ padding: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={product.category}>
                        {simplifyCategory(product.category, product.manufacturer)}
                      </td>
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                        onDoubleClick={() => startInlineEdit(product.id, 'cost', product.cost_cents)}
                        title="Double-click to edit"
                      >
                        {inlineEdit?.productId === product.id && inlineEdit?.field === 'cost' ? (
                          <input
                            ref={inlineEditRef}
                            type="number"
                            step="0.01"
                            min="0"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleInlineEditKeyDown}
                            disabled={inlineEditSaving}
                            style={{
                              width: '90px',
                              padding: '4px 8px',
                              border: '2px solid #667eea',
                              borderRadius: '4px',
                              fontSize: '13px',
                              fontFamily: 'monospace',
                              textAlign: 'right',
                              background: inlineEditSaving ? '#f3f4f6' : 'white'
                            }}
                          />
                        ) : (
                          <span style={{ padding: '4px 8px', borderRadius: '4px', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                          >
                            {formatPrice(product.cost_cents)}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          fontWeight: '600',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                        onDoubleClick={() => startInlineEdit(product.id, 'msrp', product.msrp_cents)}
                        title="Double-click to edit"
                      >
                        {inlineEdit?.productId === product.id && inlineEdit?.field === 'msrp' ? (
                          <input
                            ref={inlineEditRef}
                            type="number"
                            step="0.01"
                            min="0"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleInlineEditKeyDown}
                            disabled={inlineEditSaving}
                            style={{
                              width: '90px',
                              padding: '4px 8px',
                              border: '2px solid #10b981',
                              borderRadius: '4px',
                              fontSize: '13px',
                              fontFamily: 'monospace',
                              textAlign: 'right',
                              fontWeight: '600',
                              background: inlineEditSaving ? '#f3f4f6' : 'white'
                            }}
                          />
                        ) : (
                          <span style={{ padding: '4px 8px', borderRadius: '4px', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                          >
                            {formatPrice(product.msrp_cents)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {margin !== null ? (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: parseFloat(margin) >= 30 ? '#dcfce7' : parseFloat(margin) >= 20 ? '#fef3c7' : '#fee2e2',
                            color: parseFloat(margin) >= 30 ? '#166534' : parseFloat(margin) >= 20 ? '#92400e' : '#dc2626'
                          }}>
                            {margin}%
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setView('details');
                          }}
                          style={{ padding: '6px 12px', marginRight: '5px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setFormData({});
                            setView('edit');
                          }}
                          style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Pagination Controls */}
        {getTotalPages() > 1 && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredProducts.length)} of {filteredProducts.length.toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 12px',
                  background: currentPage === 1 ? '#f3f4f6' : 'white',
                  color: currentPage === 1 ? '#9ca3af' : '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                ⏮ First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 12px',
                  background: currentPage === 1 ? '#f3f4f6' : 'white',
                  color: currentPage === 1 ? '#9ca3af' : '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                ◀ Prev
              </button>
              <span style={{ padding: '8px 16px', background: '#667eea', color: 'white', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}>
                Page {currentPage} of {getTotalPages()}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(getTotalPages(), p + 1))}
                disabled={currentPage === getTotalPages()}
                style={{
                  padding: '8px 12px',
                  background: currentPage === getTotalPages() ? '#f3f4f6' : 'white',
                  color: currentPage === getTotalPages() ? '#9ca3af' : '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: currentPage === getTotalPages() ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                Next ▶
              </button>
              <button
                onClick={() => setCurrentPage(getTotalPages())}
                disabled={currentPage === getTotalPages()}
                style={{
                  padding: '8px 12px',
                  background: currentPage === getTotalPages() ? '#f3f4f6' : 'white',
                  color: currentPage === getTotalPages() ? '#9ca3af' : '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: currentPage === getTotalPages() ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                Last ⏭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Details View
  const renderDetails = () => {
    if (!selectedProduct) return null;

    const margin = selectedProduct.cost_cents && selectedProduct.msrp_cents
      ? (((selectedProduct.msrp_cents - selectedProduct.cost_cents) / selectedProduct.msrp_cents) * 100).toFixed(1)
      : null;

    const profit = selectedProduct.msrp_cents && selectedProduct.cost_cents
      ? selectedProduct.msrp_cents - selectedProduct.cost_cents
      : 0;

    return (
      <div>
        <button
          onClick={() => setView('browser')}
          style={{ marginBottom: '20px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          ← Back to Browser
        </button>

        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {/* Header with product image */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
            {/* Product Image */}
            <div style={{
              width: '200px',
              height: '200px',
              background: '#f9fafb',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #e5e7eb',
              flexShrink: 0,
              overflow: 'hidden'
            }}>
              {selectedProduct.image_url ? (
                <img
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '<div style="text-align: center; color: #9ca3af;"><div style="font-size: 48px">📦</div><div style="font-size: 12px; margin-top: 8px">No image</div></div>'; }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: '48px' }}>📦</div>
                  <div style={{ fontSize: '12px', marginTop: '8px' }}>No image</div>
                </div>
              )}
            </div>

            {/* Product Header Info */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{selectedProduct.name || '(Not specified)'}</h2>
                <button
                  onClick={() => toggleFavorite(selectedProduct.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '24px',
                    color: favorites.includes(selectedProduct.id) ? '#f59e0b' : '#d1d5db'
                  }}
                >
                  {favorites.includes(selectedProduct.id) ? '★' : '☆'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <span style={{ padding: '4px 12px', background: '#e0e7ff', color: '#4338ca', borderRadius: '20px', fontSize: '13px', fontWeight: '500' }}>
                  {selectedProduct.manufacturer || '(Not specified)'}
                </span>
                <span style={{ padding: '4px 12px', background: '#fef3c7', color: '#92400e', borderRadius: '20px', fontSize: '13px' }}>
                  {simplifyCategory(selectedProduct.category, selectedProduct.manufacturer)}
                </span>
              </div>
              <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '14px' }}>
                Model: <strong>
                  {selectedProduct.model ? (
                    <ModelTooltip
                      modelNumber={selectedProduct.model}
                      manufacturer={selectedProduct.manufacturer}
                      productName={selectedProduct.name}
                      category={selectedProduct.category}
                    >
                      {selectedProduct.model}
                    </ModelTooltip>
                  ) : '(Not specified)'}
                </strong>
              </div>
              {selectedProduct.description && (
                <p style={{ color: '#4b5563', marginTop: '12px', lineHeight: '1.5' }}>
                  {selectedProduct.description}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Pricing Card */}
            <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>Pricing</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>Cost</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatPrice(selectedProduct.cost_cents)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>MSRP</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: '#10b981' }}>{formatPrice(selectedProduct.msrp_cents)}</span>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>Profit</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: '#059669' }}>{formatPrice(profit)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>Margin</span>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    background: margin && parseFloat(margin) >= 30 ? '#dcfce7' : margin && parseFloat(margin) >= 20 ? '#fef3c7' : '#fee2e2',
                    color: margin && parseFloat(margin) >= 30 ? '#166534' : margin && parseFloat(margin) >= 20 ? '#92400e' : '#dc2626'
                  }}>
                    {margin ? `${margin}%` : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Product Details Card */}
            <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>Product Details</h3>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#6b7280', width: '40%' }}>Manufacturer</td>
                    <td style={{ padding: '8px 0', fontWeight: '500' }}>{selectedProduct.manufacturer || '(Not specified)'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#6b7280' }}>Category</td>
                    <td style={{ padding: '8px 0', fontWeight: '500' }}>{simplifyCategory(selectedProduct.category, selectedProduct.manufacturer)}</td>
                  </tr>
                  {selectedProduct.color && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#6b7280' }}>Color/Finish</td>
                      <td style={{ padding: '8px 0', fontWeight: '500' }}>{selectedProduct.color}</td>
                    </tr>
                  )}
                  {selectedProduct.stock_quantity !== undefined && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#6b7280' }}>Stock</td>
                      <td style={{ padding: '8px 0' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: selectedProduct.stock_quantity > 0 ? '#dcfce7' : '#fee2e2',
                          color: selectedProduct.stock_quantity > 0 ? '#166534' : '#dc2626'
                        }}>
                          {selectedProduct.stock_quantity > 0 ? `${selectedProduct.stock_quantity} in stock` : 'Out of stock'}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '8px 0', color: '#6b7280' }}>Last Updated</td>
                    <td style={{ padding: '8px 0', fontWeight: '500' }}>
                      {selectedProduct.updated_at ? new Date(selectedProduct.updated_at).toLocaleDateString() : '(Not specified)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Additional Info Card */}
            <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>Additional Info</h3>
              <table style={{ width: '100%' }}>
                <tbody>
                  {selectedProduct.promo_price_cents > 0 && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#6b7280', width: '40%' }}>Promo Price</td>
                      <td style={{ padding: '8px 0', fontWeight: '500', color: '#dc2626' }}>{formatPrice(selectedProduct.promo_price_cents)}</td>
                    </tr>
                  )}
                  {selectedProduct.map_price_cents > 0 && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#6b7280' }}>MAP Price</td>
                      <td style={{ padding: '8px 0', fontWeight: '500' }}>{formatPrice(selectedProduct.map_price_cents)}</td>
                    </tr>
                  )}
                  {selectedProduct.lead_time_days > 0 && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#6b7280' }}>Lead Time</td>
                      <td style={{ padding: '8px 0', fontWeight: '500' }}>{selectedProduct.lead_time_days} days</td>
                    </tr>
                  )}
                  {selectedProduct.availability && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#6b7280' }}>Availability</td>
                      <td style={{ padding: '8px 0', fontWeight: '500' }}>{selectedProduct.availability}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '8px 0', color: '#6b7280' }}>Created</td>
                    <td style={{ padding: '8px 0', fontWeight: '500' }}>
                      {selectedProduct.created_at ? new Date(selectedProduct.created_at).toLocaleDateString() : '(Not specified)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                setEditingProduct(selectedProduct);
                setFormData({});
                setView('edit');
              }}
              style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
            >
              Edit Product
            </button>
            <button
              onClick={() => {
                // Duplicate product logic
                const duplicatedProduct = {
                  ...selectedProduct,
                  model: `${selectedProduct.model}-COPY`,
                  name: `${selectedProduct.name} (Copy)`
                };
                setFormData({
                  model: duplicatedProduct.model,
                  name: duplicatedProduct.name,
                  manufacturer: duplicatedProduct.manufacturer,
                  category: duplicatedProduct.category,
                  description: duplicatedProduct.description,
                  cost: (duplicatedProduct.cost_cents / 100).toFixed(2),
                  msrp: (duplicatedProduct.msrp_cents / 100).toFixed(2)
                });
                setView('add');
              }}
              style={{ padding: '12px 24px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
            >
              Duplicate Product
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add View
  const renderAdd = () => (
    <div>
      <button
        onClick={() => {
          setFormData({});
          setView('browser');
        }}
        style={{ marginBottom: '20px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
      >
        ← Cancel
      </button>

      <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>Add New Product</h2>

        <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Model Number *</label>
            <input
              type="text"
              value={formData.model || ''}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="Enter model number"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Product Name *</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter product name"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Manufacturer *</label>
            <input
              type="text"
              value={formData.manufacturer || ''}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
              placeholder="Enter manufacturer"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Category</label>
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Enter category"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter product description"
              rows="3"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.cost || ''}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>MSRP ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.msrp || ''}
                onChange={(e) => setFormData({ ...formData, msrp: e.target.value })}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              onClick={handleCreateProduct}
              style={{ padding: '12px 30px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
            >
              Create Product
            </button>
            <button
              onClick={() => {
                setFormData({});
                setView('browser');
              }}
              style={{ padding: '12px 30px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Edit View
  const renderEdit = () => {
    if (!editingProduct) return null;

    return (
      <div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setFormData({});
            setView(selectedProduct ? 'details' : 'browser');
          }}
          style={{ marginBottom: '20px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          ← Cancel
        </button>

        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>Edit Product</h2>

          <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Model Number *</label>
              <input
                type="text"
                defaultValue={editingProduct.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Product Name *</label>
              <input
                type="text"
                defaultValue={editingProduct.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Manufacturer *</label>
              <input
                type="text"
                defaultValue={editingProduct.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Category</label>
              <input
                type="text"
                defaultValue={editingProduct.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Description</label>
              <textarea
                defaultValue={editingProduct.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows="3"
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={(editingProduct.cost_cents / 100).toFixed(2)}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>MSRP ($)</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={(editingProduct.msrp_cents / 100).toFixed(2)}
                  onChange={(e) => setFormData({ ...formData, msrp: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
            </div>

            {/* 3D Model Upload */}
            <div style={{ marginTop: '20px' }}>
              <Model3DUploader
                productId={editingProduct.id}
                currentModel={editingProduct.model_3d}
                onModelUpdated={(model) => {
                  setEditingProduct({ ...editingProduct, model_3d: model });
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleSaveProduct}
                style={{ padding: '12px 30px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setFormData({});
                  setView(selectedProduct ? 'details' : 'browser');
                }}
                style={{ padding: '12px 30px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Import View
  const renderImport = () => (
    <div>
      {/* Smart Import Wizard Card */}
      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)', marginBottom: '20px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>Smart Import Wizard</h2>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>
              AI-assisted column detection, manufacturer templates, validation preview
            </p>
            <ul style={{ margin: '12px 0 0 0', paddingLeft: '20px', opacity: 0.9, fontSize: '13px' }}>
              <li>Auto-detects columns from 50+ manufacturer formats</li>
              <li>Saves templates for quick re-imports</li>
              <li>Preview and validate before importing</li>
            </ul>
          </div>
          <button
            onClick={() => setShowImportWizard(true)}
            style={{
              padding: '14px 28px',
              background: 'white',
              color: '#667eea',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => e.target.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
          >
            Launch Wizard
          </button>
        </div>
      </div>

      {/* Classic CSV Import Card */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>Quick CSV Import</h2>
          <button
            onClick={downloadCSVTemplate}
            style={{
              padding: '8px 16px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Download Template
          </button>
        </div>
        <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
          Quick import for simple files with auto-detected columns. For complex manufacturer sheets, use the Smart Import Wizard above.<br/>
          <span style={{ fontSize: '12px' }}>Common column names supported: MODEL, SKU, Part Number, MANUFACTURER, Brand, COST, Dealer Cost, MSRP, Retail Price, Description</span>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
              Select File <span style={{ color: '#6b7280', fontWeight: 'normal' }}>(Supports Excel .xlsx, .xls and CSV .csv)</span>
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              title="Supported formats: Excel (.xlsx, .xls), CSV (.csv)"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const maxSize = 25 * 1024 * 1024; // 25MB for Excel files
                  if (file.size > maxSize) {
                    showNotification('File size exceeds 25MB limit. Please use a smaller file.', 'error');
                    e.target.value = '';
                    setImportFile(null);
                    return;
                  }
                  if (file.size > 10 * 1024 * 1024) { // 10MB warning
                    showNotification('Large file detected (>10MB). Import may take longer.', 'warning');
                  }
                  setImportFile(file);
                  setImportResults(null);
                }
              }}
              style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', width: '100%' }}
            />
          </div>

          {importFile && (
            <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '14px' }}>
              Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(2)} KB)
            </div>
          )}

          <button
            onClick={handleCSVImport}
            disabled={!importFile || importing}
            style={{
              padding: '12px 30px',
              background: importing ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: importing || !importFile ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            {importing ? '⏳ Importing...' : 'Upload and Import'}
          </button>
        </div>
      </div>

      {/* Import Results */}
      {importResults && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>Import Results</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '2px solid #10b981' }}>
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600', marginBottom: '4px' }}>Successful</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#059669' }}>{importResults.successful}</div>
            </div>
            <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '2px solid #ef4444' }}>
              <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600', marginBottom: '4px' }}>Failed</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>{importResults.failed}</div>
            </div>
            <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '2px solid #6b7280' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>Total Rows</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#6b7280' }}>{importResults.total}</div>
            </div>
          </div>

          {importResults.errors && importResults.errors.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#dc2626' }}>Errors:</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#fef2f2', padding: '15px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                {importResults.errors.map((error, idx) => (
                  <div key={idx} style={{ marginBottom: '8px', fontSize: '13px', fontFamily: 'monospace', color: '#991b1b' }}>
                    Row {error.row}: {error.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button
              onClick={() => {
                setImportResults(null);
                setImportFile(null);
              }}
              style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', color: '#6b7280' }}>Loading products...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: notification.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          fontWeight: '500'
        }}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.message}
        </div>
      )}

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🏷️ Products
            </h1>
            <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
              Product catalog and management
            </p>
          </div>
          <button
            onClick={() => {
              invalidateCache('/api/products');
              loadedOnce.current = false;
              loadAllData();
            }}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: loading ? '#9ca3af' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', borderBottom: '2px solid #e5e7eb' }}>
          {[
            { id: 'browser', label: '🔍 Browse' },
            { id: 'add', label: '➕ Add Product' },
            { id: 'import', label: '📤 Import' },
            { id: 'templates', label: '📋 Templates' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id);
                if (tab.id === 'add') {
                  setFormData({});
                }
              }}
              style={{
                padding: '12px 24px',
                background: view === tab.id ? '#667eea' : 'transparent',
                color: view === tab.id ? 'white' : '#6b7280',
                border: 'none',
                borderBottom: view === tab.id ? '3px solid #667eea' : '3px solid transparent',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontWeight: view === tab.id ? '600' : 'normal',
                fontSize: '15px'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {view === 'browser' && renderBrowser()}
        {view === 'add' && renderAdd()}
        {view === 'import' && renderImport()}
        {view === 'templates' && <ManufacturerTemplateManager />}
        {view === 'details' && renderDetails()}
        {view === 'edit' && renderEdit()}
      </div>

      {/* Product Comparison Modal */}
      {showCompareModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '95%',
            maxWidth: '1200px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                ⚖️ Product Comparison
                <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#6b7280' }}>
                  ({getComparisonProducts().length} products)
                </span>
              </h2>
              <button
                onClick={() => setShowCompareModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Comparison Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{
                      padding: '16px 20px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      minWidth: '140px',
                      background: '#f9fafb'
                    }}>
                      Attribute
                    </th>
                    {getComparisonProducts().map((product, idx) => (
                      <th key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        fontWeight: '600',
                        borderBottom: '2px solid #e5e7eb',
                        minWidth: '180px',
                        background: idx === 0 ? '#e0e7ff' : '#f9fafb'
                      }}>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                          {product.manufacturer}
                        </div>
                        <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>
                          {product.model ? (
                            <ModelTooltip
                              modelNumber={product.model}
                              manufacturer={product.manufacturer}
                              productName={product.name}
                              category={product.category}
                            >
                              {product.model}
                            </ModelTooltip>
                          ) : '-'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Product Image Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      Image
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        <div style={{
                          width: '100px',
                          height: '100px',
                          margin: '0 auto',
                          background: '#f3f4f6',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden'
                        }}>
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <span style={{ fontSize: '32px' }}>📦</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Product Name Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      Product Name
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        fontWeight: '500',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        {getComparisonValue(product, 'name')}
                      </td>
                    ))}
                  </tr>

                  {/* Category Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      Category
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        <span style={{
                          padding: '4px 10px',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '12px',
                          fontSize: '12px'
                        }}>
                          {getComparisonValue(product, 'category')}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Cost Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#f0fdf4' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      💵 Cost
                    </td>
                    {(() => {
                      const compProducts = getComparisonProducts();
                      const lowestCost = getLowestPrice(compProducts, 'cost_cents');
                      return compProducts.map((product, idx) => {
                        const isLowest = product.cost_cents === lowestCost && lowestCost > 0;
                        return (
                          <td key={product.id} style={{
                            padding: '16px 20px',
                            textAlign: 'center',
                            fontFamily: 'monospace',
                            fontSize: '16px',
                            fontWeight: '600',
                            background: isLowest ? '#dcfce7' : (idx === 0 ? '#f5f7ff' : 'white'),
                            color: isLowest ? '#166534' : '#374151'
                          }}>
                            {getComparisonValue(product, 'cost')}
                            {isLowest && <span style={{ display: 'block', fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>✓ Lowest</span>}
                          </td>
                        );
                      });
                    })()}
                  </tr>

                  {/* MSRP Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      💰 MSRP
                    </td>
                    {(() => {
                      const compProducts = getComparisonProducts();
                      const lowestMsrp = getLowestPrice(compProducts, 'msrp_cents');
                      return compProducts.map((product, idx) => {
                        const isLowest = product.msrp_cents === lowestMsrp && lowestMsrp > 0;
                        return (
                          <td key={product.id} style={{
                            padding: '16px 20px',
                            textAlign: 'center',
                            fontFamily: 'monospace',
                            fontSize: '16px',
                            fontWeight: '600',
                            background: isLowest ? '#dbeafe' : (idx === 0 ? '#f5f7ff' : 'white'),
                            color: isLowest ? '#1d4ed8' : '#374151'
                          }}>
                            {getComparisonValue(product, 'msrp')}
                            {isLowest && <span style={{ display: 'block', fontSize: '11px', color: '#2563eb', marginTop: '4px' }}>✓ Lowest</span>}
                          </td>
                        );
                      });
                    })()}
                  </tr>

                  {/* Profit Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      📈 Profit
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#059669',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        {getComparisonValue(product, 'profit')}
                      </td>
                    ))}
                  </tr>

                  {/* Margin Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      📊 Margin %
                    </td>
                    {(() => {
                      const compProducts = getComparisonProducts();
                      const highestMargin = getHighestMargin(compProducts);
                      return compProducts.map((product, idx) => {
                        const margin = product.cost_cents && product.msrp_cents
                          ? (product.msrp_cents - product.cost_cents) / product.msrp_cents * 100
                          : 0;
                        const isHighest = Math.abs(margin - highestMargin) < 0.01 && highestMargin > 0;
                        return (
                          <td key={product.id} style={{
                            padding: '16px 20px',
                            textAlign: 'center',
                            background: isHighest ? '#fef3c7' : (idx === 0 ? '#f5f7ff' : 'white')
                          }}>
                            <span style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontWeight: '600',
                              fontSize: '14px',
                              background: margin >= 30 ? '#dcfce7' : margin >= 20 ? '#fef3c7' : '#fee2e2',
                              color: margin >= 30 ? '#166534' : margin >= 20 ? '#92400e' : '#dc2626'
                            }}>
                              {getComparisonValue(product, 'margin')}
                            </span>
                            {isHighest && <span style={{ display: 'block', fontSize: '11px', color: '#d97706', marginTop: '6px' }}>★ Best Margin</span>}
                          </td>
                        );
                      });
                    })()}
                  </tr>

                  {/* Color/Finish Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      🎨 Color/Finish
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        {getComparisonValue(product, 'color')}
                      </td>
                    ))}
                  </tr>

                  {/* Stock Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      📦 Stock
                    </td>
                    {getComparisonProducts().map((product, idx) => {
                      const inStock = product.stock_quantity > 0;
                      return (
                        <td key={product.id} style={{
                          padding: '16px 20px',
                          textAlign: 'center',
                          background: idx === 0 ? '#f5f7ff' : 'white'
                        }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: inStock ? '#dcfce7' : (product.stock_quantity === undefined ? '#f3f4f6' : '#fee2e2'),
                            color: inStock ? '#166534' : (product.stock_quantity === undefined ? '#6b7280' : '#dc2626')
                          }}>
                            {getComparisonValue(product, 'stock')}
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Availability Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      📅 Availability
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        {getComparisonValue(product, 'availability')}
                      </td>
                    ))}
                  </tr>

                  {/* Last Updated Row */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#6b7280', background: '#f9fafb' }}>
                      🕒 Last Updated
                    </td>
                    {getComparisonProducts().map((product, idx) => (
                      <td key={product.id} style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: '#6b7280',
                        background: idx === 0 ? '#f5f7ff' : 'white'
                      }}>
                        {getComparisonValue(product, 'updated')}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f9fafb'
            }}>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                💡 Tip: First product column is highlighted for reference
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    // Export comparison to CSV
                    const compProducts = getComparisonProducts();
                    const fields = ['Model', 'Name', 'Manufacturer', 'Category', 'Cost', 'MSRP', 'Profit', 'Margin', 'Color', 'Stock', 'Updated'];
                    let csv = 'Attribute,' + compProducts.map(p => `"${p.model}"`).join(',') + '\n';

                    const rows = [
                      ['Name', ...compProducts.map(p => getComparisonValue(p, 'name'))],
                      ['Manufacturer', ...compProducts.map(p => getComparisonValue(p, 'manufacturer'))],
                      ['Category', ...compProducts.map(p => getComparisonValue(p, 'category'))],
                      ['Cost', ...compProducts.map(p => getComparisonValue(p, 'cost'))],
                      ['MSRP', ...compProducts.map(p => getComparisonValue(p, 'msrp'))],
                      ['Profit', ...compProducts.map(p => getComparisonValue(p, 'profit'))],
                      ['Margin', ...compProducts.map(p => getComparisonValue(p, 'margin'))],
                      ['Color', ...compProducts.map(p => getComparisonValue(p, 'color'))],
                      ['Stock', ...compProducts.map(p => getComparisonValue(p, 'stock'))],
                      ['Updated', ...compProducts.map(p => getComparisonValue(p, 'updated'))]
                    ];

                    rows.forEach(row => {
                      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
                    });

                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `product-comparison-${new Date().toISOString().slice(0,10)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    showNotification('Comparison exported to CSV', 'success');
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  📥 Export Comparison
                </button>
                <button
                  onClick={() => setShowCompareModal(false)}
                  style={{
                    padding: '10px 20px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Price Update Modal */}
      {showBulkPriceModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>
                💰 Bulk Price Update
              </h2>
              <button
                onClick={closeBulkPriceModal}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px', background: '#e0e7ff', borderRadius: '8px', marginBottom: '24px' }}>
              <span style={{ fontWeight: '600', color: '#4338ca' }}>
                {selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
            </div>

            {/* Field Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                Which prices to update?
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { value: 'both', label: 'Both Cost & MSRP' },
                  { value: 'cost', label: 'Cost Only' },
                  { value: 'msrp', label: 'MSRP Only' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setBulkPriceConfig({ ...bulkPriceConfig, field: option.value })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: bulkPriceConfig.field === option.value ? '2px solid #667eea' : '2px solid #e5e7eb',
                      background: bulkPriceConfig.field === option.value ? '#e0e7ff' : 'white',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: bulkPriceConfig.field === option.value ? '600' : 'normal'
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Update Mode */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                Update method
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { value: 'percent', label: '% Change' },
                  { value: 'amount', label: '$ Amount' },
                  { value: 'fixed', label: 'Set Fixed Price' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setBulkPriceConfig({ ...bulkPriceConfig, mode: option.value })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: bulkPriceConfig.mode === option.value ? '2px solid #667eea' : '2px solid #e5e7eb',
                      background: bulkPriceConfig.mode === option.value ? '#e0e7ff' : 'white',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: bulkPriceConfig.mode === option.value ? '600' : 'normal'
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction (for percent and amount modes) */}
            {bulkPriceConfig.mode !== 'fixed' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Direction
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setBulkPriceConfig({ ...bulkPriceConfig, direction: 'increase' })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: bulkPriceConfig.direction === 'increase' ? '2px solid #10b981' : '2px solid #e5e7eb',
                      background: bulkPriceConfig.direction === 'increase' ? '#dcfce7' : 'white',
                      color: bulkPriceConfig.direction === 'increase' ? '#166534' : '#374151',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: bulkPriceConfig.direction === 'increase' ? '600' : 'normal'
                    }}
                  >
                    ↑ Increase
                  </button>
                  <button
                    onClick={() => setBulkPriceConfig({ ...bulkPriceConfig, direction: 'decrease' })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: bulkPriceConfig.direction === 'decrease' ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      background: bulkPriceConfig.direction === 'decrease' ? '#fee2e2' : 'white',
                      color: bulkPriceConfig.direction === 'decrease' ? '#dc2626' : '#374151',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: bulkPriceConfig.direction === 'decrease' ? '600' : 'normal'
                    }}
                  >
                    ↓ Decrease
                  </button>
                </div>
              </div>
            )}

            {/* Value Input */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                {bulkPriceConfig.mode === 'percent' ? 'Percentage' :
                 bulkPriceConfig.mode === 'amount' ? 'Amount ($)' : 'New Price ($)'}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#6b7280',
                  fontSize: '16px'
                }}>
                  {bulkPriceConfig.mode === 'percent' ? '%' : '$'}
                </span>
                <input
                  type="number"
                  step={bulkPriceConfig.mode === 'percent' ? '1' : '0.01'}
                  min="0"
                  value={bulkPriceConfig.value}
                  onChange={(e) => setBulkPriceConfig({ ...bulkPriceConfig, value: e.target.value })}
                  placeholder={bulkPriceConfig.mode === 'percent' ? 'e.g., 10' : 'e.g., 50.00'}
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 36px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px'
                  }}
                />
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                {bulkPriceConfig.mode === 'percent' && bulkPriceConfig.value && (
                  <>
                    {bulkPriceConfig.direction === 'increase' ? 'Increase' : 'Decrease'} all {bulkPriceConfig.field === 'both' ? 'prices' : bulkPriceConfig.field} by {bulkPriceConfig.value}%
                  </>
                )}
                {bulkPriceConfig.mode === 'amount' && bulkPriceConfig.value && (
                  <>
                    {bulkPriceConfig.direction === 'increase' ? 'Add' : 'Subtract'} ${parseFloat(bulkPriceConfig.value).toFixed(2)} {bulkPriceConfig.direction === 'increase' ? 'to' : 'from'} {bulkPriceConfig.field === 'both' ? 'all prices' : bulkPriceConfig.field}
                  </>
                )}
                {bulkPriceConfig.mode === 'fixed' && bulkPriceConfig.value && (
                  <>
                    Set {bulkPriceConfig.field === 'both' ? 'all prices' : bulkPriceConfig.field} to ${parseFloat(bulkPriceConfig.value).toFixed(2)}
                  </>
                )}
              </div>
            </div>

            {/* Preview */}
            {bulkPriceConfig.value && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Preview (first 5 products)
                </label>
                <div style={{ background: '#f9fafb', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#e5e7eb' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Model</th>
                        {bulkPriceConfig.field !== 'msrp' && (
                          <>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Old Cost</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>New Cost</th>
                          </>
                        )}
                        {bulkPriceConfig.field !== 'cost' && (
                          <>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Old MSRP</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>New MSRP</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {getPreviewPrices().map((p, idx) => (
                        <tr key={p.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>
                            {p.model ? (
                              <ModelTooltip
                                modelNumber={p.model}
                                manufacturer={p.manufacturer}
                                productName={p.name}
                                category={p.category}
                              >
                                {p.model}
                              </ModelTooltip>
                            ) : '-'}
                          </td>
                          {bulkPriceConfig.field !== 'msrp' && (
                            <>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{formatPrice(p.oldCost)}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: p.newCost !== p.oldCost ? '#059669' : 'inherit', fontWeight: '600' }}>
                                {formatPrice(p.newCost)}
                              </td>
                            </>
                          )}
                          {bulkPriceConfig.field !== 'cost' && (
                            <>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{formatPrice(p.oldMsrp)}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: p.newMsrp !== p.oldMsrp ? '#059669' : 'inherit', fontWeight: '600' }}>
                                {formatPrice(p.newMsrp)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedIds.size > 5 && (
                    <div style={{ padding: '8px', textAlign: 'center', color: '#6b7280', fontSize: '12px', borderTop: '1px solid #e5e7eb' }}>
                      ...and {selectedIds.size - 5} more products
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={closeBulkPriceModal}
                disabled={bulkPriceUpdating}
                style={{
                  padding: '12px 24px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: bulkPriceUpdating ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeBulkPriceUpdate}
                disabled={!bulkPriceConfig.value || bulkPriceUpdating}
                style={{
                  padding: '12px 24px',
                  background: !bulkPriceConfig.value || bulkPriceUpdating ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: !bulkPriceConfig.value || bulkPriceUpdating ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {bulkPriceUpdating ? (
                  <>⏳ Updating...</>
                ) : (
                  <>✓ Update {selectedIds.size} Products</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcutsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '95%',
            maxWidth: '600px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                ⌨️ Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setShowShortcutsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Shortcuts List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {/* Navigation Section */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Navigation
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: '/ or Ctrl+F', desc: 'Focus search box' },
                    { key: '← →', desc: 'Previous / Next page' },
                    { key: 'Home / End', desc: 'First / Last page' },
                    { key: 'Esc', desc: 'Close modal / Clear selection' }
                  ].map(({ key, desc }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#374151' }}>{desc}</span>
                      <kbd style={{
                        padding: '4px 8px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selection Section */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Selection
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'Ctrl+A', desc: 'Select all on page' },
                    { key: 'Ctrl+D', desc: 'Deselect all' }
                  ].map(({ key, desc }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#374151' }}>{desc}</span>
                      <kbd style={{
                        padding: '4px 8px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions Section */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Actions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'Ctrl+N', desc: 'New product' },
                    { key: 'Ctrl+E', desc: 'Export to CSV' },
                    { key: 'Ctrl+K', desc: 'Compare selected products' },
                    { key: 'Ctrl+P', desc: 'Bulk price update' },
                    { key: 'Delete', desc: 'Delete selected products' },
                    { key: 'Ctrl+R or F5', desc: 'Refresh product list' }
                  ].map(({ key, desc }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#374151' }}>{desc}</span>
                      <kbd style={{
                        padding: '4px 8px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filters Section */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Filters
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'F', desc: 'Toggle favorites filter' },
                    { key: 'R', desc: 'Toggle recent filter' },
                    { key: 'C', desc: 'Clear all filters' }
                  ].map(({ key, desc }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#374151' }}>{desc}</span>
                      <kbd style={{
                        padding: '4px 8px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Help Section */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Help
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: '?', desc: 'Show this help dialog' }
                  ].map(({ key, desc }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#374151' }}>{desc}</span>
                      <kbd style={{
                        padding: '4px 8px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e5e7eb',
              background: '#f9fafb',
              borderRadius: '0 0 16px 16px'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>
                Shortcuts are disabled when typing in input fields
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Product Import Wizard Modal */}
      {showImportWizard && (
        <ProductImportWizard
          onClose={() => setShowImportWizard(false)}
          onComplete={(results) => {
            setShowImportWizard(false);
            showNotification(`Import complete: ${results.successful} products imported successfully`, 'success');
            // Invalidate cache and refresh product list
            invalidateCache('/api/products');
            invalidateCache('/api/products/stats');
            loadedOnce.current = false;
            loadAllData();
          }}
        />
      )}
    </div>
  );
};

export default ProductManagement;
