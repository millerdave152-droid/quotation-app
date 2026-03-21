/**
 * TeleTime POS - Print Receipt Component
 * Wrapper that handles printing receipts
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import Receipt from './Receipt';
import { CheckCircle, Printer, XCircle } from 'lucide-react';

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
          if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
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
   * Print to thermal printer via WebUSB + ESC/POS.
   * Falls back to browser print if WebUSB is unavailable or the user cancels
   * the device picker.
   */
  const handleThermalPrint = useCallback(async () => {
    setPrintStatus('printing');

    try {
      if (!navigator.usb) {
        throw new Error('WebUSB not supported');
      }

      // Request access to a USB receipt printer (common vendor IDs for Epson/Star)
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x04b8 }, // Epson
          { vendorId: 0x0519 }, // Star Micronics
          { vendorId: 0x0dd4 }, // Custom Engineering
        ],
      });

      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      // Build ESC/POS payload
      const encoder = new TextEncoder();
      const ESC = 0x1b;
      const GS = 0x1d;
      const LF = 0x0a;

      const lines = [];
      const push = (text) => lines.push(encoder.encode(text + '\n'));

      // Initialise printer
      lines.push(new Uint8Array([ESC, 0x40]));
      // Center align
      lines.push(new Uint8Array([ESC, 0x61, 0x01]));

      // Store header
      const store = storeInfo || {};
      if (store.name) push(store.name);
      if (store.address) push(store.address);
      if (store.phone) push(`Tel: ${store.phone}`);
      push('--------------------------------');

      // Left align for items
      lines.push(new Uint8Array([ESC, 0x61, 0x00]));

      if (transaction) {
        push(`Receipt #${transaction.receipt_number || transaction.id || ''}`);
        push(`Date: ${new Date(transaction.created_at || Date.now()).toLocaleString()}`);
        push('--------------------------------');

        (transaction.items || []).forEach((item) => {
          const name = (item.product_name || item.name || '').substring(0, 20);
          const qty = item.quantity || 1;
          const price = parseFloat(item.unit_price || item.price || 0).toFixed(2);
          const total = (qty * parseFloat(price)).toFixed(2);
          push(`${name}`);
          push(`  ${qty} x $${price}    $${total}`);
        });

        push('--------------------------------');
        if (transaction.subtotal != null) push(`Subtotal:       $${parseFloat(transaction.subtotal).toFixed(2)}`);
        if (transaction.tax_amount != null) push(`Tax:            $${parseFloat(transaction.tax_amount).toFixed(2)}`);
        push(`TOTAL:          $${parseFloat(transaction.total || 0).toFixed(2)}`);
        push(`Payment: ${transaction.payment_method || 'N/A'}`);
      }

      push('');
      // Center
      lines.push(new Uint8Array([ESC, 0x61, 0x01]));
      push('Thank you for shopping!');
      push('');

      // Feed + cut
      lines.push(new Uint8Array([LF, LF, LF, GS, 0x56, 0x00]));

      // Merge all buffers and send
      const totalLen = lines.reduce((s, b) => s + b.length, 0);
      const payload = new Uint8Array(totalLen);
      let offset = 0;
      for (const buf of lines) {
        payload.set(buf, offset);
        offset += buf.length;
      }

      // Find OUT endpoint
      const iface = device.configuration.interfaces[0];
      const ep = iface.alternate.endpoints.find((e) => e.direction === 'out');
      if (!ep) throw new Error('No OUT endpoint found on printer');

      await device.transferOut(ep.endpointNumber, payload);
      await device.close();

      setPrintStatus('success');
      onPrintComplete?.({ success: true, method: 'thermal' });
    } catch (error) {
      console.error('[PrintReceipt] Thermal print error:', error);
      // Fall back to browser print
      handleBrowserPrint();
    }
  }, [handleBrowserPrint, transaction, storeInfo, onPrintComplete]);

  /**
   * Main print handler
   */
  const handlePrint = useCallback(() => {
    // Try thermal first, fall back to browser
    handleThermalPrint();
  }, [handleThermalPrint]);

  // Auto-print on mount
  useEffect(() => {
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
              <Printer className="w-5 h-5" />
              Print Receipt
            </>
          )}
        </button>

        {/* Status indicator */}
        {printStatus === 'success' && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="w-5 h-5" />
            Printed
          </span>
        )}
        {printStatus === 'error' && (
          <span className="flex items-center gap-1 text-red-600">
            <XCircle className="w-5 h-5" />
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
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    }, 100);
  });
}

export default PrintReceipt;
