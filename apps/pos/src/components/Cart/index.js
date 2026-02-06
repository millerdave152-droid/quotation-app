/**
 * TeleTime POS - Cart Components
 * Centralized exports for cart components
 */

export { Cart } from './Cart';
export { CartItem } from './CartItem';
export { CartTotals } from './CartTotals';
export { CartActions } from './CartActions';
export { CustomerBadge } from './CustomerBadge';
export { HeldTransactions } from './HeldTransactions';

// Volume pricing components
export { CartItemWithVolume } from './CartItemWithVolume';
export { CartTotalsWithVolume } from './CartTotalsWithVolume';
export { CartWithVolume } from './CartWithVolume';
export { VolumeDiscountBadge, VolumePriceDisplay } from './VolumeDiscountBadge';
export { VolumeTierTooltip, NextTierPrompt } from './VolumeTierTooltip';

// Default export as namespace
import { Cart } from './Cart';
import { CartItem } from './CartItem';
import { CartTotals } from './CartTotals';
import { CartActions } from './CartActions';
import { CustomerBadge } from './CustomerBadge';
import { HeldTransactions } from './HeldTransactions';
import { CartItemWithVolume } from './CartItemWithVolume';
import { CartTotalsWithVolume } from './CartTotalsWithVolume';
import { CartWithVolume } from './CartWithVolume';
import { VolumeDiscountBadge, VolumePriceDisplay } from './VolumeDiscountBadge';
import { VolumeTierTooltip, NextTierPrompt } from './VolumeTierTooltip';

export default {
  Cart,
  CartItem,
  CartTotals,
  CartActions,
  CustomerBadge,
  HeldTransactions,
  // Volume pricing
  CartItemWithVolume,
  CartTotalsWithVolume,
  CartWithVolume,
  VolumeDiscountBadge,
  VolumePriceDisplay,
  VolumeTierTooltip,
  NextTierPrompt,
};
