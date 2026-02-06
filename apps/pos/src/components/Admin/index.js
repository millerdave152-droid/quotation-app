/**
 * TeleTime POS - Admin Components
 * Centralized exports for admin/configuration components
 */

export { ThresholdConfig } from './ThresholdConfig';
export { ApprovalRulesPage } from './ApprovalRulesPage';
export { ApprovalRuleModal } from './ApprovalRuleModal';
export { ApprovalLevelConfig } from './ApprovalLevelConfig';
export { RuleAuditLog } from './RuleAuditLog';
export { default as BatchEmailSettings } from './BatchEmailSettings';

// Default export as namespace
import { ThresholdConfig } from './ThresholdConfig';
import { ApprovalRulesPage } from './ApprovalRulesPage';
import { ApprovalRuleModal } from './ApprovalRuleModal';
import { ApprovalLevelConfig } from './ApprovalLevelConfig';
import { RuleAuditLog } from './RuleAuditLog';
import BatchEmailSettings from './BatchEmailSettings';

export default {
  ThresholdConfig,
  ApprovalRulesPage,
  ApprovalRuleModal,
  ApprovalLevelConfig,
  RuleAuditLog,
  BatchEmailSettings,
};
