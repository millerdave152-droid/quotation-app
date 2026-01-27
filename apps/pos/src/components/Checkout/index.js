/**
 * TeleTime POS - Checkout Components
 * Centralized exports for checkout/payment components
 */

export { CheckoutModal } from './CheckoutModal';
export { PaymentMethods } from './PaymentMethods';
export { CashPayment } from './CashPayment';
export { CardPayment } from './CardPayment';
export { SplitPayment } from './SplitPayment';
export { PaymentComplete } from './PaymentComplete';
export { ManagerApprovalModal } from './ManagerApprovalModal';
export { ManagerApprovalProvider, useManagerApprovalContext } from './ManagerApprovalProvider';
export { FulfillmentSelector } from './FulfillmentSelector';
export { DeliveryAddressForm } from './DeliveryAddressForm';
export { SchedulePicker } from './SchedulePicker';
export { WarrantyUpsell } from './WarrantyUpsell';
export { WarrantyUpsellModal } from './WarrantyUpsellModal';
export { WarrantyOptionCard } from './WarrantyOptionCard';

// Default export as namespace
import { CheckoutModal } from './CheckoutModal';
import { PaymentMethods } from './PaymentMethods';
import { CashPayment } from './CashPayment';
import { CardPayment } from './CardPayment';
import { SplitPayment } from './SplitPayment';
import { PaymentComplete } from './PaymentComplete';
import { ManagerApprovalModal } from './ManagerApprovalModal';
import { ManagerApprovalProvider, useManagerApprovalContext } from './ManagerApprovalProvider';
import { FulfillmentSelector } from './FulfillmentSelector';
import { DeliveryAddressForm } from './DeliveryAddressForm';
import { SchedulePicker } from './SchedulePicker';
import { WarrantyUpsell } from './WarrantyUpsell';
import { WarrantyUpsellModal } from './WarrantyUpsellModal';
import { WarrantyOptionCard } from './WarrantyOptionCard';

export default {
  CheckoutModal,
  PaymentMethods,
  CashPayment,
  CardPayment,
  SplitPayment,
  PaymentComplete,
  ManagerApprovalModal,
  ManagerApprovalProvider,
  useManagerApprovalContext,
  FulfillmentSelector,
  DeliveryAddressForm,
  SchedulePicker,
  WarrantyUpsell,
  WarrantyUpsellModal,
  WarrantyOptionCard,
};
