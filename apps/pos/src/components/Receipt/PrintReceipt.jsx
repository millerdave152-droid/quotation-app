/**
 * TeleTime POS - Print Receipt Component
 * Wrapper that handles printing receipts
 */

import { useRef, useCallback, useState } from 'react';
import { PrinterIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Receipt from './Receipt';

/**
 * Print styles for thermal receipt
 */
const PRINT_STYLES = `
  @media print {
    @page {
      size: 80mm auto;
      margin: 0;
    }

    body {
      margin: 0;
      padding: 0;
    }

    body * {
      visibility: hidden;
    }

    .print-receipt-container,
    .print-receipt-container * {
      visibility: visible;
    }

    .print-receipt-container {
      position: absolute;
      left: 0;
      top: 0;
      width: 80mm;
    }

    .no-print {
      display: none !important;
    }
  }
`;

/**
 * Inject print styles into document
 */
function injectPrintStyles() {
  const styleId = 'receipt-print-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = PRINT_STYLES;
    document.head.appendChild(style);
  }
}

/**
 * Print Receipt wrapper component
 * @param {object} props
 * @param {object} props.transaction - Transaction data
 * @param {object} props.storeInfo - Store information
 * @param {boolean} props.showPreview - Show receipt preview
 * @param {boolean} props.autoPrint - Auto-print on mount
 * @param {function} props.onPrintComplete - Callback after print
 * @param {string} props.className - Additional CSS classes
 */
export function PrintReceipt({
  transaction,
  storeInfo,
  showPreview = true,
  autoPrint = false,
  onPrintComplete,
  className = '',
}) {
  const receiptRef = useRef(null);
  const [printStatus, setPrintStatus] = useState(null); // 'printing', 'success', 'error'

  /**
   * Print using window.print()
   */
  const handleBrowserPrint = useCallback(() => {
    injectPrintStyles();
    setPrintStatus('printing');

    // Small delay to ensure styles are applied
    setTimeout(() => {
      try {
        window.print();
        setPrintStatus('success');
        onPrintComplete?.({ success: true, method: 'browser' });
      } catch (error) {
        console.error('[PrintReceipt] Browser print error:', error);
        setPrintStatus('error');
        onPrintComplete?.({ success: false, error: error.message });
      }
    }, 100);
  }, [onPrintComplete]);

  /**
   * Print using iframe (alternative method)
   */
  const handleIframePrint = useCallback(() => {
    if (!receiptRef.current) return;

    setPrintStatus('printing');

    try {
      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Could not access iframe document');
      }

      // Write receipt content to iframe
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: 'Courier New', monospace;
            }
            .receipt {
              width: 80mm;
              padding: 10px;
              font-size: 12px;
            }
          </style>
          <link href="${window.location.origin}/src/index.css" rel="stylesheet">
        </head>
        <body>
          ${receiptRef.current.outerHTML}
        </body>
        </html>
      `);
      iframeDoc.close();

      // Wait for content to load then print
      setTimeout(() => {
        iframe.contentWindow?.print();

        // Cleanup
        setTimeout(() => {
          document.body.removeChild(iframe);
          setPrintStatus('success');
          onPrintComplete?.({ success: true, method: 'iframe' });
        }, 1000);
      }, 250);
    } catch (error) {
      console.error('[PrintReceipt] Iframe print error:', error);
      setPrintStatus('error');
      onPrintComplete?.({ success: false, error: error.message });
    }
  }, [onPrintComplete]);

  /**
   * Print to thermal printer (future integration)
   * This would integrate with libraries like:
   * - escpos
   * - node-thermal-printer
   * - WebUSB API
   */
  const handleThermalPrint = useCallback(async () => {
    setPrintStatus('printing');

    try {
      // Check for WebUSB support
      if (!navigator.usb) {
        throw new Error('WebUSB not supported. Using browser print instead.');
      }

      // TODO: Implement thermal printer integration
      // This would involve:
      // 1. Request USB device access
      // 2. Connect to thermal printer
      // 3. Send ESC/POS commands
      // 4. Print receipt data

      // For now, fall back to browser print
      handleBrowserPrint();
    } catch (error) {
      console.error('[PrintReceipt] Thermal print error:', error);
      // Fall back to browser print
      handleBrowserPrint();
    }
  }, [handleBrowserPrint]);

  /**
   * Main print handler
   */
  const handlePrint = useCallback(() => {
    // Try thermal first, fall back to browser
    handleThermalPrint();
  }, [handleThermalPrint]);

  // Auto-print on mount
  useCallback(() => {
    if (autoPrint && transaction) {
      handlePrint();
    }
  }, [autoPrint, transaction, handlePrint]);

  return (
    <div className={className}>
      {/* Print Button */}
      <div className="no-print mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePrint}
          disabled={printStatus === 'printing'}
          className="
            flex items-center gap-2
            h-12 px-6
            bg-blue-600 hover:bg-blue-700
            disabled:bg-gray-400
            text-white font-medium
            rounded-lg
            transition-colors duration-150
          "
        >
          {printStatus === 'printing' ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Printing...
            </>
          ) : (
            <>
              <PrinterIcon className="w-5 h-5" />
              Print Receipt
            </>
          )}
        </button>

        {/* Status indicator */}
        {printStatus === 'success' && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircleIcon className="w-5 h-5" />
            Printed
          </span>
        )}
        {printStatus === 'error' && (
          <span className="flex items-center gap-1 text-red-600">
            <XCircleIcon className="w-5 h-5" />
            Print failed
          </span>
        )}
      </div>

      {/* Receipt Preview */}
      {showPreview && (
        <div className="print-receipt-container border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <Receipt
            ref={receiptRef}
            transaction={transaction}
            storeInfo={storeInfo}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Utility function to print receipt directly
 * @param {object} transaction - Transaction data
 * @param {object} storeInfo - Store information
 * @returns {Promise<object>} Print result
 */
export async function printReceipt(transaction, storeInfo = {}) {
  return new Promise((resolve) => {
    // Create temporary container
    const container = document.createElement('div');
    container.className = 'print-receipt-container';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    // Render receipt
    const receiptHtml = `
      <div class="receipt" style="width: 80mm; padding: 10px; font-family: 'Courier New', monospace; font-size: 12px;">
        <!-- Receipt content would be rendered here -->
      </div>
    `;
    container.innerHTML = receiptHtml;

    // Inject print styles
    injectPrintStyles();

    // Print
    setTimeout(() => {
      try {
        window.print();
        resolve({ success: true });
      } catch (error) {
        resolve({ success: false, error: error.message });
      } finally {
        // Cleanup
        document.body.removeChild(container);
      }
    }, 100);
  });
}

export default PrintReceipt;
