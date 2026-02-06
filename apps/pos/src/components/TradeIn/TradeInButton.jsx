/**
 * TeleTime POS - Trade-In Button Component
 * Button to trigger trade-in assessment modal, displays in cart area
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  Badge,
  Tooltip,
  Typography,
  Chip,
  Paper,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  SwapHoriz as TradeInIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Delete as RemoveIcon,
  Pending as PendingIcon,
  CheckCircle as ApprovedIcon,
} from '@mui/icons-material';
import { TradeInModal } from './TradeInModal';

// ============================================================================
// TRADE-IN BUTTON
// Displays in cart area to trigger trade-in flow
// ============================================================================

export function TradeInButton({
  cartId,
  cartTotal = 0,
  customerId,
  onTradeInApplied,
  disabled = false,
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
  };

  const handleTradeInApplied = (result) => {
    if (onTradeInApplied) {
      onTradeInApplied(result);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="secondary"
        startIcon={<TradeInIcon />}
        onClick={handleClick}
        disabled={disabled}
        fullWidth
        sx={{
          py: 1.5,
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
            bgcolor: 'secondary.50',
          },
        }}
      >
        Trade-In
      </Button>

      <TradeInModal
        open={modalOpen}
        onClose={handleClose}
        cartId={cartId}
        cartTotal={cartTotal}
        customerId={customerId}
        onTradeInApplied={handleTradeInApplied}
      />
    </>
  );
}

// ============================================================================
// TRADE-IN SUMMARY
// Shows applied trade-ins in cart
// ============================================================================

export function TradeInSummary({
  tradeIns = [],
  onRemove,
  showDetails = true,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!tradeIns || tradeIns.length === 0) return null;

  const totalValue = tradeIns.reduce((sum, ti) => sum + parseFloat(ti.final_value || 0), 0);
  const pendingApproval = tradeIns.filter((ti) => ti.requires_approval && ti.status === 'pending');

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Paper elevation={1} sx={{ mt: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'success.main',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: showDetails ? 'pointer' : 'default',
        }}
        onClick={() => showDetails && setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TradeInIcon />
          <Typography variant="subtitle2">
            Trade-In Credit
          </Typography>
          <Badge badgeContent={tradeIns.length} color="info" />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            -{formatCurrency(totalValue)}
          </Typography>
          {showDetails && (
            <IconButton size="small" sx={{ color: 'white' }}>
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Pending Approval Warning */}
      {pendingApproval.length > 0 && (
        <Box sx={{ p: 1, bgcolor: 'warning.light' }}>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PendingIcon fontSize="small" />
            {pendingApproval.length} trade-in(s) pending manager approval
          </Typography>
        </Box>
      )}

      {/* Details */}
      {showDetails && (
        <Collapse in={expanded}>
          <List dense disablePadding>
            {tradeIns.map((tradeIn, index) => (
              <ListItem
                key={tradeIn.id || index}
                divider={index < tradeIns.length - 1}
                sx={{ py: 1 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={500}>
                        {tradeIn.brand} {tradeIn.model}
                      </Typography>
                      {tradeIn.requires_approval && tradeIn.status === 'pending' && (
                        <Chip
                          label="Pending Approval"
                          size="small"
                          color="warning"
                          icon={<PendingIcon />}
                        />
                      )}
                      {tradeIn.status === 'approved' && (
                        <Chip
                          label="Approved"
                          size="small"
                          color="success"
                          icon={<ApprovedIcon />}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {tradeIn.condition_name} condition
                      {tradeIn.serial_number && ` • S/N: ${tradeIn.serial_number}`}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="success.main" fontWeight={600}>
                      -{formatCurrency(tradeIn.final_value)}
                    </Typography>
                    {onRemove && tradeIn.status !== 'applied' && (
                      <Tooltip title="Remove trade-in">
                        <IconButton
                          size="small"
                          onClick={() => onRemove(tradeIn.id)}
                          color="error"
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Collapse>
      )}
    </Paper>
  );
}

// ============================================================================
// TRADE-IN LINE ITEM
// Single trade-in display for receipt/checkout
// ============================================================================

export function TradeInLineItem({
  tradeIn,
  compact = false,
}) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (compact) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 0.5,
        }}
      >
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TradeInIcon fontSize="small" color="success" />
          Trade-In: {tradeIn.brand} {tradeIn.model}
        </Typography>
        <Typography variant="body2" color="success.main" fontWeight={600}>
          -{formatCurrency(tradeIn.final_value)}
        </Typography>
      </Box>
    );
  }

  return (
    <Paper elevation={1} sx={{ p: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TradeInIcon fontSize="small" color="success" />
            Trade-In Credit
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {tradeIn.brand} {tradeIn.model}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tradeIn.condition_name} condition
          </Typography>
        </Box>
        <Typography variant="h6" color="success.main" fontWeight={600}>
          -{formatCurrency(tradeIn.final_value)}
        </Typography>
      </Box>
    </Paper>
  );
}

export default TradeInButton;
