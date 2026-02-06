/**
 * TeleTime POS API Services Index
 * Centralized exports for all API services
 */

// Core axios instance and auth helpers
export {
  default as api,
  setAuthToken,
  getAuthToken,
  setUserData,
  getUserData,
  clearAuth,
  isAuthenticated,
  createCancellableRequest,
  requestWithRetry,
} from './axios';

// Product services
export {
  getProducts,
  getProduct,
  searchByBarcode,
  searchBySku,
  getCategories,
  getProductsByCategory,
  quickSearch as quickSearchProducts,
  checkStock,
} from './products';

// Customer services
export {
  searchCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  getCustomerQuotes,
  getCustomerTransactions,
  findByPhone,
  findByEmail,
} from './customers';

// Transaction services
export {
  createTransaction,
  getTransaction,
  getTransactions,
  voidTransaction,
  refundTransaction,
  getDailySummary,
  getDailySummaryByDate,
  lookupByNumber as lookupTransactionByNumber,
  getReceiptData,
} from './transactions';

// Register & Shift services
export {
  getRegisters,
  getRegister,
  openShift,
  getShiftSummary,
  getShiftTransactions,
  closeShift,
  getActiveShift,
  createRegister,
  updateRegister,
  deactivateRegister,
  getAvailableRegisters,
} from './register';

// Quote services
export {
  lookupQuote,
  getQuoteForSale,
  getQuote,
  convertQuote,
  getCustomerPendingQuotes,
  getPendingQuotes,
  searchQuotes,
  checkQuoteValidity,
} from './quotes';

// Unified Reports services
export {
  getDashboardSummary,
  getSalesSummary,
  getDailySalesReport,
  getMonthlySalesTrend,
  getHourlySalesPatterns,
  getQuoteConversionMetrics,
  getQuoteConversionTrend,
  getAOVComparison,
  getProductPerformance,
  getCategoryPerformance,
  getCustomerPurchaseHistory,
  getCustomerTransactionHistory,
  getSalesRepPerformance,
  exportSalesCSV,
  exportProductsCSV,
} from './reports';

// Recommendation services
export {
  getProductRecommendations,
  getCartRecommendations,
  getCrossSellSuggestions,
  trackRecommendationEvent,
  getBundleSuggestions,
  getRecommendationStats,
  getProductRelationships,
  saveProductRelationship,
  deleteProductRelationship,
  toggleRelationshipStatus,
  getCategoryRules,
  saveCategoryRule,
  deleteCategoryRule,
  refreshRecommendations,
  testProductRecommendations,
  testCartRecommendations,
} from './recommendations';

// Namespace exports for organized access
import * as productsApi from './products';
import * as customersApi from './customers';
import * as transactionsApi from './transactions';
import * as registerApi from './register';
import * as quotesApi from './quotes';
import * as reportsApi from './reports';
import * as recommendationsApi from './recommendations';
import * as upsellApi from './upsell';
import * as financingApi from './financing';
import * as quoteExpiryApi from './quoteExpiry';

export {
  productsApi,
  customersApi,
  transactionsApi,
  registerApi,
  quotesApi,
  reportsApi,
  recommendationsApi,
  upsellApi,
  financingApi,
  quoteExpiryApi,
};

// Upsell services
export {
  getUpsellOffers,
  calculateUpgradeValue,
  recordUpsellResult,
  getServiceRecommendations,
  getMembershipOffers,
  getFinancingOptions,
  getUpsellAnalytics,
  getUpsellStrategies,
  getUpsellStrategy,
  createUpsellStrategy,
  updateUpsellStrategy,
  deleteUpsellStrategy,
  createUpsellOffer,
  updateUpsellOffer,
  deleteUpsellOffer,
  getServices,
  createService,
  clearUpsellCache,
} from './upsell';

// Financing services
export {
  getAvailablePlans as getFinancingPlans,
  calculatePaymentPlan,
  applyForFinancing,
  getApplication as getFinancingApplication,
  getCustomerFinancing,
  recordPayment as recordFinancingPayment,
  listApplications as listFinancingApplications,
  listAgreements as listFinancingAgreements,
  getUpcomingPayments,
  getOverduePayments,
  approveApplication as approveFinancingApplication,
  declineApplication as declineFinancingApplication,
} from './financing';

// Quote Expiry services
export {
  getExpiringQuotes,
  getExpiryStats,
  getExpiryDashboard,
  logFollowUp,
  getFollowUpHistory,
} from './quoteExpiry';

// Returns services
export {
  searchInvoices,
  getReasonCodes,
  getReturnItems,
  addReturnItems,
  getReturnPaymentInfo,
  processRefund,
  createReturn,
} from './returns';

// Store Credits services
export {
  createStoreCredit,
  lookupStoreCredit,
  redeemStoreCredit,
} from './storeCredits';

// Exchanges services
export {
  calculateExchange,
  processExchange,
} from './exchanges';

// Commission services
export {
  calculateCartCommission,
  calculateOrderCommission,
  recordCommission,
  getMyCommissions,
  getRepCommissions,
  getLeaderboard,
  getCommissionStats,
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  getRepSettings,
  updateRepSettings,
  getCommissionSummary,
  previewCommissionSplits,
  saveCommissionSplits,
  getCommissionSplits,
  getTeamCommissions,
  getRepDetailedCommissions,
  exportCommissionsCSV,
  getPayrollSummary,
  createPayout,
  getPendingPayouts,
  approvePayout,
  markPayoutPaid,
  addAdjustment,
} from './commissions';

// Namespace exports for returns, storeCredits, exchanges, commissions
import * as returnsApi from './returns';
import * as storeCreditsApi from './storeCredits';
import * as exchangesApi from './exchanges';
import * as commissionsApi from './commissions';

export {
  returnsApi,
  storeCreditsApi,
  exchangesApi,
  commissionsApi,
};
