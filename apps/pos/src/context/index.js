/**
 * TeleTime POS - Context Providers
 * Centralized exports for React context providers
 */

// Auth context
export { AuthProvider, useAuth } from './AuthContext';
export { default as AuthContext } from './AuthContext';

// Cart context
export { CartProvider, useCartContext } from './CartContext';
export { default as CartContext } from './CartContext';

// Register context
export { RegisterProvider, useRegister } from './RegisterContext';
export { default as RegisterContext } from './RegisterContext';

// Volume pricing context
export {
  VolumeProvider,
  useVolumeContext,
  useVolumeContextOptional,
} from './VolumeContext';
export { default as VolumeContext } from './VolumeContext';

// Commission context
export { CommissionProvider, useCommissionContext } from './CommissionContext';
export { default as CommissionContext } from './CommissionContext';
