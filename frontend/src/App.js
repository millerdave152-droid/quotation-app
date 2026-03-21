import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast, setToastRef } from './components/ui';
import ErrorBoundary from './components/ErrorBoundary';
import { MainLayout } from './components/layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { QuoteProvider } from './contexts/QuoteContext';
import { ProductProvider } from './contexts/ProductContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import CommandPalette from './components/ui/CommandPalette';
import GlobalSearch from './components/ui/GlobalSearch';
import AssistantWidget from './components/AIAssistant/AssistantWidget';
import BugReportForm from './components/BugReportForm';
import './services/authGuards';

import { authFetch } from './services/authFetch';
// Utility CSS classes for replacing inline styles
import './styles/utilities.css';
import './styles/theme.css';

// Lazy load components - loads ONLY when tab is first clicked
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const QuotationManager = React.lazy(() => import('./components/QuotationManager'));
const CustomerManagement = React.lazy(() => import('./components/CustomerManagement'));
const ProductManagement = React.lazy(() => import('./components/ProductManagement'));
// Revenue Analytics loaded via InsightsHub
const MarketplaceManager = React.lazy(() => import('./components/MarketplaceManager'));
const MarketplaceReports = React.lazy(() => import('./components/MarketplaceReports'));
const BulkOperationsCenter = React.lazy(() => import('./components/BulkOperationsCenter'));
const PowerFeatures2026 = React.lazy(() => import('./components/PowerFeatures2026'));
const SearchResults = React.lazy(() => import('./components/SearchResults'));
const UserManagement = React.lazy(() => import('./components/admin/UserManagement'));
const CustomerQuoteView = React.lazy(() => import('./pages/CustomerQuoteView'));

// Enterprise Phase 2 Components
const InvoiceManager = React.lazy(() => import('./components/invoices/InvoiceManager'));
const InventoryDashboard = React.lazy(() => import('./components/inventory/InventoryDashboard'));
const PaymentPortal = React.lazy(() => import('./pages/PaymentPortal'));
const EnhancedCustomerPortal = React.lazy(() => import('./pages/EnhancedCustomerPortal'));
const QuoteExpiryManager = React.lazy(() => import('./components/quotes/QuoteExpiryManager'));

// Advanced Pricing Components
const AdvancedPricingManager = React.lazy(() => import('./components/pricing/AdvancedPricingManager'));
const ManufacturerPromotionsAdmin = React.lazy(() => import('./components/pricing/ManufacturerPromotionsAdmin'));

// Product Visualization (Vendor Product Gallery)
const ProductVisualization = React.lazy(() => import('./components/ProductVisualization/ProductVisualization'));

// Insights Hub (Revenue Analytics + Customer CLV)
const InsightsHub = React.lazy(() => import('./components/analytics/InsightsHub'));

// Purchasing Intelligence Dashboard
const PurchasingIntelligence = React.lazy(() => import('./components/analytics/PurchasingIntelligence'));

// Sales Performance Hub (Pipeline + Leaderboard)
const SalesPerformanceHub = React.lazy(() => import('./components/SalesPerformanceHub'));

// Report Builder & Executive Dashboard
const ReportBuilder = React.lazy(() => import('./components/reports/ReportBuilder'));
const ExecutiveDashboard = React.lazy(() => import('./components/reports/ExecutiveDashboard'));

// Model Nomenclature Training Center
const TrainingCenter = React.lazy(() => import('./components/nomenclature/TrainingCenter'));
const NomenclatureAdmin = React.lazy(() => import('./components/nomenclature/NomenclatureAdmin'));

// Recommendation Rules Admin
const RecommendationRulesPage = React.lazy(() => import('./components/admin/recommendations/RecommendationRulesPage'));

// Fraud & Audit Dashboard
const FraudDashboard = React.lazy(() => import('./components/admin/FraudDashboard'));
const BugReportsDashboard = React.lazy(() => import('./components/admin/BugReportsDashboard'));
const SerialRegistry = React.lazy(() => import('./components/inventory/SerialRegistry'));
const PurchaseOrderDashboard = React.lazy(() => import('./components/purchasing/PurchaseOrderDashboard'));
const VariantManager = React.lazy(() => import('./components/products/VariantManager'));

