/**
 * Shared UI Components
 *
 * Usage:
 * import { SkeletonTable, ConfirmDialog, useToast, FormInput } from './components/ui';
 */

// Loading skeletons
export {
  SkeletonText,
  SkeletonCircle,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonTable,
  SkeletonStats,
  SkeletonForm,
  SkeletonProductCard,
  PageLoadingSkeleton,
  ButtonSpinner
} from './LoadingSkeleton';

// Confirmation dialog
export { default as ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

// Toast notifications
export { ToastProvider, useToast, toast, setToastRef } from './Toast';

// Form components
export { default as FormInput, validationPatterns, validateField, useFormValidation } from './FormInput';

// Theme toggle
export { default as ThemeToggle } from './ThemeToggle';

// Command palette
export { default as CommandPalette } from './CommandPalette';

// Global search
export { default as GlobalSearch } from './GlobalSearch';

// Email input with split layout
export { default as EmailInput } from './EmailInput';

// Phone input with area code dropdown
export { default as PhoneInput } from './PhoneInput';

// Autocomplete input
export { default as AutocompleteInput } from './AutocompleteInput';
