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
