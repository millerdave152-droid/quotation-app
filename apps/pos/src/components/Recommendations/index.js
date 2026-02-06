/**
 * TeleTime POS - Recommendation Components
 * Export all recommendation display components
 */

export { ProductSuggestionCard, default as ProductSuggestionCardDefault } from './ProductSuggestionCard';
export { CartSuggestions, default as CartSuggestionsDefault } from './CartSuggestions';
export { PreCheckoutSuggestions, default as PreCheckoutSuggestionsDefault } from './PreCheckoutSuggestions';
export { BundleSuggestion, default as BundleSuggestionDefault } from './BundleSuggestion';
export { ProductDetailSuggestions, default as ProductDetailSuggestionsDefault } from './ProductDetailSuggestions';

// Also export hooks for convenience
export { useSuggestions, useCrossSell, useBundles } from '../../hooks/useSuggestions';
