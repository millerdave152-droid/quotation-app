import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Paper, InputBase, Chip, Skeleton, Typography, Box,
} from '@mui/material';
import {
  Search, Package, User, FileText, StickyNote, X,
} from 'lucide-react';
import apiClient from '../../services/apiClient';

// ── Constants ────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const MAX_PER_GROUP = 5;
const SKELETON_DELAY_MS = 150;
const KLEONIK_COPPER = '#C8614A';

const ENTITY_META = {
  product:  { label: 'Products',  Icon: Package,    color: '#3b82f6' },
  customer: { label: 'Customers', Icon: User,       color: '#10b981' },
  quotation:{ label: 'Quotes',    Icon: FileText,   color: '#8b5cf6' },
  note:     { label: 'Notes',     Icon: StickyNote,  color: '#f59e0b' },
};

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'products', label: 'Products' },
  { key: 'customers', label: 'Customers' },
  { key: 'quotations', label: 'Quotes' },
  { key: 'customer_notes', label: 'Notes' },
];

const SURFACE_PLACEHOLDERS = {
  pos: 'Search products, customers...',
  quotation: 'Search quotes, accounts, notes...',
  backoffice: 'Search anything...',
};

const ENTITY_ROUTES = {
  product: (r) => `/products/${r.id}`,
  customer: (r) => `/customers/${r.id}`,
  quotation: (r) => `/quotes/${r.id}`,
  note: (r) => `/customers/${r.customer_id}`,
};

// ── Helpers ──────────────────────────────────────────────────────

function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function getTitle(result) {
  switch (result.entity_type) {
    case 'product': return result.name || result.sku || 'Unnamed product';
    case 'customer': return result.name || 'Unnamed customer';
    case 'quotation': return result.quote_number || `Quote #${result.id}`;
    case 'note': return result.customer_name || 'Customer note';
    default: return String(result.id);
  }
}

function getSubtitle(result) {
  switch (result.entity_type) {
    case 'product': return [result.sku, result.manufacturer, result.category].filter(Boolean).join(' · ');
    case 'customer': return [result.email, result.phone, result.company].filter(Boolean).join(' · ');
    case 'quotation': return [result.customer_name, result.status].filter(Boolean).join(' · ');
    case 'note': return result.content;
    default: return '';
  }
}

// ── Component ────────────────────────────────────────────────────

