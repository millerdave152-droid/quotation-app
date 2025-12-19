import React, { useState, useEffect, useRef } from 'react';
import CustomerCreditTracking from './CustomerCreditTracking';
import CustomerOrderHistory from './CustomerOrderHistory';
import logger from '../utils/logger';
import { useDebounce } from '../utils/useDebounce';
import { cachedFetch, invalidateCache } from '../services/apiCache';
import { useToast } from './ui/Toast';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { SkeletonTable, SkeletonStats } from './ui/LoadingSkeleton';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

function CustomerManagement() {
  // State Management
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [notification, setNotification] = useState(null);

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

  // Form Data
  const [formData, setFormData] = useState({
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

  // Form Validation State
  const [formErrors, setFormErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Validation rules
  const validateField = (name, value) => {
    switch (name) {
      case 'name':
        if (!value || value.trim() === '') return 'Name is required';
        if (value.length < 2) return 'Name must be at least 2 characters';
        return '';
      case 'email':
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
    Object.keys(formData).forEach(field => {
      const error = validateField(field, formData[field]);
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
    try {
      const response = await fetch(`${API_BASE}/customers/${id}`);
      const data = await response.json();
      setSelectedCustomer(data);
    } catch (error) {
      logger.error('Error fetching customer details:', error);
      showNotification('Failed to fetch customer details', 'error');
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

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const responseData = await response.json();

        showNotification(
          editingCustomer ? 'Customer updated successfully!' : 'Customer added successfully!',
          'success'
        );
        resetForm();
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
    setEditingCustomer(customer);
    setFormData({
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
        method: 'DELETE'
      });

      if (response.ok) {
        showNotification('Customer deleted successfully', 'success');
        setSelectedCustomer(null);
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
              {editingCustomer ? '✏️ Edit Customer' : '➕ Add New Customer'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    onBlur={() => handleFieldBlur('name')}
                    aria-invalid={touched.name && formErrors.name ? 'true' : 'false'}
                    aria-describedby={formErrors.name ? 'name-error' : undefined}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${touched.name && formErrors.name ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  {touched.name && formErrors.name && (
                    <div id="name-error" role="alert" style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>✕</span> {formErrors.name}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Email <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    onBlur={() => handleFieldBlur('email')}
                    aria-invalid={touched.email && formErrors.email ? 'true' : 'false'}
                    aria-describedby={formErrors.email ? 'email-error' : undefined}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${touched.email && formErrors.email ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  {touched.email && formErrors.email && (
                    <div id="email-error" role="alert" style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>✕</span> {formErrors.email}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    onBlur={() => handleFieldBlur('phone')}
                    aria-invalid={touched.phone && formErrors.phone ? 'true' : 'false'}
                    aria-describedby={formErrors.phone ? 'phone-error' : undefined}
                    placeholder="(555) 123-4567"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${touched.phone && formErrors.phone ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  {touched.phone && formErrors.phone && (
                    <div id="phone-error" role="alert" style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>✕</span> {formErrors.phone}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Company</label>
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="123 Main Street"
                    style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    📮 Postal Code
                    {loadingPostalCode && <span style={{ marginLeft: '8px', color: '#667eea', fontSize: '12px' }}>⏳ Looking up...</span>}
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleInputChange}
                    onBlur={(e) => handlePostalCodeLookup(e.target.value)}
                    placeholder="A1A 1A1"
                    maxLength="7"
                    style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                  />
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Enter postal code and we'll auto-fill city and province
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Province</label>
                  <select
                    name="province"
                    value={formData.province}
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
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
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    City
                    {availableCities.length > 0 && <span style={{ marginLeft: '8px', color: '#667eea', fontSize: '12px' }}>({availableCities.length} options)</span>}
                  </label>
                  {availableCities.length > 0 ? (
                    <select
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                    >
                      <option value="">Select City</option>
                      {availableCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Toronto"
                      style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                    />
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Additional notes about this customer..."
                    style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', resize: 'vertical' }}
                  />
                </div>
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

        {/* Search and Filters */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                🔍 Search Customers
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name, email, company, phone..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Filter by City
              </label>
              <input
                type="text"
                value={cityFilter}
                onChange={(e) => { setCityFilter(e.target.value); setCurrentPage(1); }}
                placeholder="Enter city..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Filter by Province
              </label>
              <select
                value={provinceFilter}
                onChange={(e) => { setProvinceFilter(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
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
          {(searchTerm || cityFilter || provinceFilter) && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Filters active:</span>
              <button
                onClick={() => { setSearchTerm(''); setCityFilter(''); setProvinceFilter(''); setCurrentPage(1); }}
                style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
              >
                ✕ Clear All Filters
              </button>
            </div>
          )}
        </div>

        {/* Customers Table */}
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
                  customers.map(customer => (
                    <tr key={customer.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onDoubleClick={() => fetchCustomerDetails(customer.id)}>
                      <td style={{ padding: '16px', fontWeight: '600', color: '#111827' }}>{customer.name}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.email}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.phone || '-'}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.company || '-'}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{customer.city || '-'}</td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => fetchCustomerDetails(customer.id)}
                            style={{ padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => handleEdit(customer)}
                            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
                            style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                          >
                            🗑️ Delete
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

        {/* Customer Detail Modal */}
        {selectedCustomer && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '12px', maxWidth: '900px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ padding: '30px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
                    {selectedCustomer.customer.name}
                  </h2>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Customer Details & Quote History</p>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
                >
                  ✕ Close
                </button>
              </div>

              <div style={{ padding: '30px' }}>
                {/* Customer Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>EMAIL</div>
                    <div style={{ fontSize: '14px', color: '#111827' }}>{selectedCustomer?.customer?.email || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>PHONE</div>
                    <div style={{ fontSize: '14px', color: '#111827' }}>{selectedCustomer?.customer?.phone || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>COMPANY</div>
                    <div style={{ fontSize: '14px', color: '#111827' }}>{selectedCustomer?.customer?.company || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>CITY & PROVINCE</div>
                    <div style={{ fontSize: '14px', color: '#111827' }}>
                      {selectedCustomer?.customer?.city && selectedCustomer?.customer?.province
                        ? `${selectedCustomer.customer.city}, ${selectedCustomer.customer.province}`
                        : selectedCustomer?.customer?.city || selectedCustomer?.customer?.province || '-'}
                    </div>
                  </div>
                  {selectedCustomer?.customer?.address && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>ADDRESS</div>
                      <div style={{ fontSize: '14px', color: '#111827' }}>{selectedCustomer.customer.address}</div>
                    </div>
                  )}
                  {selectedCustomer?.customer?.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>NOTES</div>
                      <div style={{ fontSize: '14px', color: '#111827', background: '#f9fafb', padding: '12px', borderRadius: '6px' }}>
                        {selectedCustomer.customer.notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Statistics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '30px' }}>
                  <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>{selectedCustomer.stats.total_quotes}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Total Quotes</div>
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>{formatCurrency(selectedCustomer.stats.total_spent)}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Quote Revenue</div>
                  </div>
                  <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>{selectedCustomer.customer.marketplace_orders_count || 0}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Marketplace Orders</div>
                  </div>
                  <div style={{ background: '#fef9c3', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#854d0e' }}>{formatCurrency(selectedCustomer.customer.marketplace_revenue_cents || 0)}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Marketplace Revenue</div>
                  </div>
                </div>

                {/* Combined Revenue Summary */}
                {(selectedCustomer.customer.marketplace_orders_count > 0 || selectedCustomer.stats.total_quotes > 0) && (
                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '14px', opacity: 0.9 }}>Combined Lifetime Value</div>
                      <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '4px' }}>
                        {formatCurrency((selectedCustomer.stats.total_spent || 0) + (selectedCustomer.customer.marketplace_revenue_cents || 0))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Orders</div>
                      <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '4px' }}>
                        {(selectedCustomer.stats.total_quotes || 0) + (selectedCustomer.customer.marketplace_orders_count || 0)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Unified Order History - Quotes + Marketplace Orders */}
                <CustomerOrderHistory
                  customerId={selectedCustomer.customer.id}
                  customerEmail={selectedCustomer.customer.email}
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
                    onClick={() => { handleDelete(selectedCustomer.customer.id); }}
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