// Order Amendments
const PendingAmendments = React.lazy(() => import('./components/orders/PendingAmendments'));

// Product Detail Page (barcode, attributes, online stores)
const ProductDetailPage = React.lazy(() => import('./components/product/ProductDetailPage'));

// Monitoring Hub (Client Errors + Discount Analytics)
const MonitoringHub = React.lazy(() => import('./components/admin/MonitoringHub'));

// Lightspeed Feature Gap Components
const InventoryCount = React.lazy(() => import('./components/inventory/InventoryCount'));
const TransferManagement = React.lazy(() => import('./components/inventory/TransferManagement'));
const ReceivingWorkflow = React.lazy(() => import('./components/inventory/ReceivingWorkflow'));
const CycleCountReview = React.lazy(() => import('./components/inventory/CycleCountReview'));
const WorkOrderDashboard = React.lazy(() => import('./components/operations/WorkOrderDashboard'));
const SpecialOrderTracker = React.lazy(() => import('./components/sales/SpecialOrderTracker'));
const CustomerAccountManager = React.lazy(() => import('./components/customers/CustomerAccountManager'));
const PreOrderManager = React.lazy(() => import('./components/sales/PreOrderManager'));
const SurveyDashboard = React.lazy(() => import('./components/marketing/SurveyDashboard'));
const CatalogExportManager = React.lazy(() => import('./components/marketing/CatalogExportManager'));
const AudienceSyncManager = React.lazy(() => import('./components/marketing/AudienceSyncManager'));

// Team Commissions (Rules, Payroll, Export)
const TeamCommissions = React.lazy(() => import('./components/commissions/TeamCommissions'));

// Institutional Buyer Workflow
const AccountsReceivableView = React.lazy(() => import('./components/institutional/AccountsReceivableView'));
const InstitutionalAccountPage = React.lazy(() => import('./components/institutional/InstitutionalAccountPage'));

// Real-Time Retail Dashboards
const StoreManagerDashboard = React.lazy(() => import('./components/dashboard/StoreManagerDashboard'));
const SalesRepDashboard = React.lazy(() => import('./components/dashboard/SalesRepDashboard'));

// Sales Leaderboard loaded via SalesPerformanceHub

// Customer Quote Acceptance (public)
const CustomerQuoteAcceptance = React.lazy(() => import('./pages/CustomerQuoteAcceptance'));

// Quick Search removed — use Ctrl+K command palette

