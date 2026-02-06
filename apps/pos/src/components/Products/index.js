/**
 * TeleTime POS - Products Components
 * Centralized exports for product browsing components
 */

export { ProductSearch } from './ProductSearch';
export { CategoryBar } from './CategoryBar';
export { ProductGrid } from './ProductGrid';
export { ProductTile } from './ProductTile';
export { BarcodeScanner } from './BarcodeScanner';

// Default export as namespace
import { ProductSearch } from './ProductSearch';
import { CategoryBar } from './CategoryBar';
import { ProductGrid } from './ProductGrid';
import { ProductTile } from './ProductTile';
import { BarcodeScanner } from './BarcodeScanner';

export default {
  ProductSearch,
  CategoryBar,
  ProductGrid,
  ProductTile,
  BarcodeScanner,
};
