import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../../api/axios';
import { Box, FileText, MessageCircle, Search, User, X } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const MAX_PER_GROUP = 5;
const SKELETON_DELAY_MS = 150;
const KLEONIK_COPPER = '#C8614A';

const ENTITY_META = {
  product:  { label: 'Products',  Icon: Box,    color: 'text-blue-500', bgColor: 'bg-blue-50', barColor: 'bg-blue-500' },
  customer: { label: 'Customers', Icon: User,     color: 'text-emerald-500', bgColor: 'bg-emerald-50', barColor: 'bg-emerald-500' },
  quotation:{ label: 'Quotes',    Icon: FileText, color: 'text-violet-500', bgColor: 'bg-violet-50', barColor: 'bg-violet-500' },
  note:     { label: 'Notes',     Icon: MessageCircle, color: 'text-amber-500', bgColor: 'bg-amber-50', barColor: 'bg-amber-500' },
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
  surface = 'pos',
  onSelect,
  placeholder,
  defaultEntities,
  showEntityFilter = true,
  autoFocus = false,
}) {
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

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);

    try {
      const body = { query: q, surface, limit: 20 };
      if (defaultEntities && defaultEntities.length) {
        body.entities = defaultEntities;
      }

      const res = await api.post('/search', body, { signal: controller.signal });
      setResults(res.data?.data?.results || []);
      setSelectedIndex(0);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
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

  // ── Filtered + grouped results ───────────────────────────────

  const ENTITY_KEY_TO_TYPE = {
    products: 'product',
    customers: 'customer',
    quotations: 'quotation',
    customer_notes: 'note',
  };

  const filteredResults = useMemo(() => {
    if (selectedEntity === 'all') return results;
    const type = ENTITY_KEY_TO_TYPE[selectedEntity];
    return results.filter(r => r.entity_type === type);
  }, [results, selectedEntity]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const r of filteredResults) {
      const type = r.entity_type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    }
    return groups;
  }, [filteredResults]);

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
    if (onSelect) onSelect(result);
  }, [onSelect]);

  // ── Keyboard nav ─────────────────────────────────────────────

  const handleKeyDown = useCallback((e) => {
    if (!isOpen || flatList.length === 0) {
      if (e.key === 'Escape') { setIsOpen(false); inputRef.current?.blur(); }
      return;
    }

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
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  }, [isOpen, flatList, selectedIndex, handleSelect]);

  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Render ────────────────────────────────────────────────────

  const hasQuery = query.length >= MIN_CHARS;
  const showEmpty = hasQuery && !isLoading && !error && filteredResults.length === 0;
  const showResultsPanel = isOpen && hasQuery;

  let flatIdx = 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      {/* Search input */}
      <div className={`flex items-center gap-2 px-3 rounded-xl border transition-colors ${
        isOpen ? 'border-[#C8614A] bg-card' : 'border-border bg-secondary'
      }`}>
        <Search className="w-4.5 h-4.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.length >= MIN_CHARS) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder || SURFACE_PLACEHOLDERS[surface] || 'Search...'}
          className="flex-1 py-2.5 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Universal search"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showResultsPanel && (
        <div className="absolute top-full left-0 right-0 mt-1 z-dropdown bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[480px]">

          {/* Entity filter chips */}
          {showEntityFilter && (
            <div className="flex gap-1 px-3 py-2.5 border-b border-border bg-secondary/50 flex-wrap">
              {FILTER_CHIPS.map(chip => (
                <button
                  key={chip.key}
                  onClick={() => { setSelectedEntity(chip.key); setSelectedIndex(0); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    selectedEntity === chip.key
                      ? 'text-white'
                      : 'text-muted-foreground bg-secondary hover:bg-secondary/80'
                  }`}
                  style={selectedEntity === chip.key ? { backgroundColor: KLEONIK_COPPER } : {}}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Results list */}
          <div className="overflow-y-auto max-h-[380px] p-0.5">
            {/* Loading skeleton */}
            {showSkeleton && isLoading && (
              <div className="p-2 space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex gap-3 p-3 items-center animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-secondary" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-secondary rounded w-3/5" />
                      <div className="h-3 bg-secondary rounded w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-6 text-center">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            {/* Empty state */}
            {showEmpty && (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No results for '{query}'</p>
              </div>
            )}

            {/* Grouped results */}
            {!isLoading && !error && Object.keys(grouped).map(type => {
              const meta = ENTITY_META[type];
              if (!meta) return null;
              const items = grouped[type].slice(0, MAX_PER_GROUP);
              const Icon = meta.Icon;

              return (
                <div key={type} className="mb-0.5">
                  {/* Group header */}
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </p>

                  {items.map((result) => {
                    const idx = flatIdx++;
                    const isSelected = idx === selectedIndex;

                    return (
                      <div
                        key={`${type}-${result.id}`}
                        data-idx={idx}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-pointer relative overflow-hidden transition-colors ${
                          isSelected ? 'bg-secondary' : 'hover:bg-secondary/50'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bgColor}`}>
                          <Icon className={`w-4 h-4 ${meta.color}`} />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {getTitle(result)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {truncate(getSubtitle(result))}
                          </p>
                        </div>

                        {/* Score bar */}
                        {result.score != null && (
                          <div
                            className={`absolute bottom-0 right-0 h-0.5 ${meta.barColor} opacity-40 rounded`}
                            style={{ width: `${Math.round((result.score || 0) * 100)}%` }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Show all link */}
            {totalCount > shownCount && !isLoading && (
              <div className="p-3 text-center border-t border-border/50">
                <span
                  className="text-xs font-semibold cursor-pointer hover:underline"
                  style={{ color: KLEONIK_COPPER }}
                >
                  Show all {totalCount} results
                </span>
              </div>
            )}
          </div>

          {/* Footer shortcuts */}
          <div className="flex gap-4 px-3 py-1.5 border-t border-border bg-secondary/50 text-[11px] text-muted-foreground">
            <span><kbd className="px-1 bg-secondary border border-border rounded text-[10px]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 bg-secondary border border-border rounded text-[10px]">↵</kbd> Select</span>
            <span><kbd className="px-1 bg-secondary border border-border rounded text-[10px]">Esc</kbd> Close</span>
          </div>
        </div>
      )}
    </div>
  );
}