// TEMPORARY: Lunaris preview
const QuotationEditorNew = React.lazy(() => import('./components/quotes/QuotationEditorNew'));
const QuotationsListNew = React.lazy(() => import('./components/quotes/QuotationsListNew'));
const LeadsMainNew = React.lazy(() => import('./components/leads/LeadsMainNew'));
const LeadDetailNew = React.lazy(() => import('./components/leads/LeadDetailNew'));
const LeadFormNew = React.lazy(() => import('./components/leads/LeadFormNew'));
const CustomerManagementNew = React.lazy(() => import('./components/customers/CustomerManagementNew'));
const LeadsAnalyticsNew = React.lazy(() => import('./components/leads/LeadsAnalyticsNew'));
const SalesPipelineDashboardNew = React.lazy(() => import('./components/pipeline/SalesPipelineDashboardNew'));
const POSAnalyticsNew = React.lazy(() => import('./components/analytics/POSAnalyticsNew'));
const Customer360ViewNew = React.lazy(() => import('./components/customers/Customer360ViewNew'));
const QuotationsDashboardNew = React.lazy(() => import('./components/quotes/QuotationsDashboardNew'));
const InventoryDashboardNew = React.lazy(() => import('./components/inventory/InventoryDashboardNew'));
const ProductCatalogNew = React.lazy(() => import('./components/inventory/ProductCatalogNew'));
const PurchaseOrderDashboardNew = React.lazy(() => import('./components/orders/PurchaseOrderDashboardNew'));
const InvoiceManagerNew = React.lazy(() => import('./components/invoices/InvoiceManagerNew'));
const ProductDetailNew = React.lazy(() => import('./components/inventory/ProductDetailNew'));
const DeliverySchedulerNew = React.lazy(() => import('./components/orders/DeliverySchedulerNew'));
const UserManagementNew = React.lazy(() => import('./components/admin/UserManagementNew'));
const NomenclatureAdminNew = React.lazy(() => import('./components/admin/NomenclatureAdminNew'));
const MonitoringHubNew = React.lazy(() => import('./components/admin/MonitoringHubNew'));
const SerialNumberRegistryNew = React.lazy(() => import('./components/inventory/SerialNumberRegistryNew'));
const CustomerFinancingNew = React.lazy(() => import('./components/customers/CustomerFinancingNew'));
const DataImportHubNew = React.lazy(() => import('./components/admin/DataImportHubNew'));
const OrderEditModalNew = React.lazy(() => import('./components/orders/OrderEditModalNew'));
const OrdersNew = React.lazy(() => import('./components/orders/OrdersNew'));
const OrderDetailNew = React.lazy(() => import('./components/orders/OrderDetailNew'));
const ConvertToQuoteNew = React.lazy(() => import('./components/leads/ConvertToQuoteNew'));
const FraudRuleManagerNew = React.lazy(() => import('./components/admin/FraudRuleManagerNew'));
const OrderAnalyticsNew = React.lazy(() => import('./components/orders/OrderAnalyticsNew'));
const CustomerAnalyticsNew = React.lazy(() => import('./components/analytics/CustomerAnalyticsNew'));
const ApprovalAnalyticsNew = React.lazy(() => import('./components/analytics/ApprovalAnalyticsNew'));
const SpecialOrderTrackerNew = React.lazy(() => import('./components/orders/SpecialOrderTrackerNew'));
const PreOrderManagerNew = React.lazy(() => import('./components/orders/PreOrderManagerNew'));
const WorkOrderDashboardNew = React.lazy(() => import('./components/orders/WorkOrderDashboardNew'));
const CustomerActivityTimelineNew = React.lazy(() => import('./components/customers/CustomerActivityTimelineNew'));
const PendingAmendmentsNew = React.lazy(() => import('./components/orders/PendingAmendmentsNew'));
const FulfillmentTrackerNew = React.lazy(() => import('./components/orders/FulfillmentTrackerNew'));
const LeadQuickCaptureNew = React.lazy(() => import('./components/leads/LeadQuickCaptureNew'));
const QuickActionCallNew = React.lazy(() => import('./components/leads/QuickActionCallNew'));
const QuickActionEmailNew = React.lazy(() => import('./components/leads/QuickActionEmailNew'));
const QuickActionNoteNew = React.lazy(() => import('./components/leads/QuickActionNoteNew'));
const QuickActionStatusNew = React.lazy(() => import('./components/leads/QuickActionStatusNew'));
const QuickActionFollowUpNew = React.lazy(() => import('./components/leads/QuickActionFollowUpNew'));
const LostReasonModalNew = React.lazy(() => import('./components/leads/LostReasonModalNew'));
const LeadImportStep1New = React.lazy(() => import('./components/leads/LeadImportStep1New'));
const InvoiceDetailNew = React.lazy(() => import('./components/invoices/InvoiceDetailNew'));
const ARDashboardNew = React.lazy(() => import('./components/invoices/ARDashboardNew'));
const AutoInvoicePanelNew = React.lazy(() => import('./components/invoices/AutoInvoicePanelNew'));
const CreditMemosNew = React.lazy(() => import('./components/invoices/CreditMemosNew'));
const ReceivingWorkflowNew = React.lazy(() => import('./components/inventory/ReceivingWorkflowNew'));
const CRMDashboardNew = React.lazy(() => import('./components/crm/CRMDashboardNew'));
const CLVDashboardNew = React.lazy(() => import('./components/customers/CLVDashboardNew'));
const ReportBuilderNew = React.lazy(() => import('./components/analytics/ReportBuilderNew'));
const RevenueAnalyticsNew = React.lazy(() => import('./components/analytics/RevenueAnalyticsNew'));
const SalesForecastNew = React.lazy(() => import('./components/analytics/SalesForecastNew'));
const PipelineAnalyticsNew = React.lazy(() => import('./components/analytics/PipelineAnalyticsNew'));
const SalesLeaderboardNew = React.lazy(() => import('./components/analytics/SalesLeaderboardNew'));
const DiscountAnalyticsNew = React.lazy(() => import('./components/analytics/DiscountAnalyticsNew'));
const LeadAnalyticsNew = React.lazy(() => import('./components/analytics/LeadAnalyticsNew'));
const LeadSourceROINew = React.lazy(() => import('./components/analytics/LeadSourceROINew'));
const ProductPerformanceNew = React.lazy(() => import('./components/analytics/ProductPerformanceNew'));
const SalesOverviewNew = React.lazy(() => import('./components/analytics/SalesOverviewNew'));
const CategoryInsightsNew = React.lazy(() => import('./components/analytics/CategoryInsightsNew'));
const LeadsWidgetNew = React.lazy(() => import('./components/dashboard/LeadsWidgetNew'));
const FraudDetectionDialogNew = React.lazy(() => import('./components/admin/FraudDetectionDialogNew'));
const FraudDashboardNew = React.lazy(() => import('./components/admin/FraudDashboardNew'));
const FraudAlertPanelNew = React.lazy(() => import('./components/admin/FraudAlertPanelNew'));
const TransactionReviewQueueNew = React.lazy(() => import('./components/admin/TransactionReviewQueueNew'));
const EmployeeFraudDashboardNew = React.lazy(() => import('./components/admin/EmployeeFraudDashboardNew'));
const EmployeeRiskDetailNew = React.lazy(() => import('./components/admin/EmployeeRiskDetailNew'));
const AdvancedPricingManagerNew = React.lazy(() => import('./components/pricing/AdvancedPricingManagerNew'));
const ProductIntelligenceNew = React.lazy(() => import('./components/analytics/ProductIntelligenceNew'));
const RecommendationRulesNew = React.lazy(() => import('./components/pricing/RecommendationRulesNew'));
const ProductComparisonNew = React.lazy(() => import('./components/pricing/ProductComparisonNew'));
const BulkPriceUpdateNew = React.lazy(() => import('./components/pricing/BulkPriceUpdateNew'));
const CEProductImportNew = React.lazy(() => import('./components/inventory/CEProductImportNew'));
const CommissionSplitModalNew = React.lazy(() => import('./components/commission/CommissionSplitModalNew'));
const MarketplaceOverviewNew = React.lazy(() => import('./components/marketplace/MarketplaceOverviewNew'));
const SellerPerformanceNew = React.lazy(() => import('./components/marketplace/SellerPerformanceNew'));
const CommissionReportNew = React.lazy(() => import('./components/marketplace/CommissionReportNew'));
const RuleAuditLogNew = React.lazy(() => import('./components/admin/RuleAuditLogNew'));
const POSRuleAuditLogNew = React.lazy(() => import('./components/admin/POSRuleAuditLogNew'));
const EditUserModalNew = React.lazy(() => import('./components/admin/EditUserModalNew'));
const ErrorDetailDrawerNew = React.lazy(() => import('./components/admin/ErrorDetailDrawerNew'));
const RuleEditorDrawerNew = React.lazy(() => import('./components/admin/RuleEditorDrawerNew'));

