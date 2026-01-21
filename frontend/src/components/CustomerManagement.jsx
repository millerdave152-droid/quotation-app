import React, { useState, useEffect, useRef, useCallback } from 'react';
import CustomerCreditTracking from './CustomerCreditTracking';
import CustomerOrderHistory from './CustomerOrderHistory';
import AutocompleteInput from './ui/AutocompleteInput';
import EmailInput from './ui/EmailInput';
import PhoneInput from './ui/PhoneInput';
import logger from '../utils/logger';
import { useDebounce } from '../utils/useDebounce';
import { cachedFetch, invalidateCache } from '../services/apiCache';
import { useToast } from './ui/Toast';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { SkeletonTable, SkeletonStats } from './ui/LoadingSkeleton';
import * as lookupService from '../services/lookupService';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

function CustomerManagement() {
  // State Management
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loadingCustomerId, setLoadingCustomerId] = useState(null); // Track which customer is being loaded
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search to prevent flickering
  const [cityFilter, setCityFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Sorting State
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('ASC');

  // Postal Code & Cities State
  const [availableCities, setAvailableCities] = useState([]);
  const [loadingPostalCode, setLoadingPostalCode] = useState(false);

  // New Form Enhancement State
  const [noEmail, setNoEmail] = useState(false);
  const [noCompany, setNoCompany] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [potentialDuplicates, setPotentialDuplicates] = useState([]);

  // Popular names for quick pick buttons
  const [popularFirstNames, setPopularFirstNames] = useState(['John', 'Michael', 'David', 'Chris', 'James']);
  const [popularLastNames, setPopularLastNames] = useState(['Smith', 'Brown', 'Wilson', 'Taylor', 'Lee']);

  // Form Data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    name: '', // Combined full name - computed from firstName + lastName
    email: '',
    phone: '',
    company: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    notes: ''
  });

  // CLV State
  const [clvData, setClvData] = useState(null);
  const [loadingClv, setLoadingClv] = useState(false);

  // Form Validation State
  const [formErrors, setFormErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Validation rules - accepts skipEmail option for "no email" checkbox
  const validateField = (name, value, options = {}) => {
    switch (name) {
      case 'firstName':
        if (!value || value.trim() === '') return 'First name is required';
        if (value.length < 2) return 'First name must be at least 2 characters';
        return '';
      case 'lastName':
        if (!value || value.trim() === '') return 'Last name is required';
        if (value.length < 2) return 'Last name must be at least 2 characters';
        return '';
      case 'name':
        // Validate combined name (legacy support)
        if (!value || value.trim() === '') return 'Name is required';
        if (value.length < 2) return 'Name must be at least 2 characters';
        return '';
      case 'email':
        // Skip email validation if "no email provided" is checked
        if (options.skipEmail || noEmail) return '';
        if (!value || value.trim() === '') return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
        return '';
      case 'phone':
        if (value && !/^[\d\s\-()]+$/.test(value)) return 'Please enter a valid phone number';
        return '';
      case 'postal_code':
        if (value && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(value)) return 'Please enter a valid postal code (e.g., A1A 1A1)';
        return '';
      default:
        return '';
    }
  };

  const validateForm = () => {
    const errors = {};
    // Validate specific fields that require validation
    const fieldsToValidate = ['firstName', 'lastName', 'email', 'phone', 'postal_code'];
    fieldsToValidate.forEach(field => {
      const error = validateField(field, formData[field], { skipEmail: noEmail });
      if (error) errors[field] = error;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFieldBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const error = validateField(name, formData[name]);
    setFormErrors(prev => ({ ...prev, [name]: error }));
  };

  // Load popular names on mount
  useEffect(() => {
    const loadPopularNames = async () => {
      try {
        const [firstNames, lastNames] = await Promise.all([
          lookupService.getPopularNames('first', 5),
          lookupService.getPopularNames('last', 5)
        ]);
        if (firstNames.length > 0) setPopularFirstNames(firstNames);
        if (lastNames.length > 0) setPopularLastNames(lastNames);
      } catch (err) {
        // Keep default names on error
        logger.warn('Failed to load popular names:', err);
      }
    };
    loadPopularNames();
  }, []);

  // Autocomplete fetch functions
  const fetchCitySuggestions = useCallback(async (query) => {
    return lookupService.searchCities(query, formData.province || null, 10);
  }, [formData.province]);

  // Fuzzy search for first names
  const fetchFirstNameSuggestions = useCallback(async (query) => {
    const names = await lookupService.fuzzySearchNames(query, 'first', 10);
    return names.map(n => ({
      ...n,
      label: n.name,
      sublabel: n.matchType === 'phonetic' ? 'Similar sound' :
                n.matchType === 'variation' ? 'Common variation' :
                n.matchType === 'fuzzy' ? 'Similar spelling' : null
    }));
  }, []);

  // Fuzzy search for last names
  const fetchLastNameSuggestions = useCallback(async (query) => {
    const names = await lookupService.fuzzySearchNames(query, 'last', 10);
    return names.map(n => ({
      ...n,
      label: n.name,
      sublabel: n.matchType === 'phonetic' ? 'Similar sound' :
                n.matchType === 'variation' ? 'Common variation' :
                n.matchType === 'fuzzy' ? 'Similar spelling' : null
    }));
  }, []);

  // Company autocomplete
  const fetchCompanySuggestions = useCallback(async (query) => {
    const companies = await lookupService.searchCompanies(query, 10);
    return companies.map(c => ({ name: c, label: c }));
  }, []);

  // Handle first name selection from autocomplete
  const handleFirstNameSelect = (suggestion) => {
    const firstName = suggestion.name || suggestion.label;
    setFormData(prev => ({
      ...prev,
      firstName,
      name: `${firstName} ${prev.lastName}`.trim()
    }));
  };

  // Handle last name selection from autocomplete
  const handleLastNameSelect = (suggestion) => {
    const lastName = suggestion.name || suggestion.label;
    setFormData(prev => ({
      ...prev,
      lastName,
      name: `${prev.firstName} ${lastName}`.trim()
    }));
  };

  // Handle quick pick name button click
  const handleQuickPickName = (name, type) => {
    if (type === 'first') {
      setFormData(prev => ({
        ...prev,
        firstName: name,
        name: `${name} ${prev.lastName}`.trim()
      }));
      setTouched(prev => ({ ...prev, firstName: true }));
    } else {
      setFormData(prev => ({
        ...prev,
        lastName: name,
        name: `${prev.firstName} ${name}`.trim()
      }));
      setTouched(prev => ({ ...prev, lastName: true }));
    }
  };

  // Handle company selection from autocomplete
  const handleCompanySelect = (suggestion) => {
    setFormData(prev => ({ ...prev, company: suggestion.name || suggestion.label }));
  };

  // Handle city selection from autocomplete
  const handleCitySelect = (city) => {
    setFormData(prev => ({
      ...prev,
      city: city.city_name,
      province: city.province_code
    }));
  };

  // Handle "No email provided" toggle
  const handleNoEmailToggle = (checked) => {
    setNoEmail(checked);
    if (checked) {
      setFormData(prev => ({ ...prev, email: '' }));
      setFormErrors(prev => ({ ...prev, email: '' }));
    }
  };

  // Handle "No Company / Individual" toggle
  const handleNoCompanyToggle = (e) => {
    const checked = e.target.checked;
    setNoCompany(checked);
    if (checked) {
      setFormData(prev => ({ ...prev, company: '' }));
    }
  };

  // Anti-flickering refs
  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  // UI Hooks - Toast notifications and Confirm Dialog
  const toast = useToast();
  const { confirm, DialogComponent } = useConfirmDialog();

  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchCustomers();
      fetchStats();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Separate effect for filters (using debounced search to prevent flickering)
  useEffect(() => {
    if (loadedOnce.current && isMounted.current) {
      fetchCustomers();
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm, cityFilter, provinceFilter, sortBy, sortOrder]);

  // Updated notification function using toast system
  const showNotification = (message, type = 'success') => {
    if (type === 'success') {
      toast.success(message);
    } else if (type === 'error') {
      toast.error(message);
    } else {
      toast.info(message);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await cachedFetch('/api/customers/stats/overview');
      setStats(data);
    } catch (error) {
      logger.error('Error fetching stats:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: itemsPerPage,
        sortBy,
        sortOrder,
        ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
        ...(cityFilter && { city: cityFilter }),
        ...(provinceFilter && { province: provinceFilter })
      });

      const data = await cachedFetch(`/api/customers?${params}`);

      setCustomers(data.customers || []);
      setTotalCount(data?.pagination?.total || 0);
      setTotalPages(data?.pagination?.totalPages || 0);
    } catch (error) {
      logger.error('Error fetching customers:', error);
      showNotification('Failed to fetch customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetails = async (id) => {
    if (!id) {
      showNotification('Invalid customer ID', 'error');
      return;
    }

    try {
      setLoadingCustomerId(id);
      const response = await fetch(`${API_BASE}/customers/${id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      // Handle API response structure: { success, data: { customer, stats, quotes } }
      const data = result.data || result;

      // Validate response structure
      if (!data || !data.customer) {
        logger.error('Invalid customer details response:', result);
        showNotification('Customer data is unavailable', 'error');
        return;
      }

      // Ensure customer has required properties with defaults
      const safeCustomer = {
        customer: {
          id: data.customer.id || id,
          name: data.customer.name || 'Unknown Customer',
          email: data.customer.email || '',
          phone: data.customer.phone || '',
          company: data.customer.company || '',
          city: data.customer.city || '',
          province: data.customer.province || '',
          address: data.customer.address || '',
          postal_code: data.customer.postal_code || '',
          notes: data.customer.notes || '',
          lifetime_value_cents: data.customer.lifetime_value_cents || 0,
          average_quote_value_cents: data.customer.average_quote_value_cents || 0,
          total_quotes: data.customer.total_quotes || 0,
          total_won_quotes: data.customer.total_won_quotes || 0,
          total_lost_quotes: data.customer.total_lost_quotes || 0,
          win_rate: data.customer.win_rate || 0,
          marketplace_orders_count: data.customer.marketplace_orders_count || 0,
          marketplace_revenue_cents: data.customer.marketplace_revenue_cents || 0,
          first_quote_date: data.customer.first_quote_date,
          last_quote_date: data.customer.last_quote_date,
          ...data.customer
        },
        stats: {
          total_quotes: parseInt(data.stats?.total_quotes) || 0,
          total_spent: parseInt(data.stats?.total_spent) || 0,
          average_order: data.stats?.average_order || 0,
          last_quote_date: data.stats?.last_quote_date,
          ...data.stats
        },
        quotes: data.quotes || []
      };

      setSelectedCustomer(safeCustomer);

      // Fetch CLV data for this customer
      fetchClvData(id);
    } catch (error) {
      logger.error('Error fetching customer details:', error);
      showNotification('Failed to fetch customer details', 'error');
    } finally {
      setLoadingCustomerId(null);
    }
  };

  // Fetch Customer Lifetime Value data
  const fetchClvData = async (customerId) => {
    if (!customerId) return;

    try {
      setLoadingClv(true);
      const response = await fetch(`${API_BASE}/customers/${customerId}/lifetime-value`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success && result.data) {
        setClvData(result.data);
      } else {
        setClvData(null);
      }
    } catch (error) {
      logger.error('Error fetching CLV data:', error);
      setClvData(null);
    } finally {
      setLoadingClv(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value
    });

    // When province changes, fetch cities for that province
    if (name === 'province' && value) {
      fetchCitiesForProvince(value);
    }
  };

  // Fetch cities for a specific province
  const fetchCitiesForProvince = async (provinceCode) => {
    try {
      const response = await fetch(`${API_BASE}/cities/${provinceCode}`);
      const data = await response.json();

      if (data.success) {
        setAvailableCities(data.cities || []);
      }
    } catch (error) {
      logger.error('Error fetching cities:', error);
      setAvailableCities([]);
    }
  };

  // Lookup postal code and auto-fill address
  const handlePostalCodeLookup = async (postalCode) => {
    if (!postalCode || postalCode.length < 6) return;

    setLoadingPostalCode(true);
    try {
      const response = await fetch(`${API_BASE}/postal-code/${postalCode.replace(/\s+/g, '')}`);
      const data = await response.json();

      if (data.success && data.address) {
        const address = data.address;

        // Extract street address - handle both string and object cases
        const streetAddress = typeof address.street === 'string' && address.street.trim()
          ? address.street.trim()
          : '';

        // Auto-fill address, city and province
        setFormData(prev => ({
          ...prev,
          address: streetAddress || prev.address,
          city: address.city || prev.city,
          province: address.provinceCode || prev.province,
          postal_code: address.postalCode || postalCode
        }));

        // Fetch cities for the province
        if (address.provinceCode) {
          await fetchCitiesForProvince(address.provinceCode);
        }

        // Show success notification
        if (data.fallback) {
          showNotification('Basic region info loaded. Please verify city and address.', 'success');
        } else {
          const fieldsLoaded = [];
          if (streetAddress) fieldsLoaded.push('address');
          if (address.city) fieldsLoaded.push('city');
          if (address.provinceCode) fieldsLoaded.push('province');

          showNotification(`Auto-filled: ${fieldsLoaded.join(', ')}!`, 'success');
        }
      }
    } catch (error) {
      logger.error('Error looking up postal code:', error);
      showNotification('Could not lookup postal code', 'error');
    } finally {
      setLoadingPostalCode(false);
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      name: '',
      email: '',
      phone: '',
      company: '',
      address: '',
      city: '',
      province: '',
      postal_code: '',
      notes: ''
    });
    setFormErrors({});
    setTouched({});
    setAvailableCities([]);
    setShowAddForm(false);
    setEditingCustomer(null);
    // Reset new form enhancement state
    setNoEmail(false);
    setNoCompany(false);
    setDuplicateWarning(null);
    setPotentialDuplicates([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form before submitting
    if (!validateForm()) {
      // Mark all fields as touched to show errors
      const allTouched = Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {});
      setTouched(allTouched);
      showNotification('Please fix the form errors before submitting', 'error');
      return;
    }

    try {
      // Validate editingCustomer state
      if (editingCustomer && !editingCustomer.id) {
        logger.error('❌ editingCustomer has no ID:', editingCustomer);
        showNotification('Error: Customer ID is missing', 'error');
        return;
      }

      const url = editingCustomer
        ? `${API_BASE}/customers/${editingCustomer.id}`
        : `${API_BASE}/customers`;

      const method = editingCustomer ? 'PUT' : 'POST';

      // Prepare data - combine first/last name and handle checkboxes
      const submitData = {
        ...formData,
        // Combine firstName and lastName into name field
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: noEmail ? null : formData.email,
        company: noCompany ? null : formData.company
      };
      // Remove firstName/lastName from submitData as backend expects 'name'
      delete submitData.firstName;
      delete submitData.lastName;

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        const responseData = await response.json();

        showNotification(
          editingCustomer ? 'Customer updated successfully!' : 'Customer added successfully!',
          'success'
        );
        resetForm();
        // Invalidate customer cache so other components get fresh data
        invalidateCache('/api/customers');
        await fetchCustomers();
        await fetchStats();
      } else {
        const errorData = await response.json().catch(() => ({}));
        logger.error('❌ Error response:', errorData);

        // Check for duplicate email error
        let errorMessage = errorData.error || `Error ${editingCustomer ? 'updating' : 'creating'} customer`;
        if (errorData.details && errorData.details.includes('duplicate key') && errorData.details.includes('email')) {
          errorMessage = 'This email address is already in use by another customer. Please use a different email.';
        }

        showNotification(errorMessage, 'error');
      }
    } catch (error) {
      logger.error('❌ Exception caught:', error);
      logger.error('❌ Error name:', error.name);
      logger.error('❌ Error message:', error.message);
      logger.error('❌ Error stack:', error.stack);
      showNotification(`Error saving customer: ${error.message}`, 'error');
    }
  };

  const handleEdit = (customer) => {
    // Validate customer object
    if (!customer || !customer.id) {
      showNotification('Cannot edit: Invalid customer data', 'error');
      return;
    }

    // Split existing name into firstName and lastName
    const nameParts = (customer.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    setEditingCustomer(customer);
    setFormData({
      firstName,
      lastName,
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      address: customer.address || '',
      city: customer.city || '',
      province: customer.province || '',
      postal_code: customer.postal_code || '',
      notes: customer.notes || ''
    });

    // Set noEmail if customer has no email
    setNoEmail(!customer.email);

    // Set noCompany if customer has no company
    setNoCompany(!customer.company);

    // Load cities for the customer's province
    if (customer.province) {
      fetchCitiesForProvince(customer.province);
    }

    setShowAddForm(true);
    setSelectedCustomer(null);
  };

  const handleDelete = async (id) => {
    // Use custom confirm dialog instead of window.confirm
    const confirmed = await confirm({
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone and will remove all associated data.',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/customers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        showNotification('Customer deleted successfully', 'success');
        setSelectedCustomer(null);
        // Invalidate customer cache so other components get fresh data
        invalidateCache('/api/customers');
        // Refetch customers and stats after deletion
        await fetchCustomers();
        await fetchStats();
      } else {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Delete failed:', errorData);
        showNotification(errorData.error || 'Error deleting customer', 'error');
      }
    } catch (error) {
      logger.error('Error deleting customer:', error);
      showNotification(`Error deleting customer: ${error.message}`, 'error');
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setCurrentPage(1);
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const refreshData = () => {
    fetchCustomers();
    fetchStats();
    showNotification('Data refreshed', 'success');
  };

  const formatCurrency = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Confirm Dialog */}
      <DialogComponent />

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              👥 Customers
            </h1>
            <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
              Manage your customer database and view insights
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={refreshData}
              disabled={loading}
              style={{ padding: '14px 20px', background: 'white', color: '#667eea', border: '2px solid #667eea', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{ padding: '14px 28px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
            >
              {showAddForm ? '❌ Cancel' : '➕ Add Customer'}
            </button>
          </div>
        </div>

        {/* Statistics Dashboard */}
        {stats && stats.overview && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #667eea' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Customers</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.overview.total_customers || 0}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>New This Month</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.overview.new_this_month || 0}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>New This Week</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.overview.new_this_week || 0}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Showing</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{customers.length}</div>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '30px', marginBottom: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            <form onSubmit={handleSubmit}>
              {/* Duplicate Warning Banner */}
              {duplicateWarning && (
                <div style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '20px' }}>!</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', color: '#92400e' }}>{duplicateWarning}</div>
                    {potentialDuplicates.length > 0 && (
                      <div style={{ fontSize: '13px', color: '#b45309', marginTop: '4px' }}>
                        {potentialDuplicates[0].email && `Email: ${potentialDuplicates[0].email}`}
                        {potentialDuplicates[0].phone && ` | Phone: ${potentialDuplicates[0].phone}`}
                        {potentialDuplicates[0].company && ` | Company: ${potentialDuplicates[0].company}`}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDuplicateWarning(null); setPotentialDuplicates([]); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#92400e' }}
                  >
                    X
                  </button>
                </div>
              )}

              {/* Row 1: First Name and Last Name with Quick Pick buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {/* First Name with Fuzzy Autocomplete and Quick Pick */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      First Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <AutocompleteInput
                        value={formData.firstName}
                        onChange={(val) => {
                          setFormData(prev => ({
                            ...prev,
                            firstName: val,
                            name: `${val} ${prev.lastName}`.trim()
                          }));
                          if (val.length < 2) {
                            setDuplicateWarning(null);
                            setPotentialDuplicates([]);
                          }
                        }}
                        onSelect={handleFirstNameSelect}
                        fetchSuggestions={fetchFirstNameSuggestions}
                        placeholder="First name..."
                        minChars={1}
                        renderSuggestion={(item) => (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{item.label}</span>
                            {item.sublabel && (
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>{item.sublabel}</span>
                            )}
                          </div>
                        )}
                        error={touched.firstName && formErrors.firstName ? formErrors.firstName : null}
                      />
                    </div>
                  </div>
                  {/* Quick Pick First Name Buttons */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {popularFirstNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleQuickPickName(name, 'first')}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          background: formData.firstName === name ? '#667eea' : '#f3f4f6',
                          color: formData.firstName === name ? 'white' : '#374151',
                          border: '1px solid #e5e7eb',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Last Name with Fuzzy Autocomplete and Quick Pick */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Last Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <AutocompleteInput
                        value={formData.lastName}
                        onChange={(val) => {
                          setFormData(prev => ({
                            ...prev,
                            lastName: val,
                            name: `${prev.firstName} ${val}`.trim()
                          }));
                        }}
                        onSelect={handleLastNameSelect}
                        fetchSuggestions={fetchLastNameSuggestions}
                        placeholder="Last name..."
                        minChars={1}
                        renderSuggestion={(item) => (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{item.label}</span>
                            {item.sublabel && (
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>{item.sublabel}</span>
                            )}
                          </div>
                        )}
                        error={touched.lastName && formErrors.lastName ? formErrors.lastName : null}
                      />
                    </div>
                  </div>
                  {/* Quick Pick Last Name Buttons */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {popularLastNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleQuickPickName(name, 'last')}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          background: formData.lastName === name ? '#667eea' : '#f3f4f6',
                          color: formData.lastName === name ? 'white' : '#374151',
                          border: '1px solid #e5e7eb',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Full Name Preview */}
              {(formData.firstName || formData.lastName) && (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ color: '#16a34a', fontSize: '14px' }}>Full Name:</span>
                  <span style={{ fontWeight: '500', color: '#166534' }}>
                    {`${formData.firstName} ${formData.lastName}`.trim() || '...'}
                  </span>
                </div>
              )}

              {/* Row 2: Email (split layout) and Phone (with area code dropdown) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {/* Email Field with Split Layout */}
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Email {!noEmail && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <EmailInput
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    onBlur={() => handleFieldBlur('email')}
                    noEmailChecked={noEmail}
                    onNoEmailChange={handleNoEmailToggle}
                    showNoEmailOption={true}
                    disabled={false}
                    error={touched.email && formErrors.email}
                  />
                  {touched.email && formErrors.email && (
                    <div id="email-error" role="alert" style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                      {formErrors.email}
                    </div>
                  )}
                </div>

                {/* Phone with Area Code Dropdown */}
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Phone</label>
                  <PhoneInput
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    onBlur={() => handleFieldBlur('phone')}
                    error={touched.phone && formErrors.phone}
                  />
                  {touched.phone && formErrors.phone && (
                    <div id="phone-error" role="alert" style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                      {formErrors.phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Company with "No Company" option */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Company</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={noCompany}
                      onChange={handleNoCompanyToggle}
                      style={{ width: '14px', height: '14px', accentColor: '#667eea' }}
                    />
                    Individual (No Company)
                  </label>
                </div>
                {noCompany ? (
                  <div style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: '#f3f4f6',
                    color: '#6b7280',
                    boxSizing: 'border-box'
                  }}>
                    Individual Customer
                  </div>
                ) : (
                  <AutocompleteInput
                    value={formData.company}
                    onChange={(val) => setFormData(prev => ({ ...prev, company: val }))}
                    onSelect={handleCompanySelect}
                    fetchSuggestions={fetchCompanySuggestions}
                    placeholder="Company name..."
                    minChars={2}
                    renderSuggestion={(item) => (
                      <span>{item.label}</span>
                    )}
                  />
                )}
              </div>

              {/* Row 4: Address (full width) */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="123 Main Street"
                  style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Row 3: Postal Code, Province, City */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '16px', marginBottom: '16px' }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Postal Code
                    {loadingPostalCode && <span style={{ marginLeft: '8px', color: '#667eea', fontSize: '12px' }}>Looking up...</span>}
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleInputChange}
                    onBlur={(e) => handlePostalCodeLookup(e.target.value)}
                    placeholder="A1A 1A1"
                    maxLength="7"
                    style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    Enter postal code to auto-fill city and province
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Province</label>
                  <select
                    name="province"
                    value={formData.province}
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', background: 'white' }}
                  >
                    <option value="">Select Province</option>
                    <option value="ON">Ontario</option>
                    <option value="QC">Quebec</option>
                    <option value="BC">British Columbia</option>
                    <option value="AB">Alberta</option>
                    <option value="MB">Manitoba</option>
                    <option value="SK">Saskatchewan</option>
                    <option value="NS">Nova Scotia</option>
                    <option value="NB">New Brunswick</option>
                    <option value="NL">Newfoundland and Labrador</option>
                    <option value="PE">Prince Edward Island</option>
                    <option value="NT">Northwest Territories</option>
                    <option value="YT">Yukon</option>
                    <option value="NU">Nunavut</option>
                  </select>
                </div>
                {/* City Field with Autocomplete */}
                <div style={{ minWidth: 0 }}>
                  <AutocompleteInput
                    label="City"
                    value={formData.city}
                    onChange={(val) => setFormData(prev => ({ ...prev, city: val }))}
                    onSelect={handleCitySelect}
                    fetchSuggestions={fetchCitySuggestions}
                    placeholder="Start typing city name..."
                    minChars={2}
                    allowFreeText={true}
                    renderSuggestion={(city) => (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{city.city_name}</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          {city.province_code}
                          {city.population > 0 && ` (pop: ${city.population.toLocaleString()})`}
                        </span>
                      </div>
                    )}
                    helperText={formData.province ? `Showing cities in ${formData.province}` : 'Type to search all Canadian cities'}
                  />
                </div>
              </div>

              {/* Row 4: Notes (full width) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Additional notes about this customer..."
                  style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {editingCustomer ? '💾 Update Customer' : '➕ Add Customer'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{ padding: '12px 24px', background: 'white', color: '#6b7280', border: '2px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search, Filters, and View Toggle */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr)', gap: '16px', flex: 1, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Search Customers
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search by name, email, company, phone..."
                  style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  City
                </label>
                <input
                  type="text"
                  value={cityFilter}
                  onChange={(e) => { setCityFilter(e.target.value); setCurrentPage(1); }}
                  placeholder="Filter by city..."
                  style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Province
                </label>
                <select
                  value={provinceFilter}
                  onChange={(e) => { setProvinceFilter(e.target.value); setCurrentPage(1); }}
                  style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                >
                  <option value="">All Provinces</option>
                  <option value="ON">Ontario</option>
                  <option value="QC">Quebec</option>
                  <option value="BC">British Columbia</option>
                  <option value="AB">Alberta</option>
                  <option value="MB">Manitoba</option>
                  <option value="SK">Saskatchewan</option>
                  <option value="NS">Nova Scotia</option>
                  <option value="NB">New Brunswick</option>
                </select>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>View:</span>
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '4px' }}>
                <button
                  onClick={() => setViewMode('table')}
                  style={{
                    padding: '8px 14px',
                    background: viewMode === 'table' ? 'white' : 'transparent',
                    color: viewMode === 'table' ? '#667eea' : '#6b7280',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>☰</span> Table
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  style={{
                    padding: '8px 14px',
                    background: viewMode === 'card' ? 'white' : 'transparent',
                    color: viewMode === 'card' ? '#667eea' : '#6b7280',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: viewMode === 'card' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>⊞</span> Cards
                </button>
              </div>
            </div>
          </div>

          {(searchTerm || cityFilter || provinceFilter) && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Filters active:</span>
              <button
                onClick={() => { setSearchTerm(''); setCityFilter(''); setProvinceFilter(''); setCurrentPage(1); }}
                style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
              >
                ✕ Clear All
              </button>
            </div>
          )}
        </div>

        {/* Customers Display */}
        {viewMode === 'card' ? (
          /* Card View */
          <div style={{ marginBottom: '20px' }}>
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={`skeleton-${i}`} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', height: '20px', width: '60%', borderRadius: '4px', marginBottom: '12px' }} />
                    <div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', height: '16px', width: '80%', borderRadius: '4px', marginBottom: '8px' }} />
                    <div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', height: '16px', width: '50%', borderRadius: '4px' }} />
                  </div>
                ))}
              </div>
            ) : customers.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <div style={{ color: '#9ca3af', fontSize: '16px' }}>
                  {searchTerm || cityFilter || provinceFilter ? 'No customers match your filters' : 'No customers yet. Add your first customer!'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {customers.filter(c => c && c.id).map(customer => {
                  // CLV tier determination (if customer has CLV data)
                  const clv = customer.lifetime_value || customer.lifetimeValue || 0;
                  const clvTier = clv >= 50000 ? 'platinum' : clv >= 20000 ? 'gold' : clv >= 5000 ? 'silver' : 'bronze';
                  const tierConfig = {
                    platinum: { color: '#1e293b', bg: '#f1f5f9', icon: '👑', label: 'Platinum' },
                    gold: { color: '#b45309', bg: '#fef3c7', icon: '🥇', label: 'Gold' },
                    silver: { color: '#64748b', bg: '#f1f5f9', icon: '🥈', label: 'Silver' },
                    bronze: { color: '#78716c', bg: '#fef3c7', icon: '🥉', label: 'Bronze' }
                  };
                  const tier = tierConfig[clvTier];

                  return (
                    <div
                      key={customer.id}
                      style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        border: `2px solid ${clv > 0 ? tier.color + '30' : '#e5e7eb'}`,
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      }}
                      onClick={() => fetchCustomerDetails(customer.id)}
                    >
                      {/* Header with name and CLV badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {customer.name || 'Unnamed Customer'}
                          </h3>
                          {customer.company && (
                            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {customer.company}
                            </div>
                          )}
                        </div>
                        {clv > 0 && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            background: tier.bg,
                            color: tier.color,
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '600',
                            flexShrink: 0
                          }}>
                            {tier.icon} {tier.label}
                          </span>
                        )}
                      </div>

                      {/* Contact info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {customer.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                            <span style={{ color: '#9ca3af' }}>✉️</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                            <span style={{ color: '#9ca3af' }}>📞</span>
                            {customer.phone}
                          </div>
                        )}
                        {customer.city && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                            <span style={{ color: '#9ca3af' }}>📍</span>
                            {customer.city}{customer.province ? `, ${customer.province}` : ''}
                          </div>
                        )}
                      </div>

                      {/* CLV value if available */}
                      {clv > 0 && (
                        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Lifetime Value</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(clv * 100)}</div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(customer); }}
                          style={{ flex: 1, padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(customer.id); }}
                          style={{ flex: 1, padding: '8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Table View */
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    onClick={() => handleSort('name')}
                    style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                  >
                    Name {sortBy === 'name' && (sortOrder === 'ASC' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('email')}
                    style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                  >
                    Email {sortBy === 'email' && (sortOrder === 'ASC' ? '↑' : '↓')}
                  </th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Phone</th>
                  <th
                    onClick={() => handleSort('company')}
                    style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                  >
                    Company {sortBy === 'company' && (sortOrder === 'ASC' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('city')}
                    style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                  >
                    City {sortBy === 'city' && (sortOrder === 'ASC' ? '↑' : '↓')}
                  </th>
                  <th style={{ padding: '16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Skeleton loading rows
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '16px' }}><div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', height: '20px', width: '60%', borderRadius: '4px' }} /></td>
                      <td style={{ padding: '16px' }}><div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', height: '20px', width: '80%', borderRadius: '4px' }} /></td>
                      <td style={{ padding: '16px' }}><div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', height: '20px', width: '50%', borderRadius: '4px' }} /></td>
                      <td style={{ padding: '16px' }}><div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', height: '20px', width: '70%', borderRadius: '4px' }} /></td>
                      <td style={{ padding: '16px' }}><div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', height: '20px', width: '40%', borderRadius: '4px' }} /></td>
                      <td style={{ padding: '16px' }}><div style={{ background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', height: '20px', width: '30%', borderRadius: '4px', margin: '0 auto' }} /></td>
                    </tr>
                  ))
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                      <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                      {searchTerm || cityFilter || provinceFilter ? 'No customers match your filters' : 'No customers yet. Add your first customer!'}
                    </td>
                  </tr>
                ) : (
                  customers.filter(c => c && c.id).map(customer => (
                    <tr key={customer.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onDoubleClick={() => fetchCustomerDetails(customer.id)}>
                      <td style={{ padding: '16px', fontWeight: '600', color: '#111827' }}>{customer.name || 'Unnamed Customer'}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.email || '-'}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.phone || '-'}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.company || '-'}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.city || '-'}</td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); fetchCustomerDetails(customer.id); }}
                            disabled={loadingCustomerId === customer.id}
                            style={{
                              padding: '8px 16px',
                              background: loadingCustomerId === customer.id ? '#a78bfa' : '#8b5cf6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              cursor: loadingCustomerId === customer.id ? 'wait' : 'pointer',
                              fontWeight: '500',
                              opacity: loadingCustomerId === customer.id ? 0.7 : 1,
                              minWidth: '65px'
                            }}
                          >
                            {loadingCustomerId === customer.id ? 'Loading...' : 'View'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(customer); }}
                            disabled={loadingCustomerId === customer.id}
                            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(customer.id); }}
                            disabled={loadingCustomerId === customer.id}
                            style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} customers
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '8px 16px', background: currentPage === 1 ? '#e5e7eb' : '#667eea', color: currentPage === 1 ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: '14px', color: '#374151', padding: '0 12px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '8px 16px', background: currentPage === totalPages ? '#e5e7eb' : '#667eea', color: currentPage === totalPages ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next →
                </button>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  style={{ marginLeft: '12px', padding: '8px', border: '2px solid #e5e7eb', borderRadius: '6px', fontSize: '14px' }}
                >
                  <option value="10">10 per page</option>
                  <option value="20">20 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Pagination - shared for both views */}
        {totalPages > 1 && viewMode === 'card' && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} customers
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                style={{ padding: '8px 16px', background: currentPage === 1 ? '#e5e7eb' : '#667eea', color: currentPage === 1 ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '14px', color: '#374151', padding: '0 12px' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '8px 16px', background: currentPage === totalPages ? '#e5e7eb' : '#667eea', color: currentPage === totalPages ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Customer Detail Modal */}
        {selectedCustomer && selectedCustomer.customer && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '12px', maxWidth: '900px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ padding: '30px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
                    {selectedCustomer.customer?.name || 'Customer Details'}
                  </h2>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Customer Details & Quote History</p>
                </div>
                <button
                  onClick={() => { setSelectedCustomer(null); setClvData(null); }}
                  style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
                >
                  ✕ Close
                </button>
              </div>

              <div style={{ padding: '30px' }}>
                {/* Customer Info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>EMAIL</div>
                    <div style={{ fontSize: '14px', color: '#111827', wordBreak: 'break-word' }}>{selectedCustomer?.customer?.email || '-'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>PHONE</div>
                    <div style={{ fontSize: '14px', color: '#111827' }}>{selectedCustomer?.customer?.phone || '-'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>COMPANY</div>
                    <div style={{ fontSize: '14px', color: '#111827', wordBreak: 'break-word' }}>{selectedCustomer?.customer?.company || '-'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>CITY & PROVINCE</div>
                    <div style={{ fontSize: '14px', color: '#111827' }}>
                      {selectedCustomer?.customer?.city && selectedCustomer?.customer?.province
                        ? `${selectedCustomer.customer?.city}, ${selectedCustomer.customer?.province}`
                        : selectedCustomer?.customer?.city || selectedCustomer?.customer?.province || '-'}
                    </div>
                  </div>
                  {selectedCustomer?.customer?.address && (
                    <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>ADDRESS</div>
                      <div style={{ fontSize: '14px', color: '#111827', wordBreak: 'break-word' }}>{selectedCustomer.customer?.address}</div>
                    </div>
                  )}
                  {selectedCustomer?.customer?.notes && (
                    <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>NOTES</div>
                      <div style={{ fontSize: '14px', color: '#111827', background: '#f9fafb', padding: '12px', borderRadius: '6px', wordBreak: 'break-word' }}>
                        {selectedCustomer.customer?.notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Lifetime Value Card - Enhanced with API data */}
                <div style={{
                  background: clvData?.segment === 'platinum' ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' :
                             clvData?.segment === 'gold' ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' :
                             clvData?.segment === 'silver' ? 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' :
                             'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '24px',
                  color: 'white',
                  position: 'relative'
                }}>
                  {loadingClv && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '12px', opacity: 0.8 }}>
                      Loading CLV data...
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Customer Lifetime Value</div>
                      <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
                        ${clvData?.metrics?.lifetimeValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || formatCurrency(selectedCustomer.customer?.lifetime_value_cents || selectedCustomer.stats?.total_spent || 0).replace('$', '')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      {/* Segment Badge */}
                      {clvData?.segment && (
                        <div style={{
                          background: clvData.segment === 'platinum' ? 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' :
                                     clvData.segment === 'gold' ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' :
                                     clvData.segment === 'silver' ? 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)' :
                                     'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                          padding: '8px 16px',
                          borderRadius: '20px',
                          fontSize: '14px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: clvData.segment === 'silver' ? '#374151' : 'white',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}>
                          {clvData.segment === 'platinum' && '💎 '}
                          {clvData.segment === 'gold' && '🥇 '}
                          {clvData.segment === 'silver' && '🥈 '}
                          {clvData.segment === 'bronze' && '🥉 '}
                          {clvData.segment}
                        </div>
                      )}
                      {/* Churn Risk Badge */}
                      {clvData?.engagement?.churnRisk && clvData.engagement.churnRisk !== 'unknown' && (
                        <div style={{
                          background: clvData.engagement.churnRisk === 'high' ? '#ef4444' :
                                     clvData.engagement.churnRisk === 'medium' ? '#f59e0b' : '#22c55e',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {clvData.engagement.churnRisk === 'high' && '⚠️'}
                          {clvData.engagement.churnRisk === 'medium' && '⏳'}
                          {clvData.engagement.churnRisk === 'low' && '✓'}
                          {clvData.engagement.churnRisk.charAt(0).toUpperCase() + clvData.engagement.churnRisk.slice(1)} Churn Risk
                        </div>
                      )}
                      {/* Win Rate */}
                      <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {clvData?.metrics?.conversionRate?.toFixed(0) || selectedCustomer.customer?.win_rate || 0}% Conversion Rate
                      </div>
                    </div>
                  </div>

                  {/* CLV Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px', textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{clvData?.quoteStats?.totalQuotes || selectedCustomer.customer?.total_quotes || selectedCustomer.stats?.total_quotes || 0}</div>
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>Total Quotes</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px', textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#86efac' }}>{clvData?.quoteStats?.convertedQuotes || selectedCustomer.customer?.total_won_quotes || 0}</div>
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>Converted</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px', textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>${clvData?.metrics?.averageOrderValue?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}</div>
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>Avg Order</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px', textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{clvData?.metrics?.totalTransactions || 0}</div>
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>Transactions</div>
                    </div>
                  </div>

                  {/* Advanced CLV Metrics */}
                  {clvData && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '16px' }}>
                      <div style={{ textAlign: 'center', minWidth: 0 }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>${clvData.metrics?.predictedAnnualValue?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>Predicted Annual</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 0 }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{clvData.metrics?.purchaseFrequency?.toFixed(2) || '0'}/mo</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>Purchase Freq</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 0 }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{clvData.tenureMonths || 0} mo</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>Tenure</div>
                      </div>
                    </div>
                  )}

                  {/* Last Activity Info */}
                  {clvData?.engagement?.daysSinceLastActivity !== null && clvData?.engagement?.daysSinceLastActivity !== undefined && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '13px', opacity: 0.9 }}>Last Activity</span>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>
                        {clvData.engagement.daysSinceLastActivity === 0 ? 'Today' :
                         clvData.engagement.daysSinceLastActivity === 1 ? 'Yesterday' :
                         `${clvData.engagement.daysSinceLastActivity} days ago`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Customer Statistics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '16px', textAlign: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>{selectedCustomer.stats?.total_quotes}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Total Quotes</div>
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', textAlign: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#16a34a' }}>{formatCurrency(selectedCustomer.stats?.total_spent)}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Won Revenue</div>
                  </div>
                  <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px', textAlign: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>{selectedCustomer.customer?.marketplace_orders_count || 0}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Marketplace Orders</div>
                  </div>
                  <div style={{ background: '#fef9c3', borderRadius: '8px', padding: '16px', textAlign: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#854d0e' }}>{formatCurrency(selectedCustomer.customer?.marketplace_revenue_cents || 0)}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Marketplace Revenue</div>
                  </div>
                </div>

                {/* Customer Timeline */}
                {(selectedCustomer.customer?.first_quote_date || selectedCustomer.customer?.last_quote_date) && (
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '24px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>First Quote</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                          {formatDate(selectedCustomer.customer?.first_quote_date)}
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: '1 1 50px', minWidth: '50px', borderTop: '2px dashed #d1d5db' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Last Quote</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                          {formatDate(selectedCustomer.customer?.last_quote_date)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Combined Revenue Summary */}
                {(selectedCustomer.customer?.marketplace_orders_count > 0 || selectedCustomer.stats?.total_quotes > 0) && (
                  <div style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    color: 'white',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px'
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', opacity: 0.9 }}>Combined Total Revenue</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                        {formatCurrency((selectedCustomer.stats?.total_spent || 0) + (selectedCustomer.customer?.marketplace_revenue_cents || 0))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 0 }}>
                      <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Orders</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                        {(selectedCustomer.stats?.total_quotes || 0) + (selectedCustomer.customer?.marketplace_orders_count || 0)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Unified Order History - Quotes + Marketplace Orders */}
                <CustomerOrderHistory
                  customerId={selectedCustomer.customer?.id}
                  customerEmail={selectedCustomer.customer?.email}
                  onCreateQuote={(order) => {
                    // Handle creating quote from marketplace order
                    console.log('Create quote from order:', order);
                    showNotification('Quote creation from marketplace order coming soon!', 'success');
                  }}
                />

                {/* Customer Credit & Payment Tracking */}
                <CustomerCreditTracking
                  customer={selectedCustomer.customer}
                  onUpdate={fetchCustomers}
                />

                <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => { handleEdit(selectedCustomer.customer); setSelectedCustomer(null); }}
                    style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', flex: 1 }}
                  >
                    ✏️ Edit Customer
                  </button>
                  <button
                    onClick={() => { handleDelete(selectedCustomer.customer?.id); }}
                    style={{ padding: '12px 24px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    🗑️ Delete Customer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default CustomerManagement;
