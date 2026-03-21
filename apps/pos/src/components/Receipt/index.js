/**
 * TeleTime POS - Receipt Components
 * Centralized exports for receipt components
 */

export { Receipt } from './Receipt';
export { EmailReceipt, generateEmailReceiptHtml, sendEmailReceipt } from './EmailReceipt';
export { PrintReceipt, printReceipt } from './PrintReceipt';
export { ReceiptTemplate } from './ReceiptTemplate';
export { ReceiptPreviewModal } from './ReceiptPreviewModal';
export { RefundReceiptPreviewModal } from './RefundReceiptPreviewModal';
export { ReceiptEmailModal } from './ReceiptEmailModal';

// Default export as namespace
import { Receipt } from './Receipt';
import { EmailReceipt, generateEmailReceiptHtml, sendEmailReceipt } from './EmailReceipt';
import { PrintReceipt, printReceipt } from './PrintReceipt';
import { ReceiptTemplate } from './ReceiptTemplate';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';
import { RefundReceiptPreviewModal } from './RefundReceiptPreviewModal';
import { ReceiptEmailModal } from './ReceiptEmailModal';

export default {
  Receipt,
  EmailReceipt,
  generateEmailReceiptHtml,
  sendEmailReceipt,
  PrintReceipt,
  printReceipt,
  ReceiptTemplate,
  ReceiptPreviewModal,
  RefundReceiptPreviewModal,
  ReceiptEmailModal,
};
