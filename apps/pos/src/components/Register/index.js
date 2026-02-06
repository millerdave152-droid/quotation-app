/**
 * TeleTime POS - Register Components
 * Centralized exports for register management components
 */

export { RegisterSelect } from './RegisterSelect';
export { OpenRegister } from './OpenRegister';
export { ShiftSummary, ShiftSummaryCompact, ShiftSummaryPanel } from './ShiftSummary';
export { CloseRegister } from './CloseRegister';
export { ShiftReport, PrintableShiftReport } from './ShiftReport';

// Default export as namespace
import { RegisterSelect } from './RegisterSelect';
import { OpenRegister } from './OpenRegister';
import { ShiftSummary, ShiftSummaryCompact, ShiftSummaryPanel } from './ShiftSummary';
import { CloseRegister } from './CloseRegister';
import { ShiftReport, PrintableShiftReport } from './ShiftReport';

export default {
  RegisterSelect,
  OpenRegister,
  ShiftSummary,
  ShiftSummaryCompact,
  ShiftSummaryPanel,
  CloseRegister,
  ShiftReport,
  PrintableShiftReport,
};