export default function UniversalSearch({
  surface = 'quotation',
  onSelect,
  placeholder,
  defaultEntities,
  showEntityFilter = true,
  autoFocus = false,
}) {
  const navigate = useNavigate();

  // State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Refs
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const skeletonTimerRef = useRef(null);
  const abortRef = useRef(null);

  // ── Search API call ──────────────────────────────────────────

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < MIN_CHARS) {
      setResults([]);
      setIsLoading(false);
      setShowSkeleton(false);
      setError(null);
      return;
    }

    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    // Delayed skeleton
    skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);

    try {
      const body = {
        query: q,
        surface,
        limit: 20,
      };
      if (defaultEntities && defaultEntities.length) {
        body.entities = defaultEntities;
      }

      const res = await apiClient.post('/api/search', body, {
        signal: controller.signal,
      });

      setResults(res.data?.data?.results || []);
      setSelectedIndex(0);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        console.error('[UniversalSearch] Error:', err.message || err, err.response?.status, err.response?.data);
        setError('Search unavailable');
        setResults([]);
      }
    } finally {
      clearTimeout(skeletonTimerRef.current);
      setIsLoading(false);
      setShowSkeleton(false);
    }
  }, [surface, defaultEntities]);

  // ── Debounced input ──────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length >= MIN_CHARS) {
      setIsOpen(true);
      debounceRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    } else {
      setResults([]);
      setError(null);
      if (!query) setIsOpen(false);
    }

    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(skeletonTimerRef.current);
    };
  }, [query, doSearch]);

  // ── Click outside ────────────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Filtered results ─────────────────────────────────────────

  const filteredResults = useMemo(() => {
    if (selectedEntity === 'all') return results;
    const ENTITY_KEY_TO_TYPE = {
      products: 'product',
      customers: 'customer',
      quotations: 'quotation',
      customer_notes: 'note',
    };
    const type = ENTITY_KEY_TO_TYPE[selectedEntity];
    return results.filter(r => r.entity_type === type);
  }, [results, selectedEntity]);

  // Group by entity_type
  const grouped = useMemo(() => {
    const groups = {};
    for (const r of filteredResults) {
      const type = r.entity_type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    }
    return groups;
  }, [filteredResults]);

  // Flat list for keyboard nav (capped per group)
  const flatList = useMemo(() => {
    const flat = [];
    for (const type of Object.keys(ENTITY_META)) {
      if (grouped[type]) {
        flat.push(...grouped[type].slice(0, MAX_PER_GROUP));
      }
    }
    return flat;
  }, [grouped]);

  const totalCount = filteredResults.length;
  const shownCount = flatList.length;

  // ── Selection handler ────────────────────────────────────────

  const handleSelect = useCallback((result) => {
    setQuery('');
    setResults([]);
    setIsOpen(false);

    if (onSelect) {
      onSelect(result);
    } else {
      const routeFn = ENTITY_ROUTES[result.entity_type];
      if (routeFn) navigate(routeFn(result));
    }
  }, [onSelect, navigate]);

  // ── Keyboard nav ─────────────────────────────────────────────

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setQuery('');
      setResults([]);
      setError(null);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || flatList.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) handleSelect(flatList[selectedIndex]);
        break;
      default:
        break;
    }
  }, [isOpen, flatList, selectedIndex, handleSelect]);

  // Scroll selected into view
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Render ────────────────────────────────────────────────────

  const hasQuery = query.length >= MIN_CHARS;
  const showEmpty = hasQuery && !isLoading && !error && filteredResults.length === 0;
  const showResults = isOpen && hasQuery;

  let flatIdx = 0; // running counter for data-idx

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: '0 1 520px', maxWidth: 520 }}>
      {/* ── Search input bar ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#f3f4f6',
          borderRadius: 10,
          border: isOpen ? `1.5px solid ${KLEONIK_COPPER}` : '1px solid #e5e7eb',
          padding: '0 12px',
          transition: 'border 0.15s',
        }}
      >
        <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
        <InputBase
          inputRef={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.length >= MIN_CHARS) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder || SURFACE_PLACEHOLDERS[surface] || 'Search...'}
          sx={{ flex: 1, ml: 1, py: '9px', fontSize: 14 }}
          inputProps={{ 'aria-label': 'Universal search' }}
        />
        {query && (
          <Box
            component="button"
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            sx={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', p: 0.5,
              color: '#9ca3af', '&:hover': { color: '#6b7280' },
            }}
          >
            <X size={16} />
          </Box>
        )}
        <Typography variant="caption" sx={{ color: '#9ca3af', ml: 1, whiteSpace: 'nowrap', userSelect: 'none' }}>
          Ctrl+K
        </Typography>
      </div>

      {/* ── Dropdown ─────────────────────────────────────────── */}
      {showResults && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 0.5,
            zIndex: 1300,
            borderRadius: '12px',
            overflow: 'hidden',
            maxHeight: 480,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Entity filter chips */}
          {showEntityFilter && (
            <Box sx={{
              display: 'flex', gap: 0.5, p: '10px 12px',
              borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap',
              bgcolor: '#fafafa',
            }}>
              {FILTER_CHIPS.map(chip => (
                <Chip
                  key={chip.key}
                  label={chip.label}
                  size="small"
                  onClick={() => { setSelectedEntity(chip.key); setSelectedIndex(0); }}
                  sx={{
                    fontWeight: 600,
                    fontSize: 12,
                    bgcolor: selectedEntity === chip.key ? KLEONIK_COPPER : '#f3f4f6',
                    color: selectedEntity === chip.key ? '#fff' : '#6b7280',
                    '&:hover': {
                      bgcolor: selectedEntity === chip.key ? KLEONIK_COPPER : '#e5e7eb',
                    },
                  }}
                />
              ))}
            </Box>
          )}

          {/* Results list */}
          <Box sx={{ overflowY: 'auto', maxHeight: 380, p: 0.5 }}>
            {/* Loading skeleton */}
            {showSkeleton && isLoading && (
              <Box sx={{ p: 1 }}>
                {[0, 1, 2].map(i => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.5, p: 1.5, alignItems: 'center' }}>
                    <Skeleton variant="circular" width={32} height={32} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton width="60%" height={18} />
                      <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {/* Error */}
            {error && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="error">{error}</Typography>
              </Box>
            )}

            {/* Empty state */}
            {showEmpty && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No results for '{query}'
                </Typography>
              </Box>
            )}

            {/* Grouped results */}
            {!isLoading && !error && Object.keys(grouped).map(type => {
              const meta = ENTITY_META[type];
              if (!meta) return null;
              const items = grouped[type].slice(0, MAX_PER_GROUP);

              return (
                <Box key={type} sx={{ mb: 0.5 }}>
                  {/* Group header */}
                  <Typography
                    variant="overline"
                    sx={{ px: 1.5, pt: 1, pb: 0.25, display: 'block', color: '#9ca3af', letterSpacing: 1 }}
                  >
                    {meta.label}
                  </Typography>

                  {items.map((result) => {
                    const idx = flatIdx++;
                    const isSelected = idx === selectedIndex;
                    const Icon = meta.Icon;

                    return (
                      <Box
                        key={`${type}-${result.id}`}
                        data-idx={idx}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 1.5,
                          py: 1,
                          mx: 0.5,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          bgcolor: isSelected ? '#f3f4f6' : 'transparent',
                          '&:hover': { bgcolor: '#f3f4f6' },
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Icon */}
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '8px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: meta.color + '14', flexShrink: 0,
                        }}>
                          <Icon size={16} style={{ color: meta.color }} />
                        </Box>

                        {/* Text */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {getTitle(result)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {truncate(getSubtitle(result))}
                          </Typography>
                        </Box>

                        {/* Score bar */}
                        {result.score != null && (
                          <Box sx={{
                            position: 'absolute', bottom: 0, right: 0,
                            height: 2,
                            width: `${Math.round((result.score || 0) * 100)}%`,
                            bgcolor: meta.color,
                            opacity: 0.4,
                            borderRadius: 1,
                          }} />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}

            {/* Show all link */}
            {totalCount > shownCount && !isLoading && (
              <Box sx={{ p: 1.5, textAlign: 'center', borderTop: '1px solid #f3f4f6' }}>
                <Typography
                  variant="caption"
                  sx={{ color: KLEONIK_COPPER, cursor: 'pointer', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
                >
                  Show all {totalCount} results
                </Typography>
              </Box>
            )}
          </Box>

          {/* Footer shortcuts */}
          <Box sx={{
            display: 'flex', gap: 2, px: 1.5, py: 1,
            borderTop: '1px solid #e5e7eb', bgcolor: '#fafafa',
            fontSize: 11, color: '#9ca3af',
          }}>
            <span><kbd style={{ padding: '1px 4px', background: '#e5e7eb', borderRadius: 3, fontSize: 10 }}>↑↓</kbd> Navigate</span>
            <span><kbd style={{ padding: '1px 4px', background: '#e5e7eb', borderRadius: 3, fontSize: 10 }}>↵</kbd> Select</span>
            <span><kbd style={{ padding: '1px 4px', background: '#e5e7eb', borderRadius: 3, fontSize: 10 }}>Esc</kbd> Close</span>
          </Box>
        </Paper>
      )}
    </div>
  );
}
