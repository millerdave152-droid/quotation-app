/**
 * Services Index
 * Exports all service classes for dependency injection
 */

const CustomerService = require('./CustomerService');
const QuoteService = require('./QuoteService');
const ProductService = require('./ProductService');
const PricingCalculator = require('./PricingCalculator');
const PricingService = require('./PricingService');
const TaxService = require('./TaxService');
const InventorySyncService = require('./InventorySyncService');
const CustomerPricingService = require('./CustomerPricingService');
const POSInvoiceService = require('./POSInvoiceService');
const ReceiptService = require('./ReceiptService');
const UnifiedReportingService = require('./UnifiedReportingService');
const VolumeDiscountService = require('./VolumeDiscountService');
const POSPromotionService = require('./POSPromotionService');
const PromotionEngine = require('./PromotionEngine');
const ManagerOverrideService = require('./ManagerOverrideService');
const DeliveryFulfillmentService = require('./DeliveryFulfillmentService');
const WarrantyService = require('./WarrantyService');
const RecommendationService = require('./RecommendationService');
const UpsellService = require('./UpsellService');
const FinancingService = require('./FinancingService');

module.exports = {
  CustomerService,
  QuoteService,
  ProductService,
  PricingCalculator,
  PricingService,
  TaxService,
  InventorySyncService,
  CustomerPricingService,
  POSInvoiceService,
  ReceiptService,
  UnifiedReportingService,
  VolumeDiscountService,
  POSPromotionService,
  PromotionEngine,
  ManagerOverrideService,
  DeliveryFulfillmentService,
  WarrantyService,
  RecommendationService,
  UpsellService,
  FinancingService,
};
