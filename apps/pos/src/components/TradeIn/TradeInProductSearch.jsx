/**
 * TeleTime POS - Trade-In Product Search Component
 * Step 1: Search and select product for trade-in
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Collapse,
  Grid,
  Divider,
  Fade,
} from '@mui/material';
import {
  Search as SearchIcon,
  Smartphone as PhoneIcon,
  Tv as TvIcon,
  Laptop as LaptopIcon,
  Tablet as TabletIcon,
  Devices as DevicesIcon,
  Watch as WatchIcon,
  Headphones as AudioIcon,
  SportsEsports as GamingIcon,
  CheckCircle as CheckCircleIcon,
  Edit as EditIcon,
  TrendingUp as ValueIcon,
} from '@mui/icons-material';
import { useDebounce } from '../../hooks/useDebounce';

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_ICONS = {
  'Smartphones': PhoneIcon,
  'Phones': PhoneIcon,
  'Cell Phones': PhoneIcon,
  'TVs': TvIcon,
  'Televisions': TvIcon,
  'Laptops': LaptopIcon,
  'Computers': LaptopIcon,
  'Tablets': TabletIcon,
  'iPads': TabletIcon,
  'Smartwatches': WatchIcon,
  'Wearables': WatchIcon,
  'Audio': AudioIcon,
  'Headphones': AudioIcon,
  'Gaming': GamingIcon,
  'Consoles': GamingIcon,
  'default': DevicesIcon,
};

const API_BASE = '/api/trade-in';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TradeInProductSearch({
  categories = [],
  onProductSelect,
  onManualEntry,
  selectedProduct,
  isManualEntry,
  manualProduct,
  onManualProductChange,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showManualForm, setShowManualForm] = useState(isManualEntry);

  const searchInputRef = useRef(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Search products when query or category changes
  useEffect(() => {
    if (debouncedSearch || selectedCategory) {
      searchProducts();
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearch, selectedCategory]);

  // Sync manual entry state
  useEffect(() => {
    setShowManualForm(isManualEntry);
  }, [isManualEntry]);

  const searchProducts = async () => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('q', debouncedSearch);
      if (selectedCategory) params.append('categoryId', selectedCategory);
      params.append('limit', '20');

      const response = await fetch(`${API_BASE}/products/search?${params}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setSearchResults(data.products || []);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const getCategoryIcon = (categoryName) => {
    const Icon = CATEGORY_ICONS[categoryName] || CATEGORY_ICONS.default;
    return <Icon />;
  };

  const handleCategoryFilter = (categoryId) => {
    setSelectedCategory(categoryId === selectedCategory ? null : categoryId);
  };

  const handleProductClick = (product) => {
    setShowManualForm(false);
    onProductSelect(product);
  };

  const handleManualEntryClick = () => {
    setShowManualForm(true);
    onManualEntry();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Box>
      {/* Search Input */}
      <TextField
        ref={searchInputRef}
        fullWidth
        placeholder="Search by brand, model, or description..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon color="action" />
            </InputAdornment>
          ),
          endAdornment: searchLoading && (
            <InputAdornment position="end">
              <CircularProgress size={20} />
            </InputAdornment>
          ),
          sx: {
            fontSize: '1.1rem',
            py: 0.5,
          },
        }}
        sx={{ mb: 2 }}
        autoFocus
      />

      {/* Category Quick Filters */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          flexWrap: 'wrap',
          '& .MuiChip-root': {
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: 2,
            },
          },
        }}
      >
        {categories.map((category) => (
          <Chip
            key={category.id}
            icon={getCategoryIcon(category.name)}
            label={category.name}
            onClick={() => handleCategoryFilter(category.id)}
            color={selectedCategory === category.id ? 'primary' : 'default'}
            variant={selectedCategory === category.id ? 'filled' : 'outlined'}
            sx={{
              px: 1,
              py: 2.5,
              fontSize: '0.95rem',
              fontWeight: selectedCategory === category.id ? 600 : 400,
            }}
          />
        ))}
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Search Results */}
      <Box sx={{ maxHeight: 300, overflow: 'auto', mb: 2 }}>
        {searchResults.length > 0 ? (
          <List disablePadding>
            {searchResults.map((product) => {
              const isSelected = selectedProduct?.id === product.id && !showManualForm;

              return (
                <ListItem
                  key={product.id}
                  component={Paper}
                  elevation={isSelected ? 4 : 1}
                  sx={{
                    mb: 1,
                    borderRadius: 2,
                    border: isSelected ? '3px solid' : '2px solid transparent',
                    borderColor: isSelected ? 'primary.main' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    p: 1.5,
                    '&:hover': {
                      elevation: 3,
                      bgcolor: 'action.hover',
                      borderColor: 'primary.light',
                    },
                    '&:active': {
                      transform: 'scale(0.98)',
                    },
                  }}
                  onClick={() => handleProductClick(product)}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      mr: 2,
                      p: 1,
                      borderRadius: 1,
                      bgcolor: isSelected ? 'primary.main' : 'grey.100',
                      color: isSelected ? 'white' : 'text.secondary',
                    }}
                  >
                    {getCategoryIcon(product.category_name)}
                  </Box>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {product.brand} {product.model}
                        </Typography>
                        {product.variant && (
                          <Chip
                            label={product.variant}
                            size="small"
                            sx={{ height: 22, fontSize: '0.75rem' }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          {product.category_name}
                          {product.release_year && ` • ${product.release_year}`}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <ValueIcon sx={{ fontSize: 16, color: 'success.main' }} />
                          <Typography variant="body2" color="success.main" fontWeight={700}>
                            Up to {formatCurrency(product.base_value)}
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  {isSelected && (
                    <ListItemSecondaryAction>
                      <CheckCircleIcon color="primary" sx={{ fontSize: 28 }} />
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}
          </List>
        ) : searchQuery || selectedCategory ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <DevicesIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">
              No products found matching your search
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Try a different search or use manual entry below
            </Typography>
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <SearchIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">
              Search for a product or select a category
            </Typography>
          </Box>
        )}
      </Box>

      {/* Manual Entry Option */}
      <Divider sx={{ my: 2 }}>
        <Chip label="OR" size="small" />
      </Divider>

      <Button
        fullWidth
        variant={showManualForm ? 'contained' : 'outlined'}
        color={showManualForm ? 'secondary' : 'inherit'}
        startIcon={<EditIcon />}
        onClick={handleManualEntryClick}
        sx={{
          py: 1.5,
          fontSize: '1rem',
          borderWidth: 2,
          '&:hover': { borderWidth: 2 },
        }}
      >
        Item Not Listed - Enter Manually
      </Button>

      {/* Manual Entry Form */}
      <Collapse in={showManualForm}>
        <Paper
          elevation={3}
          sx={{
            p: 2.5,
            mt: 2,
            bgcolor: 'secondary.50',
            border: '2px solid',
            borderColor: 'secondary.main',
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} gutterBottom color="secondary.main">
            Manual Product Entry
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Brand"
                value={manualProduct.brand}
                onChange={(e) => onManualProductChange({ ...manualProduct, brand: e.target.value })}
                required
                placeholder="e.g., Apple, Samsung"
                sx={{ bgcolor: 'white' }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Model"
                value={manualProduct.model}
                onChange={(e) => onManualProductChange({ ...manualProduct, model: e.target.value })}
                required
                placeholder="e.g., iPhone 14, Galaxy S23"
                sx={{ bgcolor: 'white' }}
              />
            </Grid>
            <Grid item xs={8}>
              <TextField
                fullWidth
                label="Description / Variant"
                value={manualProduct.description}
                onChange={(e) => onManualProductChange({ ...manualProduct, description: e.target.value })}
                placeholder="e.g., 256GB, Space Gray, Pro Max"
                sx={{ bgcolor: 'white' }}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Estimated Value"
                value={manualProduct.estimatedValue}
                onChange={(e) => onManualProductChange({ ...manualProduct, estimatedValue: e.target.value })}
                type="number"
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                placeholder="0.00"
                sx={{ bgcolor: 'white' }}
              />
            </Grid>
          </Grid>
        </Paper>
      </Collapse>
    </Box>
  );
}

export default TradeInProductSearch;