// Leads / Inquiry Capture
const LeadCapture = React.lazy(() => import('./components/leads/LeadCapture'));

// Delivery Management Dashboard
const DeliveryDashboard = React.lazy(() => import('./pages/DeliveryDashboard'));

// Data Import Hub (Skulytics Import + CE Import + Sync Health)
const DataImportHub = React.lazy(() => import('./components/admin/DataImportHub'));

// Dev-only: Competitor Pricing Preview
const CompetitorPricingDev = process.env.NODE_ENV === 'development'
  ? React.lazy(() => import('./components/quotes/CompetitorPricingDev'))
  : null;


// Main App with protected routes
function App() {
  const { isAuthenticated, loading, user } = useAuth();
  const { toggleTheme, setLightTheme, setDarkTheme } = useTheme();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Command Palette (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        setGlobalSearchOpen(false);
      }
      // Global Search (Ctrl+Shift+F or Cmd+Shift+F)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setGlobalSearchOpen(prev => !prev);
        setCommandPaletteOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle navigation from Command Palette
  const handleCommandNavigate = useCallback((path, action) => {
    if (path) {
      navigate(path);
    } else if (action) {
      // Handle actions
      switch (action) {
        case 'new-quote':
          navigate('/quotes/new');
          break;
        case 'new-customer':
          navigate('/customers');
          // Trigger add customer modal via URL param or state
          setTimeout(() => {
            const event = new CustomEvent('openAddCustomer');
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'new-product':
          navigate('/products');
          setTimeout(() => {
            const event = new CustomEvent('openAddProduct');
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'new-order':
          navigate('/quotes');
          break;
        case 'search-quotes':
          navigate('/quotes');
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
          break;
        case 'search-customers':
          navigate('/customers');
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
          break;
        case 'search-products':
          navigate('/products');
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
          break;
        case 'global-search':
          setGlobalSearchOpen(true);
          break;
        case 'toggle-theme':
          toggleTheme();
          break;
        case 'set-light-theme':
          setLightTheme();
          break;
        case 'set-dark-theme':
          setDarkTheme();
          break;
        default:
          break;
      }
    }
  }, [navigate, toggleTheme, setLightTheme, setDarkTheme]);

  // Show loading while checking auth state
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#667eea', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Command Palette - Always available */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleCommandNavigate}
      />

      {/* Global Search - Ctrl+Shift+F */}
      <GlobalSearch
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
      />

      {/* AI Business Assistant — surface-aware with tool use */}
      {isAuthenticated && <AssistantWidget surface="quotation" />}
      {isAuthenticated && <BugReportForm reportedBy={user?.name || user?.email || ''} />}

      <React.Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', background: '#f9fafb' }}>
        <div style={{ fontSize: '20px', color: '#667eea', fontWeight: '600', marginBottom: '12px' }}>Loading...</div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>Please wait</div>
      </div>
    }>
      <Routes>
        {/* Public route - Login page */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/quotes" replace /> : <LoginPage />
        } />

        {/* Public route - Customer quote view via magic link */}
        <Route path="/quote/counter/:token" element={<CustomerQuoteView />} />
        <Route path="/quote/view/:token" element={<CustomerQuoteView />} />
        <Route path="/pay/:token" element={<PaymentPortal />} />
        <Route path="/customer-portal/:token" element={<EnhancedCustomerPortal />} />
        <Route path="/quote/accept/:token" element={<CustomerQuoteAcceptance />} />

        {/* TEMPORARY: Lunaris preview (no auth) */}
        <Route path="/preview/quote-editor" element={<QuotationEditorNew />} />
        <Route path="/preview/quotes-list" element={<QuotationsListNew />} />
        <Route path="/preview/leads" element={<LeadsMainNew />} />
        <Route path="/preview/lead-detail" element={<LeadDetailNew />} />
        <Route path="/preview/lead-form" element={<LeadFormNew />} />
        <Route path="/preview/customers" element={<CustomerManagementNew />} />
        <Route path="/preview/leads-analytics" element={<LeadsAnalyticsNew />} />
        <Route path="/preview/pipeline" element={<SalesPipelineDashboardNew />} />
        <Route path="/preview/pos-analytics" element={<POSAnalyticsNew />} />
        <Route path="/preview/customer-360" element={<Customer360ViewNew />} />
        <Route path="/preview/quotations-dashboard" element={<QuotationsDashboardNew />} />
        <Route path="/preview/inventory" element={<InventoryDashboardNew />} />
        <Route path="/preview/product-catalog" element={<ProductCatalogNew />} />
        <Route path="/preview/purchase-orders" element={<PurchaseOrderDashboardNew />} />
        <Route path="/preview/invoices" element={<InvoiceManagerNew />} />
        <Route path="/preview/invoice-detail" element={<InvoiceDetailNew invoiceId={1} onClose={() => {}} />} />
        <Route path="/preview/product-detail" element={<ProductDetailNew productId={1} onClose={() => {}} />} />
        <Route path="/preview/delivery-scheduler" element={<DeliverySchedulerNew />} />
        <Route path="/preview/user-management" element={<UserManagementNew />} />
        <Route path="/preview/nomenclature" element={<NomenclatureAdminNew />} />
        <Route path="/preview/monitoring" element={<MonitoringHubNew />} />
        <Route path="/preview/serial-registry" element={<SerialNumberRegistryNew />} />
        <Route path="/preview/financing" element={<CustomerFinancingNew />} />
        <Route path="/preview/data-import" element={<DataImportHubNew />} />
        <Route path="/preview/orders" element={<OrdersNew />} />
        <Route path="/preview/order-detail" element={<OrderDetailNew orderId={1} onClose={() => {}} />} />
        <Route path="/preview/order-edit" element={<OrderEditModalNew />} />
        <Route path="/preview/convert-quote" element={<ConvertToQuoteNew />} />
        <Route path="/preview/fraud-rules" element={<FraudRuleManagerNew />} />
        <Route path="/preview/order-analytics" element={<OrderAnalyticsNew />} />
        <Route path="/preview/customer-analytics" element={<CustomerAnalyticsNew />} />
        <Route path="/preview/approval-analytics" element={<ApprovalAnalyticsNew />} />
        <Route path="/preview/special-orders" element={<SpecialOrderTrackerNew />} />
        <Route path="/preview/pre-orders" element={<PreOrderManagerNew />} />
        <Route path="/preview/work-orders" element={<WorkOrderDashboardNew />} />
        <Route path="/preview/activity-timeline" element={<CustomerActivityTimelineNew />} />
        <Route path="/preview/pending-amendments" element={<PendingAmendmentsNew />} />
        <Route path="/preview/fulfillment-tracker" element={<FulfillmentTrackerNew />} />
        <Route path="/preview/lead-quick-capture" element={<LeadQuickCaptureNew />} />
        <Route path="/preview/call-log" element={<QuickActionCallNew />} />
        <Route path="/preview/email-log" element={<QuickActionEmailNew />} />
        <Route path="/preview/add-note" element={<QuickActionNoteNew />} />
        <Route path="/preview/status-change" element={<QuickActionStatusNew />} />
        <Route path="/preview/follow-up" element={<QuickActionFollowUpNew />} />
        <Route path="/preview/lost-reason" element={<LostReasonModalNew />} />
        <Route path="/preview/lead-import" element={<LeadImportStep1New />} />
        <Route path="/preview/ar-dashboard" element={<ARDashboardNew />} />
        <Route path="/preview/auto-invoice" element={<AutoInvoicePanelNew />} />
        <Route path="/preview/credit-memos" element={<CreditMemosNew />} />
        <Route path="/preview/receiving" element={<ReceivingWorkflowNew />} />
        <Route path="/preview/crm-dashboard" element={<CRMDashboardNew />} />
        <Route path="/preview/clv-dashboard" element={<CLVDashboardNew />} />
        <Route path="/preview/report-builder" element={<ReportBuilderNew />} />
        <Route path="/preview/revenue-analytics" element={<RevenueAnalyticsNew />} />
        <Route path="/preview/sales-forecast" element={<SalesForecastNew />} />
        <Route path="/preview/pipeline-analytics" element={<PipelineAnalyticsNew />} />
        <Route path="/preview/sales-pipeline-dashboard" element={<SalesPipelineDashboardNew />} />
        <Route path="/preview/leaderboard" element={<SalesLeaderboardNew />} />
        <Route path="/preview/discount-analytics" element={<DiscountAnalyticsNew />} />
        <Route path="/preview/lead-analytics" element={<LeadAnalyticsNew />} />
        <Route path="/preview/lead-source-roi" element={<LeadSourceROINew />} />
        <Route path="/preview/product-performance" element={<ProductPerformanceNew />} />
        <Route path="/preview/sales-overview" element={<SalesOverviewNew />} />
        <Route path="/preview/category-insights" element={<CategoryInsightsNew />} />
        <Route path="/preview/leads-widget" element={<LeadsWidgetNew />} />
        <Route path="/preview/fraud-detection" element={<FraudDetectionDialogNew />} />
        <Route path="/preview/fraud-dashboard" element={<FraudDashboardNew />} />
        <Route path="/preview/fraud-alerts" element={<FraudAlertPanelNew />} />
        <Route path="/preview/review-queue" element={<TransactionReviewQueueNew />} />
        <Route path="/preview/employee-fraud" element={<EmployeeFraudDashboardNew />} />
        <Route path="/preview/employee-risk" element={<EmployeeRiskDetailNew />} />
        <Route path="/preview/advanced-pricing" element={<AdvancedPricingManagerNew />} />
        <Route path="/preview/product-intelligence" element={<ProductIntelligenceNew />} />
        <Route path="/preview/recommendation-rules" element={<RecommendationRulesNew />} />
        <Route path="/preview/product-comparison" element={<ProductComparisonNew />} />
        <Route path="/preview/bulk-price-update" element={<BulkPriceUpdateNew />} />
        <Route path="/preview/ce-import" element={<CEProductImportNew />} />
        <Route path="/preview/commission-split" element={<CommissionSplitModalNew />} />
        <Route path="/preview/marketplace-overview" element={<MarketplaceOverviewNew />} />
        <Route path="/preview/seller-performance" element={<SellerPerformanceNew />} />
        <Route path="/preview/commission-report" element={<CommissionReportNew />} />
        <Route path="/preview/rule-audit-log" element={<RuleAuditLogNew />} />
        <Route path="/preview/pos-rule-audit" element={<POSRuleAuditLogNew />} />
        <Route path="/preview/edit-user" element={<EditUserModalNew />} />
        <Route path="/preview/error-detail" element={<ErrorDetailDrawerNew />} />
        <Route path="/preview/rule-editor" element={<RuleEditorDrawerNew />} />

        {/* Protected routes - wrapped in MainLayout */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/quotes" replace />} />
          <Route path="/dashboard" element={<ExecutiveDashboard />} />
          <Route path="/retail-dashboard" element={<ProtectedRoute requiredRoles={['admin', 'manager']}><StoreManagerDashboard /></ProtectedRoute>} />
          <Route path="/my-dashboard" element={<SalesRepDashboard />} />
          <Route path="/customers" element={<CustomerManagement />} />
          <Route path="/customers/:id" element={<CustomerManagement />} />
          <Route path="/products" element={<ProductManagement />} />
          <Route path="/products/detail/:id" element={<ProductDetailPage />} />
          <Route path="/products/:id" element={<ProductManagement />} />
          <Route path="/quotes" element={<QuotationManager />} />
          <Route path="/quotes/new" element={<QuotationManager />} />
          <Route path="/quotes/:id" element={<QuotationManager />} />
          <Route path="/insights" element={<InsightsHub />} />
          <Route path="/purchasing-intelligence" element={<PurchasingIntelligence />} />
          <Route path="/sales-performance" element={<SalesPerformanceHub />} />
          <Route path="/report-builder" element={<ReportBuilder />} />
          <Route path="/training-center" element={<TrainingCenter />} />
          <Route path="/marketplace/*" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <MarketplaceManager />
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <MarketplaceReports />
            </ProtectedRoute>
          } />
          <Route path="/bulk-ops" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <BulkOperationsCenter />
            </ProtectedRoute>
          } />
          <Route path="/features/*" element={<PowerFeatures2026 />} />
          <Route path="/search" element={<SearchResults />} />
          {/* Enterprise Phase 2 Routes */}
          <Route path="/orders" element={<OrdersNew />} />
          <Route path="/orders/:id" element={<OrdersNew />} />
          <Route path="/invoices" element={<InvoiceManager />} />
          <Route path="/invoices/ar" element={<ARDashboardNew />} />
          <Route path="/inventory" element={<InventoryDashboard />} />
          <Route path="/quote-expiry" element={<QuoteExpiryManager />} />
          {/* Advanced Pricing */}
          <Route path="/pricing" element={<AdvancedPricingManager />} />
          <Route path="/manufacturer-promotions" element={<ManufacturerPromotionsAdmin />} />
          {/* Product Visualization */}
          <Route path="/product-visualization" element={<ProductVisualization />} />
          <Route path="/product-visualization/:id" element={<ProductVisualization />} />
          {/* Quick Search removed — use Ctrl+K command palette */}
          {/* Leads / Inquiry Capture */}
          <Route path="/leads" element={<LeadCapture />} />
          <Route path="/leads/:id" element={<LeadCapture />} />
          {/* Admin routes */}
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="/admin/nomenclature" element={
            <ProtectedRoute requiredRoles={['admin']}>
              <NomenclatureAdmin />
            </ProtectedRoute>
          } />
          <Route path="/admin/deliveries" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <DeliveryDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/recommendations" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <RecommendationRulesPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/fraud" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <FraudDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/bugs" element={
            <ProtectedRoute requiredRoles={['admin']}>
              <BugReportsDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/monitoring" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <MonitoringHub />
            </ProtectedRoute>
          } />
          <Route path="/admin/data-import" element={
            <ProtectedRoute requiredRoles={['admin']}>
              <DataImportHub />
            </ProtectedRoute>
          } />
          <Route path="/admin/serial-numbers" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <SerialRegistry />
            </ProtectedRoute>
          } />
          <Route path="/admin/purchase-orders" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <PurchaseOrderDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/product-variants" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <VariantManager />
            </ProtectedRoute>
          } />
          <Route path="/admin/pending-amendments" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <PendingAmendments />
            </ProtectedRoute>
          } />

          {/* Lightspeed Feature Gap Routes */}
          <Route path="/inventory-counts" element={<InventoryCount />} />
          <Route path="/inventory/transfers" element={<TransferManagement />} />
          <Route path="/inventory/receiving" element={<ReceivingWorkflow />} />
          <Route path="/inventory/count-review" element={<CycleCountReview />} />
          <Route path="/work-orders" element={<WorkOrderDashboard />} />
          <Route path="/special-orders" element={<SpecialOrderTracker />} />
          <Route path="/customer-accounts" element={<CustomerAccountManager />} />
          <Route path="/pre-orders" element={<PreOrderManager />} />
          <Route path="/team-commissions" element={<TeamCommissions />} />
          <Route path="/surveys" element={<SurveyDashboard />} />
          <Route path="/catalog-exports" element={<CatalogExportManager />} />
          <Route path="/audience-sync" element={<AudienceSyncManager />} />

          {/* Institutional Buyer Workflow */}
          <Route path="/institutional/ar" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <AccountsReceivableView />
            </ProtectedRoute>
          } />
          <Route path="/institutional/:profileId" element={<InstitutionalAccountPage />} />

          {/* Dev-only routes */}
          {process.env.NODE_ENV === 'development' && CompetitorPricingDev && (
            <Route path="/dev/competitor-pricing" element={<CompetitorPricingDev />} />
          )}
          {/* 404 fallback */}
          <Route path="*" element={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>404</div>
              <div style={{ fontSize: '20px', color: '#667eea', fontWeight: '600', marginBottom: '12px' }}>Page Not Found</div>
              <NavLink to="/quotes" style={{ color: '#667eea', textDecoration: 'underline' }}>Go to Quotations</NavLink>
            </div>
          } />
        </Route>
      </Routes>
    </React.Suspense>
    </>
  );
}

// Wrap App with BrowserRouter, ErrorBoundary, AuthProvider, QuoteProvider, ProductProvider, ThemeProvider, and ToastProvider
const AppWithProviders = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <QuoteProvider>
            <ProductProvider>
              <ToastProvider position="top-right" maxToasts={5}>
                <ToastRefSetter />
                <App />
              </ToastProvider>
            </ProductProvider>
          </QuoteProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </BrowserRouter>
);

// Component to set toast ref for use outside React
const ToastRefSetter = () => {
  const toast = useToast();
  useEffect(() => {
    setToastRef(toast);
  }, [toast]);
  return null;
};

export default AppWithProviders;
