/**
 * TeleTime POS - Shift Report Page
 * End-of-day shift report with summary, charts, and export
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { ShiftSummaryCards, ExtendedSummaryCards } from './ShiftSummaryCards';
import { ShiftReportTabs } from './ShiftReportTabs';
import { CashReconciliation } from './CashReconciliation';
import { ExportButtons } from './ExportButtons';
import { EmailShiftReceiptsButton } from '../Email';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Format date for display
 */
function formatDisplayDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time for display
 */
function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Shift Selector Component
 */
function ShiftSelector({ shifts, selectedShift, onSelect, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2].map(i => (
          <div key={i} className="h-12 w-32 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!shifts || shifts.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-3">
        No shifts found for this date
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`
          px-4 py-2 rounded-lg font-medium text-sm
          transition-colors border
          ${!selectedShift
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }
        `}
      >
        All Day
      </button>
      {shifts.map(shift => (
        <button
          key={shift.id}
          type="button"
          onClick={() => onSelect(shift)}
          className={`
            px-4 py-2 rounded-lg font-medium text-sm
            transition-colors border
            ${selectedShift?.id === shift.id
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }
          `}
        >
          <span className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />
            <span>
              {formatTime(shift.startedAt)} - {shift.endedAt ? formatTime(shift.endedAt) : 'Open'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Date Navigation Component
 */
function DateNavigation({ date, onDateChange }) {
  const today = getTodayDate();

  const goToPrevDay = () => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    onDateChange(d.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    onDateChange(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    onDateChange(today);
  };

  const isToday = date === today;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goToPrevDay}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Previous day"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </button>

      <div className="relative">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          max={today}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <button
        type="button"
        onClick={goToNextDay}
        disabled={isToday}
        className={`
          p-2 rounded-lg transition-colors
          ${isToday
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-600 hover:bg-gray-100'
          }
        `}
        title="Next day"
      >
        <ChevronRightIcon className="w-5 h-5" />
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={goToToday}
          className="px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          Today
        </button>
      )}
    </div>
  );
}

/**
 * Error Message Component
 */
function ErrorMessage({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="p-3 bg-red-100 rounded-full mb-4">
        <ExclamationCircleIcon className="w-8 h-8 text-red-600" />
      </div>
      <p className="text-gray-700 font-medium mb-2">Failed to load report</p>
      <p className="text-sm text-gray-500 mb-4">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <ArrowPathIcon className="w-4 h-4" />
        Try Again
      </button>
    </div>
  );
}

/**
 * Loading Skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl" />
        ))}
      </div>
      <div className="h-96 bg-gray-200 rounded-xl" />
    </div>
  );
}

/**
 * Shift Report Page Component
 */
export function ShiftReportPage({ onBack }) {
  const [date, setDate] = useState(getTodayDate());
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingShifts, setIsLoadingShifts] = useState(true);
  const [error, setError] = useState(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [isSubmittingReconciliation, setIsSubmittingReconciliation] = useState(false);
  const [showExtendedCards, setShowExtendedCards] = useState(false);

  /**
   * Fetch shifts for the selected date
   */
  const fetchShifts = useCallback(async () => {
    try {
      setIsLoadingShifts(true);
      const token = localStorage.getItem('pos_token');

      const response = await fetch(
        `${API_BASE}/reports/shifts?date=${date}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        // Shifts endpoint might not exist - that's OK
        setShifts([]);
        return;
      }

      const data = await response.json();
      setShifts(data.shifts || []);
    } catch (err) {
      console.error('[ShiftReportPage] Error fetching shifts:', err);
      setShifts([]);
    } finally {
      setIsLoadingShifts(false);
    }
  }, [date]);

  /**
   * Fetch report data
   */
  const fetchReport = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('pos_token');

      let url;
      if (selectedShift) {
        url = `${API_BASE}/reports/shift/${selectedShift.id}`;
      } else {
        url = `${API_BASE}/reports/today?date=${date}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load report');
      }

      const data = await response.json();
      setReportData(data);
    } catch (err) {
      console.error('[ShiftReportPage] Error fetching report:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [date, selectedShift]);

  // Fetch shifts when date changes
  useEffect(() => {
    setSelectedShift(null);
    fetchShifts();
  }, [fetchShifts]);

  // Fetch report when date or shift changes
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  /**
   * Handle cash reconciliation submission
   */
  const handleReconciliationSubmit = async (reconciliationData) => {
    try {
      setIsSubmittingReconciliation(true);
      const token = localStorage.getItem('pos_token');

      const response = await fetch(`${API_BASE}/reports/reconciliation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shiftId: selectedShift?.id,
          date,
          ...reconciliationData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit reconciliation');
      }

      // Refresh report data
      await fetchReport();
      setShowReconciliation(false);

      // Show success message
      alert('Cash reconciliation submitted successfully!');
    } catch (err) {
      console.error('[ShiftReportPage] Error submitting reconciliation:', err);
      alert('Failed to submit reconciliation. Please try again.');
    } finally {
      setIsSubmittingReconciliation(false);
    }
  };

  /**
   * Handle print
   */
  const handlePrint = () => {
    window.print();
  };

  const expectedCash = reportData?.paymentBreakdown?.cashDrawer?.expectedInDrawer || 0;
  const openingCash = reportData?.paymentBreakdown?.cashDrawer?.openingCash || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
              )}
              <div>
                <h1 className="text-xl font-bold text-gray-900">Shift Report</h1>
                <p className="text-sm text-gray-500">{formatDisplayDate(date)}</p>
              </div>
            </div>

            <DateNavigation date={date} onDateChange={setDate} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Shift Selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 print:hidden">
          <div className="flex items-center gap-3 mb-3">
            <CalendarIcon className="w-5 h-5 text-gray-500" />
            <span className="font-medium text-gray-700">Select Shift</span>
          </div>
          <ShiftSelector
            shifts={shifts}
            selectedShift={selectedShift}
            onSelect={setSelectedShift}
            isLoading={isLoadingShifts}
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <ErrorMessage message={error} onRetry={fetchReport} />
          </div>
        )}

        {/* Loading State */}
        {isLoading && !error && <LoadingSkeleton />}

        {/* Report Content */}
        {!isLoading && !error && reportData && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <ShiftSummaryCards
              summary={reportData.salesSummary}
              payments={reportData.paymentBreakdown}
            />

            {/* Toggle Extended Cards */}
            <div className="flex justify-center print:hidden">
              <button
                type="button"
                onClick={() => setShowExtendedCards(!showExtendedCards)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showExtendedCards ? 'Hide details' : 'Show more details'}
              </button>
            </div>

            {/* Extended Cards */}
            {showExtendedCards && (
              <ExtendedSummaryCards
                summary={reportData.salesSummary}
                payments={reportData.paymentBreakdown}
                operational={reportData.operationalMetrics}
              />
            )}

            {/* Detailed Tabs */}
            <ShiftReportTabs
              salesData={{
                hourly: reportData.salesSummary?.hourlyBreakdown || [],
                categories: reportData.productSummary?.byCategory || [],
              }}
              paymentData={reportData.paymentBreakdown}
              staffData={reportData.salesRepPerformance}
              operationalData={reportData.operationalMetrics}
            />

            {/* Action Bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium text-gray-900">Export & Actions</h3>
                  <p className="text-sm text-gray-500">
                    Download reports or reconcile cash drawer
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <EmailShiftReceiptsButton
                    shiftId={selectedShift?.id}
                    date={date}
                  />
                  <ExportButtons
                    date={date}
                    shiftId={selectedShift?.id}
                    onPrint={handlePrint}
                  />
                  <button
                    type="button"
                    onClick={() => setShowReconciliation(!showReconciliation)}
                    className={`
                      px-4 py-2 font-medium rounded-lg transition-colors
                      ${showReconciliation
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        : 'bg-orange-600 text-white hover:bg-orange-700'
                      }
                    `}
                  >
                    {showReconciliation ? 'Hide Reconciliation' : 'Cash Reconciliation'}
                  </button>
                </div>
              </div>
            </div>

            {/* Cash Reconciliation */}
            {showReconciliation && (
              <CashReconciliation
                expectedCash={expectedCash}
                openingCash={openingCash}
                onSubmit={handleReconciliationSubmit}
                isSubmitting={isSubmittingReconciliation}
              />
            )}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && !reportData && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="p-3 bg-gray-100 rounded-full inline-block mb-4">
              <CalendarIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-700 font-medium mb-2">No data available</p>
            <p className="text-sm text-gray-500">
              No transactions found for the selected date/shift
            </p>
          </div>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default ShiftReportPage;
