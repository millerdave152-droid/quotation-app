/**
 * TeleTime POS - useFinancing Hook
 * Manages financing flow state and API interactions
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Financing flow steps
 */
export const FINANCING_STEPS = {
  SELECT_PLAN: 'select_plan',
  CUSTOMER_INFO: 'customer_info',
  APPROVAL: 'approval',
  CONFIRMATION: 'confirmation',
  COMPLETE: 'complete',
};

/**
 * useFinancing hook
 * @param {object} options
 * @param {number} options.amountCents - Amount to finance in cents
 * @param {object} options.customer - Customer object
 * @param {number} options.orderId - Order ID (optional)
 * @param {function} options.onComplete - Callback when financing completed
 */
export function useFinancing({
  amountCents,
  customer,
  orderId,
  onComplete,
}) {
  // Flow state
  const [step, setStep] = useState(FINANCING_STEPS.SELECT_PLAN);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentPlan, setPaymentPlan] = useState(null);
  const [comparisonPlans, setComparisonPlans] = useState([]);

  // Application state
  const [applicationData, setApplicationData] = useState({});
  const [application, setApplication] = useState(null);
  const [agreement, setAgreement] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Approval state
  const [approvalStatus, setApprovalStatus] = useState(null); // 'approved', 'declined', 'pending', 'more_info'
  const [approvalMessage, setApprovalMessage] = useState(null);

  // Terms acceptance
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signature, setSignature] = useState(null);

  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch available plans
  const fetchPlans = useCallback(async () => {
    if (!amountCents) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ amount: amountCents.toString() });
      if (customer?.id) {
        params.append('customerId', customer.id.toString());
      }

      const response = await fetch(`${API_BASE}/financing/plans?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      const data = await response.json();

      // Check if component is still mounted before updating state
      if (!isMountedRef.current) return;

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch financing plans');
      }

      setPlans(data.data.plans || []);

      if (!data.data.customerEligible && data.data.customerMessage) {
        setError(data.data.customerMessage);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('[useFinancing] Fetch plans error:', err);
      setError(err.message);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [amountCents, customer?.id]);

  // Initial fetch
  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Calculate payment plan for selected option
  const calculatePlan = useCallback(async (plan) => {
    if (!plan || !amountCents) return null;

    try {
      setCalculating(true);
      setError(null);

      const response = await fetch(
        `${API_BASE}/financing/plans/${plan.planId}/calculate?amount=${amountCents}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to calculate payment plan');
      }

      return data.data;
    } catch (err) {
      console.error('[useFinancing] Calculate error:', err);
      setError(err.message);
      return null;
    } finally {
      setCalculating(false);
    }
  }, [amountCents]);

  // Select a plan and move to next step
  const selectPlan = useCallback(async (plan) => {
    setSelectedPlan(plan);
    const calculatedPlan = await calculatePlan(plan);
    if (calculatedPlan) {
      setPaymentPlan(calculatedPlan);
      setStep(FINANCING_STEPS.CUSTOMER_INFO);
    }
  }, [calculatePlan]);

  // Add plan to comparison
  const addToComparison = useCallback(async (plan) => {
    if (comparisonPlans.find(p => p.planId === plan.planId)) {
      // Remove from comparison
      setComparisonPlans(prev => prev.filter(p => p.planId !== plan.planId));
      return;
    }

    if (comparisonPlans.length >= 3) {
      // Max 3 plans in comparison
      return;
    }

    const calculatedPlan = await calculatePlan(plan);
    if (calculatedPlan) {
      setComparisonPlans(prev => [...prev, { ...plan, calculated: calculatedPlan }]);
    }
  }, [comparisonPlans, calculatePlan]);

  // Clear comparison
  const clearComparison = useCallback(() => {
    setComparisonPlans([]);
  }, []);

  // Update application data
  const updateApplicationData = useCallback((data) => {
    setApplicationData(prev => ({ ...prev, ...data }));
  }, []);

  // Submit application
  const submitApplication = useCallback(async () => {
    if (!selectedPlan || !customer?.id) {
      setError('Missing required information');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setStep(FINANCING_STEPS.APPROVAL);

      const response = await fetch(`${API_BASE}/financing/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({
          planId: selectedPlan.planId,
          customerId: customer.id,
          amountCents,
          orderId,
          applicationData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      setApplication(data.data);

      // Determine approval status
      if (data.data.success && data.data.provider === 'internal') {
        setApprovalStatus('approved');
        setApprovalMessage('Your financing has been approved!');
        setAgreement({
          agreementId: data.data.agreementId,
          agreementNumber: data.data.agreementNumber,
          monthlyPayment: data.data.monthlyPayment,
          firstPaymentDate: data.data.firstPaymentDate,
        });
      } else if (data.data.requiresRedirect) {
        setApprovalStatus('pending');
        setApprovalMessage('Please complete your application with the financing provider.');
      } else if (!data.data.success) {
        setApprovalStatus('declined');
        setApprovalMessage(data.data.declineReason || 'Unable to approve financing at this time.');
      } else {
        setApprovalStatus('pending');
        setApprovalMessage('Your application is being reviewed.');
      }
    } catch (err) {
      console.error('[useFinancing] Submit error:', err);
      setError(err.message);
      setApprovalStatus('error');
      setApprovalMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedPlan, customer?.id, amountCents, orderId, applicationData]);

  // Accept terms and complete
  const acceptTerms = useCallback(async (signatureData) => {
    if (!agreement || !signatureData) {
      setError('Please sign to accept terms');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSignature(signatureData);
      setTermsAccepted(true);

      // In production, would save signature to agreement
      // For now, just complete the flow

      setStep(FINANCING_STEPS.COMPLETE);

      // Notify parent
      onComplete?.({
        paymentMethod: 'financing',
        amount: amountCents / 100,
        financingPlanId: selectedPlan.planId,
        financingApplicationId: application.applicationId,
        financingAgreementId: agreement.agreementId,
        agreementNumber: agreement.agreementNumber,
        monthlyPayment: agreement.monthlyPayment,
        provider: application.provider || 'internal',
        signature: signatureData,
      });
    } catch (err) {
      console.error('[useFinancing] Accept terms error:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [agreement, selectedPlan, application, amountCents, onComplete]);

  // Navigate steps
  const goToStep = useCallback((newStep) => {
    setError(null);
    setStep(newStep);
  }, []);

  const goBack = useCallback(() => {
    setError(null);
    switch (step) {
      case FINANCING_STEPS.CUSTOMER_INFO:
        setStep(FINANCING_STEPS.SELECT_PLAN);
        break;
      case FINANCING_STEPS.APPROVAL:
        setStep(FINANCING_STEPS.CUSTOMER_INFO);
        break;
      case FINANCING_STEPS.CONFIRMATION:
        // Can't go back from confirmation after approval
        break;
      default:
        break;
    }
  }, [step]);

  // Reset flow
  const reset = useCallback(() => {
    setStep(FINANCING_STEPS.SELECT_PLAN);
    setSelectedPlan(null);
    setPaymentPlan(null);
    setComparisonPlans([]);
    setApplicationData({});
    setApplication(null);
    setAgreement(null);
    setApprovalStatus(null);
    setApprovalMessage(null);
    setTermsAccepted(false);
    setSignature(null);
    setError(null);
  }, []);

  // Find recommended plan
  const recommendedPlan = useMemo(() => {
    if (plans.length === 0) return null;
    return plans.reduce((best, plan) => {
      if (!best) return plan;
      if (plan.interestRate === 0 && best.interestRate > 0) return plan;
      if (plan.interestRate === 0 && best.interestRate === 0) {
        return plan.termMonths > best.termMonths ? plan : best;
      }
      return plan.interestRate < best.interestRate ? plan : best;
    }, null);
  }, [plans]);

  // Can proceed to next step
  const canProceed = useMemo(() => {
    switch (step) {
      case FINANCING_STEPS.SELECT_PLAN:
        return selectedPlan !== null;
      case FINANCING_STEPS.CUSTOMER_INFO:
        return customer?.id && selectedPlan;
      case FINANCING_STEPS.APPROVAL:
        return approvalStatus === 'approved';
      case FINANCING_STEPS.CONFIRMATION:
        return termsAccepted && signature;
      default:
        return false;
    }
  }, [step, selectedPlan, customer?.id, approvalStatus, termsAccepted, signature]);

  return {
    // State
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
    termsAccepted,
    signature,
    recommendedPlan,
    canProceed,

    // Loading states
    loading,
    calculating,
    submitting,
    error,

    // Actions
    fetchPlans,
    selectPlan,
    addToComparison,
    clearComparison,
    updateApplicationData,
    submitApplication,
    acceptTerms,
    goToStep,
    goBack,
    reset,
    setError,
  };
}

export default useFinancing;
