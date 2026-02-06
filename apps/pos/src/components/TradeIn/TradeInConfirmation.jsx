/**
 * TeleTime POS - Trade-In Confirmation Component
 * Step 4: Final review and confirmation before adding to cart
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Grid,
  Chip,
  Alert,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Card,
  CardContent,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Smartphone as DeviceIcon,
  Star as StarIcon,
  AttachMoney as MoneyIcon,
  Receipt as SerialIcon,
  SimCard as ImeiIcon,
  Note as NoteIcon,
  ShoppingCart as CartIcon,
  Cancel as CancelIcon,
  SupervisorAccount as ManagerIcon,
  TrendingDown as DiscountIcon,
  AccountBalanceWallet as CreditIcon,
} from '@mui/icons-material';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONDITION_COLORS = {
  'LN': '#4caf50',
  'EX': '#2196f3',
  'GD': '#ff9800',
  'FR': '#ffc107',
  'PR': '#f44336',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TradeInConfirmation({
  assessmentResult,
  selectedCondition,
  serialNumber,
  imei,
  conditionNotes,
  adjustmentReason,
  cartTotal = 0,
  requiresApproval,
  onConfirm,
  onCancel,
  isLoading = false,
}) {
  if (!assessmentResult) return null;

  const { calculation, product, condition } = assessmentResult;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getConditionColor = () => {
    const code = condition?.condition_code || selectedCondition?.condition_code;
    return CONDITION_COLORS[code] || '#9e9e9e';
  };

  const amountDue = Math.max(0, cartTotal - calculation.finalValue);
  const excessCredit = calculation.finalValue > cartTotal ? calculation.finalValue - cartTotal : 0;

  return (
    <Box>
      {/* Manager Approval Warning */}
      {requiresApproval && (
        <Alert
          severity="warning"
          icon={<ManagerIcon />}
          sx={{
            mb: 3,
            '& .MuiAlert-icon': { fontSize: 28 },
          }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            Manager Approval Required
          </Typography>
          <Typography variant="body2">
            Trade-in value exceeds $500.00. This assessment will require manager approval before it can be applied to the transaction.
          </Typography>
        </Alert>
      )}

      {/* Main Summary Card */}
      <Card
        elevation={6}
        sx={{
          mb: 3,
          overflow: 'visible',
          position: 'relative',
          borderRadius: 3,
        }}
      >
        {/* Value Badge */}
        <Box
          sx={{
            position: 'absolute',
            top: -20,
            right: 20,
            bgcolor: 'success.main',
            color: 'white',
            px: 3,
            py: 1.5,
            borderRadius: 2,
            boxShadow: 4,
          }}
        >
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            Trade-In Value
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {formatCurrency(calculation.finalValue)}
          </Typography>
        </Box>

        <CardContent sx={{ pt: 4 }}>
          {/* Product Info */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'grey.100',
              }}
            >
              <DeviceIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" fontWeight={700}>
                {product.brand} {product.model}
              </Typography>
              {product.variant && (
                <Chip label={product.variant} size="small" sx={{ mt: 0.5, mr: 1 }} />
              )}
              {product.isManual && (
                <Chip label="Manual Entry" size="small" color="warning" sx={{ mt: 0.5 }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Chip
                  label={condition?.condition_name || selectedCondition?.condition_name}
                  sx={{
                    bgcolor: getConditionColor(),
                    color: 'white',
                    fontWeight: 600,
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  ({Math.round(calculation.conditionMultiplier * 100)}% value)
                </Typography>
              </Box>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Calculation Breakdown */}
          <Typography variant="subtitle2" gutterBottom fontWeight={600} color="text.secondary">
            VALUE CALCULATION
          </Typography>

          <Paper elevation={0} sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2 }}>
            {/* Base Value */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="body1">Base Value</Typography>
              <Typography variant="body1" fontWeight={500}>
                {formatCurrency(calculation.baseValue)}
              </Typography>
            </Box>

            {/* Condition Multiplier */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StarIcon sx={{ fontSize: 18, color: getConditionColor() }} />
                <Typography variant="body1">
                  Condition: {condition?.condition_name || selectedCondition?.condition_name}
                </Typography>
              </Box>
              <Typography variant="body1" fontWeight={500}>
                × {calculation.conditionMultiplier.toFixed(2)}
              </Typography>
            </Box>

            {/* Custom Adjustment */}
            {calculation.adjustmentAmount !== 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DiscountIcon
                    sx={{
                      fontSize: 18,
                      color: calculation.adjustmentAmount > 0 ? 'success.main' : 'error.main',
                    }}
                  />
                  <Typography variant="body1">
                    Adjustment
                    {adjustmentReason && (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {' '}({adjustmentReason})
                      </Typography>
                    )}
                  </Typography>
                </Box>
                <Typography
                  variant="body1"
                  fontWeight={500}
                  color={calculation.adjustmentAmount > 0 ? 'success.main' : 'error.main'}
                >
                  {calculation.adjustmentAmount > 0 ? '+' : ''}
                  {formatCurrency(calculation.adjustmentAmount)}
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />

            {/* Final Value */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="h6" fontWeight={700}>
                Trade-In Value
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                {formatCurrency(calculation.finalValue)}
              </Typography>
            </Box>
          </Paper>
        </CardContent>
      </Card>

      {/* Details Card */}
      <Card elevation={2} sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom fontWeight={600} color="text.secondary">
            DEVICE DETAILS
          </Typography>

          <List dense disablePadding>
            {serialNumber && (
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <SerialIcon color="action" />
                </ListItemIcon>
                <ListItemText
                  primary="Serial Number"
                  secondary={serialNumber}
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1', fontFamily: 'monospace' }}
                />
              </ListItem>
            )}
            {imei && (
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <ImeiIcon color="action" />
                </ListItemIcon>
                <ListItemText
                  primary="IMEI"
                  secondary={imei}
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1', fontFamily: 'monospace' }}
                />
              </ListItem>
            )}
            {conditionNotes && (
              <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>
                  <NoteIcon color="action" />
                </ListItemIcon>
                <ListItemText
                  primary="Condition Notes"
                  secondary={conditionNotes}
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            )}
            {!serialNumber && !imei && !conditionNotes && (
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <InfoIcon color="action" />
                </ListItemIcon>
                <ListItemText
                  primary="No additional details provided"
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                />
              </ListItem>
            )}
          </List>
        </CardContent>
      </Card>

      {/* Cart Comparison */}
      {cartTotal > 0 && (
        <Card
          elevation={2}
          sx={{
            mb: 3,
            borderRadius: 2,
            bgcolor: 'info.50',
            border: '1px solid',
            borderColor: 'info.main',
          }}
        >
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CartIcon color="info" />
              <Typography variant="subtitle2" fontWeight={600}>
                CART SUMMARY
              </Typography>
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Paper elevation={0} sx={{ p: 1.5, textAlign: 'center', bgcolor: 'white' }}>
                  <Typography variant="caption" color="text.secondary">
                    Cart Total
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {formatCurrency(cartTotal)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper elevation={0} sx={{ p: 1.5, textAlign: 'center', bgcolor: 'success.50' }}>
                  <Typography variant="caption" color="text.secondary">
                    Trade-In
                  </Typography>
                  <Typography variant="h6" fontWeight={600} color="success.main">
                    -{formatCurrency(calculation.finalValue)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper elevation={0} sx={{ p: 1.5, textAlign: 'center', bgcolor: 'primary.50' }}>
                  <Typography variant="caption" color="text.secondary">
                    Amount Due
                  </Typography>
                  <Typography variant="h6" fontWeight={700} color="primary.main">
                    {formatCurrency(amountDue)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Excess Credit Notice */}
            {excessCredit > 0 && (
              <Alert
                severity="info"
                icon={<CreditIcon />}
                sx={{ mt: 2 }}
              >
                <Typography variant="body2">
                  Trade-in value exceeds cart total. The remaining{' '}
                  <strong>{formatCurrency(excessCredit)}</strong> can be issued as store credit.
                </Typography>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant="outlined"
          color="inherit"
          size="large"
          startIcon={<CancelIcon />}
          onClick={onCancel}
          disabled={isLoading}
          sx={{ flex: 1, py: 1.5 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color={requiresApproval ? 'warning' : 'success'}
          size="large"
          startIcon={requiresApproval ? <ManagerIcon /> : <CheckCircleIcon />}
          onClick={onConfirm}
          disabled={isLoading}
          sx={{
            flex: 2,
            py: 1.5,
            fontSize: '1.1rem',
            fontWeight: 600,
          }}
        >
          {isLoading
            ? 'Processing...'
            : requiresApproval
            ? 'Submit for Approval'
            : 'Add Trade-In to Cart'}
        </Button>
      </Box>
    </Box>
  );
}

export default TradeInConfirmation;
