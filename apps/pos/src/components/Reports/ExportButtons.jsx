/**
 * TeleTime POS - Export Buttons Component
 * CSV/ZIP export and print functionality
 */

import { useState } from 'react';
import {
  DocumentArrowDownIcon,
  ArchiveBoxArrowDownIcon,
  PrinterIcon,
  ChevronDownIcon,
  TableCellsIcon,
  DocumentTextIcon,
  CreditCardIcon,
  UsersIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Export Buttons Component
 * @param {object} props
 * @param {string} props.date - Date string for the report (YYYY-MM-DD)
 * @param {number} props.shiftId - Shift ID (optional)
 * @param {function} props.onPrint - Callback when print is clicked
 */
export function ExportButtons({ date, shiftId, onPrint }) {
  const [isExporting, setIsExporting] = useState(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const exportTypes = [
    { id: 'summary', label: 'Summary', icon: DocumentTextIcon },
    { id: 'transactions', label: 'Transactions', icon: TableCellsIcon },
    { id: 'products', label: 'Products', icon: TableCellsIcon },
    { id: 'payments', label: 'Payments', icon: CreditCardIcon },
    { id: 'reps', label: 'Sales Reps', icon: UsersIcon },
    { id: 'hourly', label: 'Hourly', icon: ClockIcon },
  ];

  /**
   * Build export URL
   */
  const buildExportUrl = (type, format = 'csv') => {
    const baseUrl = `${API_BASE}/reports/export/${format}`;
    const params = new URLSearchParams();

    if (shiftId) {
      params.set('shiftId', shiftId);
    } else if (date) {
      params.set('date', date);
    }

    if (type && format === 'csv') {
      params.set('type', type);
    }

    return `${baseUrl}?${params.toString()}`;
  };

  /**
   * Handle CSV export
   */
  const handleExportCSV = async (type) => {
    try {
      setIsExporting(type);
      setShowTypeMenu(false);

      const token = localStorage.getItem('pos_token');
      const url = buildExportUrl(type, 'csv');

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `${type}-report-${date || 'export'}.csv`;

      // Download the file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('[ExportButtons] CSV export error:', error);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  /**
   * Handle ZIP export
   */
  const handleExportZip = async () => {
    try {
      setIsExporting('zip');

      const token = localStorage.getItem('pos_token');
      const url = buildExportUrl(null, 'zip');

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `shift-reports-${date || 'export'}.zip`;

      // Download the file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('[ExportButtons] ZIP export error:', error);
      alert('Failed to export ZIP. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  /**
   * Handle print
   */
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* CSV Export with Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTypeMenu(!showTypeMenu)}
          disabled={isExporting !== null}
          className={`
            flex items-center gap-2 px-4 py-2
            text-sm font-medium
            border rounded-lg
            transition-colors
            ${isExporting
              ? 'bg-gray-100 text-gray-400 cursor-wait'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }
          `}
        >
          <DocumentArrowDownIcon className="w-4 h-4" />
          <span>Export CSV</span>
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${showTypeMenu ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {showTypeMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowTypeMenu(false)}
            />
            <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {exportTypes.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleExportCSV(type.id)}
                  disabled={isExporting !== null}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <type.icon className="w-4 h-4 text-gray-500" />
                  <span>{type.label}</span>
                  {isExporting === type.id && (
                    <span className="ml-auto w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ZIP Export */}
      <button
        type="button"
        onClick={handleExportZip}
        disabled={isExporting !== null}
        className={`
          flex items-center gap-2 px-4 py-2
          text-sm font-medium
          border rounded-lg
          transition-colors
          ${isExporting === 'zip'
            ? 'bg-gray-100 text-gray-400 cursor-wait'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }
        `}
      >
        {isExporting === 'zip' ? (
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <ArchiveBoxArrowDownIcon className="w-4 h-4" />
        )}
        <span>Export All (ZIP)</span>
      </button>

      {/* Print Button */}
      <button
        type="button"
        onClick={handlePrint}
        className="
          flex items-center gap-2 px-4 py-2
          text-sm font-medium
          bg-blue-600 text-white
          rounded-lg
          hover:bg-blue-700
          transition-colors
        "
      >
        <PrinterIcon className="w-4 h-4" />
        <span>Print Report</span>
      </button>
    </div>
  );
}

/**
 * Compact export buttons for smaller spaces
 */
export function CompactExportButtons({ date, shiftId }) {
  const [isExporting, setIsExporting] = useState(null);

  const handleExport = async (format) => {
    try {
      setIsExporting(format);

      const token = localStorage.getItem('pos_token');
      const baseUrl = `${API_BASE}/reports/export/${format}`;
      const params = new URLSearchParams();

      if (shiftId) {
        params.set('shiftId', shiftId);
      } else if (date) {
        params.set('date', date);
      }

      if (format === 'csv') {
        params.set('type', 'summary');
      }

      const url = `${baseUrl}?${params.toString()}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `report-${date || 'export'}.${format}`;
      document.body.appendChild(link);
      link.click();
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('[CompactExportButtons] Export error:', error);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => handleExport('csv')}
        disabled={isExporting !== null}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Export CSV"
      >
        {isExporting === 'csv' ? (
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin block" />
        ) : (
          <DocumentArrowDownIcon className="w-4 h-4" />
        )}
      </button>
      <button
        type="button"
        onClick={() => handleExport('zip')}
        disabled={isExporting !== null}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Export ZIP"
      >
        {isExporting === 'zip' ? (
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin block" />
        ) : (
          <ArchiveBoxArrowDownIcon className="w-4 h-4" />
        )}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Print"
      >
        <PrinterIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

export default ExportButtons;
