/**
 * Email Components Index
 * Batch email and receipt email components
 */

// Main modal (combined flow)
export { default as BatchReceiptEmailModal } from './BatchReceiptEmailModal';

// Individual step components
export { default as BatchEmailPreviewModal } from './BatchEmailPreviewModal';
export { default as BatchEmailProgress, useBatchEmailProgress } from './BatchEmailProgress';
export { default as BatchEmailResults } from './BatchEmailResults';

// Trigger buttons
export {
  default as EmailReceiptsButton,
  EmailShiftReceiptsButton,
  EmailTodayReceiptsButton,
  EmailSelectedButton,
} from './EmailReceiptsButton';
