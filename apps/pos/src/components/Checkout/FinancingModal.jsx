/**
 * TeleTime POS - Financing Modal Component
 * Main financing flow container with all steps
 */

import { useCallback } from 'react';
import {
  ArrowLeftIcon,
  UserCircleIcon,
  XMarkIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { useFinancing, FINANCING_STEPS } from '../../hooks/useFinancing';

// Sub-components
import { FinancingPlanCard } from './FinancingPlanCard';
import { FinancingComparison } from './FinancingComparison';
import { FinancingApplicationForm } from './FinancingApplicationForm';
import { FinancingApprovalResult } from './FinancingApprovalResult';
import { FinancingTermsAcceptance } from './FinancingTermsAcceptance';
import { FinancingSchedulePreview } from './FinancingSchedulePreview';

/**
 * Step indicator component
 */
function StepIndicator({ currentStep }) {
  const steps = [
    { key: FINANCING_STEPS.SELECT_PLAN, label: 'Select' },
    { key: FINANCING_STEPS.CUSTOMER_INFO, label: 'Apply' },
    { key: FINANCING_STEPS.APPROVAL, label: 'Approval' },
    { key: FINANCING_STEPS.CONFIRMATION, label: 'Sign' },
  ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isComplete = index < currentIndex;

        return (
          <div key={step.key} className="flex items-center">
            <div className={`
              flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium
              transition-colors duration-200
              ${isActive ? 'bg-blue-600 text-white' : ''}
              ${isComplete ? 'bg-green-500 text-white' : ''}
              ${!isActive && !isComplete ? 'bg-gray-100 text-gray-500' : ''}
            `}>
              <span className="w-4 h-4 flex items-center justify-center">
                {isComplete ? '✓' : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`
                w-8 h-0.5 mx-1
                ${index < currentIndex ? 'bg-green-500' : 'bg-gray-200'}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Plans skeleton loader
 */
function PlansSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border-2 border-gray-200 rounded-xl animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-3" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Financing modal component
 * @param {object} props
 * @param {number} props.amountDue - Amount to finance (in dollars)
 * @param {object} props.customer - Customer object
 * @param {number} props.orderId - Order ID (optional)
 * @param {function} props.onComplete - Callback when financing completed
 * @param {function} props.onCancel - Callback to cancel/close
 */
export function FinancingModal({
  amountDue,
  customer,
  orderId,
  onComplete,
  onCancel,
}) {
  const amountCents = Math.round(amountDue * 100);

  const financing = useFinancing({
    amountCents,
    customer,
    orderId,
    onComplete,
  });

  const {
    step,
    plans,
    selectedPlan,
    paymentPlan,
    comparisonPlans,
    applicationData,
    application,
    agreement,
    approvalStatus,
    approvalMessage,
    recommendedPlan,
    loading,
    calculating,
    submitting,
    error,
    selectPlan,
    addToComparison,
    clearComparison,
    updateApplicationData,
    submitApplication,
    acceptTerms,
    goBack,
    reset,
  } = financing;

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (step === FINANCING_STEPS.SELECT_PLAN) {
      onCancel?.();
    } else {
      goBack();
    }
  }, [step, goBack, onCancel]);

  // Handle cancel from approval
  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // Handle try again from declined
  const handleTryAgain = useCallback(() => {
    reset();
  }, [reset]);

  // Continue from approval to confirmation
  const handleContinueToConfirmation = useCallback(() => {
    financing.goToStep(FINANCING_STEPS.CONFIRMATION);
  }, [financing]);

  // No customer selected
  if (!customer) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Financing</h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
            <UserCircleIcon className="w-12 h-12 text-yellow-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Customer Required
          </h3>
          <p className="text-gray-500 max-w-sm">
            Please select a customer before applying for financing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button
          type="button"
          onClick={handleBack}
          disabled={submitting}
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Financing</h2>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Amount Display */}
      {step !== FINANCING_STEPS.CONFIRMATION && (
        <div className="text-center mb-4">
          <p className="text-sm text-gray-500">Financing Amount</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(amountDue)}
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && step === FINANCING_STEPS.SELECT_PLAN && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Step 1: Select Plan */}
        {step === FINANCING_STEPS.SELECT_PLAN && (
          <div className="space-y-4">
            {/* Comparison View */}
            {comparisonPlans.length > 0 && (
              <FinancingComparison
                plans={comparisonPlans}
                onRemove={(plan) => addToComparison(plan)}
                onSelect={selectPlan}
                onClose={clearComparison}
              />
            )}

            {/* Plans List */}
            {loading ? (
              <PlansSkeleton />
            ) : plans.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No financing plans available for this amount</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {plans.length} plan{plans.length !== 1 ? 's' : ''} available
                  </p>
                  {comparisonPlans.length < 3 && plans.length > 1 && (
                    <p className="text-xs text-blue-600">
                      Tap compare to compare plans
                    </p>
                  )}
                </div>

                {plans.map((plan) => (
                  <div key={plan.planId} className="relative">
                    <FinancingPlanCard
                      plan={plan}
                      selected={selectedPlan?.planId === plan.planId}
                      onSelect={selectPlan}
                      recommended={plan.planId === recommendedPlan?.planId}
                    />
                    {/* Compare button */}
                    {plans.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToComparison(plan);
                        }}
                        className={`
                          absolute top-2 right-2 p-1.5 rounded-lg text-xs font-medium
                          transition-colors
                          ${comparisonPlans.find(p => p.planId === plan.planId)
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }
                        `}
                      >
                        <ScaleIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Calculating overlay */}
            {calculating && (
              <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-10">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-600">Calculating payment plan...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Customer Info / Application */}
        {step === FINANCING_STEPS.CUSTOMER_INFO && (
          <FinancingApplicationForm
            customer={customer}
            selectedPlan={selectedPlan}
            paymentPlan={paymentPlan}
            applicationData={applicationData}
            onUpdate={updateApplicationData}
            onSubmit={submitApplication}
            onBack={handleBack}
            submitting={submitting}
          />
        )}

        {/* Step 3: Approval Result */}
        {step === FINANCING_STEPS.APPROVAL && (
          <FinancingApprovalResult
            status={approvalStatus}
            message={approvalMessage}
            application={application}
            agreement={agreement}
            paymentPlan={paymentPlan}
            onContinue={handleContinueToConfirmation}
            onTryAgain={handleTryAgain}
            onCancel={handleCancel}
          />
        )}

        {/* Step 4: Terms & Signature */}
        {step === FINANCING_STEPS.CONFIRMATION && (
          <FinancingTermsAcceptance
            agreement={agreement}
            paymentPlan={paymentPlan}
            customer={customer}
            onAccept={acceptTerms}
            onBack={handleBack}
            submitting={submitting}
          />
        )}

        {/* Complete */}
        {step === FINANCING_STEPS.COMPLETE && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Financing Complete!</h2>
            <p className="text-gray-600">Your order has been processed with financing.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default FinancingModal;
