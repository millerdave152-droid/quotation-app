/**
 * TeleTime POS - Trade-In Assessment Modal
 * Multi-step modal for processing customer trade-ins
 * Uses modular step components for each phase
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Modal,
  Typography,
  IconButton,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  CheckCircle as CheckCircleIcon,
  SwapHoriz as TradeInIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material';

// Import step components
import { TradeInProductSearch } from './TradeInProductSearch';
import { ConditionSelector } from './ConditionSelector';
import { TradeInDetails } from './TradeInDetails';
import { TradeInConfirmation } from './TradeInConfirmation';

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS = ['Find Product', 'Assess Condition', 'Enter Details', 'Confirm'];

const API_BASE = '/api/trade-in';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TradeInModal({
  open,
  onClose,
  cartId,
  cartTotal = 0,
  customerId,
  onTradeInApplied,
}) {
  // Step management
  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Product search state
  const [categories, setCategories] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualProduct, setManualProduct] = useState({
    brand: '',
    model: '',
    description: '',
    estimatedValue: '',
  });

  // Step 2: Condition state
  const [conditions, setConditions] = useState([]);
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [conditionNotes, setConditionNotes] = useState('');
  const [checklist, setChecklist] = useState({});

  // Step 3: Details state
  const [serialNumber, setSerialNumber] = useState('');
  const [imei, setImei] = useState('');
  const [imeiError, setImeiError] = useState(null);
  const [customAdjustment, setCustomAdjustment] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [photos, setPhotos] = useState([]);

  // Step 4: Assessment result
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [requiresApproval, setRequiresApproval] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchConditions();
    }
  }, [open]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/categories`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load categories');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  const FALLBACK_CONDITIONS = [
    { id: 1, condition_code: 'LN', condition_name: 'Like New', value_multiplier: 0.85, condition_criteria: 'Item is in near-perfect condition with minimal signs of use' },
    { id: 2, condition_code: 'GD', condition_name: 'Good', value_multiplier: 0.65, condition_criteria: 'Item works perfectly with minor cosmetic wear' },
    { id: 3, condition_code: 'FR', condition_name: 'Fair', value_multiplier: 0.40, condition_criteria: 'Item is functional but shows noticeable wear or minor issues' },
    { id: 4, condition_code: 'PR', condition_name: 'Poor', value_multiplier: 0.15, condition_criteria: 'Item has significant wear or functional issues' },
  ];

  const fetchConditions = async () => {
    try {
      const response = await fetch(`${API_BASE}/conditions`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load conditions');
      const data = await response.json();
      const loaded = data.conditions || [];
      setConditions(loaded.length > 0 ? loaded : FALLBACK_CONDITIONS);
    } catch (err) {
      console.error('Error loading conditions:', err);
      setConditions(FALLBACK_CONDITIONS);
    }
  };

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateStep = () => {
    setError(null);

    switch (activeStep) {
      case 0: // Product selection
        if (!selectedProduct && !isManualEntry) {
          setError('Please select a product or choose manual entry');
          return false;
        }
        if (isManualEntry && (!manualProduct.brand || !manualProduct.model)) {
          setError('Please enter brand and model for manual entry');
          return false;
        }
        return true;

      case 1: // Condition assessment
        if (!selectedCondition) {
          setError('Please select a condition grade');
          return false;
        }
        return true;

      case 2: // Details
        const product = isManualEntry ? null : selectedProduct;
        if (product?.requires_serial && !serialNumber) {
          setError('Serial number is required for this product');
          return false;
        }
        if (product?.requires_imei && !imei) {
          setError('IMEI is required for this product');
          return false;
        }
        if (imeiError) {
          setError('Please correct the IMEI format');
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  // Validate IMEI on change
  useEffect(() => {
    if (!imei) {
      setImeiError(null);
      return;
    }

    const cleanIMEI = imei.replace(/\D/g, '');
    if (cleanIMEI.length > 0 && cleanIMEI.length !== 15) {
      setImeiError('IMEI must be exactly 15 digits');
    } else if (cleanIMEI.length === 15) {
      // Luhn check
      let sum = 0;
      let isEven = false;
      for (let i = cleanIMEI.length - 1; i >= 0; i--) {
        let digit = parseInt(cleanIMEI[i], 10);
        if (isEven) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
      }
      if (sum % 10 !== 0) {
        setImeiError('Invalid IMEI checksum');
      } else {
        setImeiError(null);
      }
    } else {
      setImeiError(null);
    }
  }, [imei]);

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================

  const handleNext = async () => {
    if (!validateStep()) return;

    if (activeStep === 2) {
      // Perform assessment before moving to confirmation
      await performAssessment();
    } else if (activeStep === 3) {
      // Final confirmation - create assessment
      await createAssessment();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    if (activeStep === 3) {
      setAssessmentResult(null);
    }
    setActiveStep((prev) => prev - 1);
  };

  const performAssessment = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isManualEntry) {
        // Calculate locally for manual entry
        const baseValue = parseFloat(manualProduct.estimatedValue) || 0;
        const multiplier = parseFloat(selectedCondition.value_multiplier);
        const adjustment = parseFloat(customAdjustment) || 0;
        const assessedValue = Math.max(0, (baseValue * multiplier) + adjustment);
        const needsApproval = assessedValue > 500;

        setAssessmentResult({
          calculation: {
            baseValue,
            conditionMultiplier: multiplier,
            adjustmentAmount: adjustment,
            assessedValue: baseValue * multiplier,
            finalValue: assessedValue,
          },
          product: {
            brand: manualProduct.brand,
            model: manualProduct.model,
            description: manualProduct.description,
            isManual: true,
          },
          condition: selectedCondition,
          requiresManagerApproval: needsApproval,
        });
        setRequiresApproval(needsApproval);
        setActiveStep(3);
      } else {
        // API assessment for known products
        const response = await fetch(`${API_BASE}/assess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: selectedProduct.id,
            conditionId: selectedCondition.id,
            serialNumber: serialNumber || undefined,
            imei: imei || undefined,
            customAdjustment: parseFloat(customAdjustment) || 0,
            adjustmentReason: adjustmentReason || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Assessment failed');
        }

        const result = await response.json();
        setAssessmentResult(result);
        setRequiresApproval(result.requiresManagerApproval);
        setActiveStep(3);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createAssessment = async () => {
    setLoading(true);
    setError(null);

    try {
      const assessmentData = {
        productId: isManualEntry ? null : selectedProduct.id,
        customBrand: isManualEntry ? manualProduct.brand : undefined,
        customModel: isManualEntry ? manualProduct.model : undefined,
        customDescription: isManualEntry ? manualProduct.description : undefined,
        serialNumber: serialNumber || undefined,
        imei: imei || undefined,
        conditionId: selectedCondition.id,
        conditionNotes: conditionNotes || undefined,
        adjustmentAmount: parseFloat(customAdjustment) || 0,
        adjustmentReason: adjustmentReason || undefined,
        customerId: customerId || undefined,
        internalNotes: internalNotes || undefined,
      };

      const response = await fetch(`${API_BASE}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessmentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create assessment');
      }

      const result = await response.json();

      // If cart provided and doesn't need approval, apply to cart
      if (cartId && !result.assessment.requires_approval) {
        await applyToCart(result.assessment.id);
      } else {
        if (onTradeInApplied) {
          onTradeInApplied({
            assessment: result.assessment,
            requiresApproval: result.assessment.requires_approval,
          });
        }
        handleClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyToCart = async (assessmentId) => {
    try {
      const response = await fetch(`${API_BASE}/assessments/${assessmentId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to apply trade-in');
      }

      const result = await response.json();

      if (onTradeInApplied) {
        onTradeInApplied({
          assessment: result.assessment,
          applied: true,
        });
      }

      handleClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleClose = () => {
    // Reset all state
    setActiveStep(0);
    setSelectedProduct(null);
    setIsManualEntry(false);
    setManualProduct({ brand: '', model: '', description: '', estimatedValue: '' });
    setSelectedCondition(null);
    setConditionNotes('');
    setChecklist({});
    setSerialNumber('');
    setImei('');
    setImeiError(null);
    setCustomAdjustment('');
    setAdjustmentReason('');
    setInternalNotes('');
    setPhotos([]);
    setAssessmentResult(null);
    setRequiresApproval(false);
    setError(null);
    onClose();
  };

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setIsManualEntry(false);
  };

  const handleManualEntry = () => {
    setSelectedProduct(null);
    setIsManualEntry(true);
  };

  // ============================================================================
  // STEP CONTENT
  // ============================================================================

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <TradeInProductSearch
            categories={categories}
            onProductSelect={handleProductSelect}
            onManualEntry={handleManualEntry}
            selectedProduct={selectedProduct}
            isManualEntry={isManualEntry}
            manualProduct={manualProduct}
            onManualProductChange={setManualProduct}
          />
        );

      case 1:
        return (
          <ConditionSelector
            conditions={conditions}
            selectedCondition={selectedCondition}
            onConditionSelect={setSelectedCondition}
            conditionNotes={conditionNotes}
            onConditionNotesChange={setConditionNotes}
            checklist={checklist}
            onChecklistChange={setChecklist}
            productName={
              isManualEntry
                ? `${manualProduct.brand} ${manualProduct.model}`
                : `${selectedProduct?.brand} ${selectedProduct?.model}`
            }
          />
        );

      case 2:
        return (
          <TradeInDetails
            product={selectedProduct}
            condition={selectedCondition}
            isManualEntry={isManualEntry}
            manualProduct={manualProduct}
            serialNumber={serialNumber}
            onSerialNumberChange={setSerialNumber}
            imei={imei}
            onImeiChange={setImei}
            imeiError={imeiError}
            baseValue={selectedProduct?.base_value}
            conditionMultiplier={selectedCondition?.value_multiplier}
            customAdjustment={customAdjustment}
            onCustomAdjustmentChange={setCustomAdjustment}
            adjustmentReason={adjustmentReason}
            onAdjustmentReasonChange={setAdjustmentReason}
            internalNotes={internalNotes}
            onInternalNotesChange={setInternalNotes}
            photos={photos}
            onPhotosChange={setPhotos}
            requiresSerial={selectedProduct?.requires_serial}
            requiresImei={selectedProduct?.requires_imei}
          />
        );

      case 3:
        return (
          <TradeInConfirmation
            assessmentResult={assessmentResult}
            selectedCondition={selectedCondition}
            serialNumber={serialNumber}
            imei={imei}
            conditionNotes={conditionNotes}
            adjustmentReason={adjustmentReason}
            cartTotal={cartTotal}
            requiresApproval={requiresApproval}
            onConfirm={handleNext}
            onCancel={handleClose}
            isLoading={loading}
          />
        );

      default:
        return null;
    }
  };

  const isNextDisabled = () => {
    if (loading) return true;
    if (activeStep === 0 && !selectedProduct && !isManualEntry) return true;
    if (activeStep === 1 && !selectedCondition) return true;
    return false;
  };

  const getNextButtonText = () => {
    if (loading) return 'Processing...';
    if (activeStep === 2) return 'Calculate Value';
    if (activeStep === 3) return requiresApproval ? 'Submit for Approval' : 'Add to Cart';
    return 'Next';
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Modal open={open} onClose={handleClose}>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: { xs: '95%', sm: '90%', md: 800 },
          maxHeight: '90vh',
          bgcolor: 'background.paper',
          borderRadius: 3,
          boxShadow: 24,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TradeInIcon sx={{ fontSize: 28 }} />
            <Typography variant="h5" fontWeight={600}>
              Trade-In Assessment
            </Typography>
          </Box>
          <IconButton onClick={handleClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Stepper */}
        <Box sx={{ px: 3, pt: 2, pb: 1, bgcolor: 'grey.50' }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((label, index) => (
              <Step key={label} completed={index < activeStep}>
                <StepLabel
                  sx={{
                    '& .MuiStepLabel-label': {
                      fontWeight: index === activeStep ? 600 : 400,
                    },
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Content */}
        <Box sx={{ p: 3, overflow: 'auto', flexGrow: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {renderStepContent()}
        </Box>

        {/* Footer - Only show for steps 0-2 */}
        {activeStep < 3 && (
          <Box
            sx={{
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'space-between',
              bgcolor: 'grey.50',
            }}
          >
            <Button
              onClick={activeStep === 0 ? handleClose : handleBack}
              startIcon={activeStep === 0 ? <CloseIcon /> : <ArrowBackIcon />}
              disabled={loading}
              sx={{ minWidth: 120 }}
            >
              {activeStep === 0 ? 'Cancel' : 'Back'}
            </Button>

            <Button
              variant="contained"
              onClick={handleNext}
              endIcon={
                loading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : activeStep === 2 ? (
                  <CalculateIcon />
                ) : (
                  <ArrowForwardIcon />
                )
              }
              disabled={isNextDisabled()}
              sx={{
                minWidth: 160,
                py: 1.25,
                fontSize: '1rem',
              }}
            >
              {getNextButtonText()}
            </Button>
          </Box>
        )}
      </Box>
    </Modal>
  );
}

export default TradeInModal;
