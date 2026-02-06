/**
 * TeleTime POS - Condition Selector Component
 * Step 2: Visual touch-friendly condition assessment with checklists
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Grid,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Paper,
  Divider,
  Collapse,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Star as StarIcon,
  StarHalf as StarHalfIcon,
  StarBorder as StarBorderIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  BatteryFull as BatteryIcon,
  ScreenRotation as ScreenIcon,
  Camera as CameraIcon,
  Power as PowerIcon,
  Cable as CableIcon,
  Memory as MemoryIcon,
} from '@mui/icons-material';

// ============================================================================
// CONSTANTS
// ============================================================================

// Color themes for each condition grade
const CONDITION_THEMES = {
  'LN': {
    bg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
    border: '#4caf50',
    text: '#2e7d32',
    icon: '#4caf50',
    stars: 5,
    label: 'Premium',
  },
  'EX': {
    bg: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
    border: '#2196f3',
    text: '#1565c0',
    icon: '#2196f3',
    stars: 4,
    label: 'Great',
  },
  'GD': {
    bg: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
    border: '#ff9800',
    text: '#e65100',
    icon: '#ff9800',
    stars: 3,
    label: 'Average',
  },
  'FR': {
    bg: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
    border: '#ffc107',
    text: '#ff8f00',
    icon: '#ffc107',
    stars: 2,
    label: 'Below Avg',
  },
  'PR': {
    bg: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
    border: '#f44336',
    text: '#c62828',
    icon: '#f44336',
    stars: 1,
    label: 'Low',
  },
};

// Default condition checklist items
const DEFAULT_CHECKLIST = [
  { id: 'powers_on', label: 'Powers On', icon: PowerIcon, required: true },
  { id: 'screen_intact', label: 'Screen Intact (No Cracks)', icon: ScreenIcon, required: true },
  { id: 'battery_health', label: 'Battery Holds Charge', icon: BatteryIcon, required: false },
  { id: 'buttons_work', label: 'All Buttons Work', icon: MemoryIcon, required: false },
  { id: 'camera_works', label: 'Camera Functions', icon: CameraIcon, required: false },
  { id: 'accessories', label: 'Original Accessories Included', icon: CableIcon, required: false },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ConditionSelector({
  conditions = [],
  selectedCondition,
  onConditionSelect,
  conditionNotes,
  onConditionNotesChange,
  checklist = {},
  onChecklistChange,
  productName = 'Product',
}) {
  const [expandedCard, setExpandedCard] = useState(null);
  const [localChecklist, setLocalChecklist] = useState(checklist);

  // Sync local checklist with parent
  useEffect(() => {
    setLocalChecklist(checklist);
  }, [checklist]);

  // Auto-expand selected card
  useEffect(() => {
    if (selectedCondition) {
      setExpandedCard(selectedCondition.id);
    }
  }, [selectedCondition]);

  const getTheme = (code) => {
    return CONDITION_THEMES[code] || {
      bg: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      border: '#9e9e9e',
      text: '#616161',
      icon: '#9e9e9e',
      stars: 0,
      label: '',
    };
  };

  const renderStars = (count) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      if (i < count) {
        stars.push(
          <StarIcon key={i} sx={{ fontSize: 20, color: '#ffc107' }} />
        );
      } else {
        stars.push(
          <StarBorderIcon key={i} sx={{ fontSize: 20, color: '#e0e0e0' }} />
        );
      }
    }
    return stars;
  };

  const handleConditionClick = (condition) => {
    onConditionSelect(condition);
    setExpandedCard(condition.id);
  };

  const handleChecklistToggle = (itemId) => {
    const newChecklist = {
      ...localChecklist,
      [itemId]: !localChecklist[itemId],
    };
    setLocalChecklist(newChecklist);
    if (onChecklistChange) {
      onChecklistChange(newChecklist);
    }
  };

  const getChecklistItems = (condition) => {
    // Use condition-specific checklist if available, otherwise default
    if (condition.checklist && Array.isArray(condition.checklist) && condition.checklist.length > 0) {
      return condition.checklist.map((item, idx) => ({
        id: `custom_${idx}`,
        label: item,
        icon: InfoIcon,
        required: false,
      }));
    }
    return DEFAULT_CHECKLIST;
  };

  const calculateValuePercentage = (multiplier) => {
    return Math.round(parseFloat(multiplier) * 100);
  };

  return (
    <Box>
      {/* Product Being Assessed */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          mb: 3,
          background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
          borderRadius: 2,
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Assessing Condition For:
        </Typography>
        <Typography variant="h6" fontWeight={600}>
          {productName}
        </Typography>
      </Paper>

      {/* Condition Selection Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Select Condition Grade
        </Typography>
        <Tooltip title="Tap a condition card to select, then verify the checklist">
          <IconButton size="small" sx={{ ml: 1 }}>
            <InfoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Condition Cards Grid */}
      <Grid container spacing={2}>
        {conditions.map((condition) => {
          const theme = getTheme(condition.condition_code);
          const isSelected = selectedCondition?.id === condition.id;
          const isExpanded = expandedCard === condition.id;
          const valuePercent = calculateValuePercentage(condition.value_multiplier);

          return (
            <Grid item xs={12} sm={6} key={condition.id}>
              <Card
                elevation={isSelected ? 8 : 2}
                sx={{
                  cursor: 'pointer',
                  border: `3px solid ${isSelected ? theme.border : 'transparent'}`,
                  borderRadius: 3,
                  overflow: 'visible',
                  transition: 'all 0.3s ease',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  '&:hover': {
                    borderColor: theme.border,
                    transform: 'scale(1.02)',
                    boxShadow: 6,
                  },
                  '&:active': {
                    transform: 'scale(0.98)',
                  },
                  position: 'relative',
                }}
                onClick={() => handleConditionClick(condition)}
              >
                {/* Selected Badge */}
                {isSelected && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -12,
                      right: -12,
                      bgcolor: theme.border,
                      borderRadius: '50%',
                      p: 0.5,
                      boxShadow: 2,
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 28, color: 'white' }} />
                  </Box>
                )}

                {/* Card Header with Gradient */}
                <Box
                  sx={{
                    background: theme.bg,
                    p: 2,
                    borderRadius: '12px 12px 0 0',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography
                        variant="h5"
                        sx={{
                          color: theme.text,
                          fontWeight: 700,
                          letterSpacing: '-0.5px',
                        }}
                      >
                        {condition.condition_name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                        {renderStars(theme.stars)}
                      </Box>
                    </Box>
                    <Chip
                      label={`${valuePercent}%`}
                      sx={{
                        bgcolor: theme.border,
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '1rem',
                        height: 36,
                        px: 1,
                      }}
                    />
                  </Box>
                </Box>

                {/* Card Body */}
                <CardContent sx={{ pt: 2 }}>
                  {/* Value Bar */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Value Retention
                      </Typography>
                      <Typography variant="caption" fontWeight={600} sx={{ color: theme.text }}>
                        {theme.label}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={valuePercent}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: 'grey.200',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: theme.border,
                          borderRadius: 4,
                        },
                      }}
                    />
                  </Box>

                  {/* Criteria Description */}
                  <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40 }}>
                    {condition.condition_criteria || 'Standard condition grade'}
                  </Typography>

                  {/* Expand Button */}
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                    <Chip
                      label={isExpanded ? 'Hide Checklist' : 'View Checklist'}
                      size="small"
                      icon={isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCard(isExpanded ? null : condition.id);
                      }}
                      sx={{ cursor: 'pointer' }}
                    />
                  </Box>
                </CardContent>

                {/* Expanded Checklist */}
                <Collapse in={isExpanded && isSelected}>
                  <Divider />
                  <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                      Condition Checklist
                    </Typography>
                    <FormGroup>
                      {getChecklistItems(condition).map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <FormControlLabel
                            key={item.id}
                            control={
                              <Checkbox
                                checked={localChecklist[item.id] || false}
                                onChange={() => handleChecklistToggle(item.id)}
                                sx={{
                                  '&.Mui-checked': { color: theme.border },
                                }}
                              />
                            }
                            label={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <ItemIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                <Typography variant="body2">
                                  {item.label}
                                  {item.required && (
                                    <Typography component="span" color="error" sx={{ ml: 0.5 }}>*</Typography>
                                  )}
                                </Typography>
                              </Box>
                            }
                            sx={{
                              py: 0.5,
                              mx: 0,
                              bgcolor: localChecklist[item.id] ? 'success.50' : 'transparent',
                              borderRadius: 1,
                              transition: 'background 0.2s',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          />
                        );
                      })}
                    </FormGroup>
                  </Box>
                </Collapse>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Condition Notes */}
      {selectedCondition && (
        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            label="Additional Condition Notes"
            value={conditionNotes}
            onChange={(e) => onConditionNotesChange(e.target.value)}
            multiline
            rows={3}
            placeholder="Describe any specific damage, scratches, dents, or issues with the device..."
            helperText="Be specific about any defects for accurate valuation"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'white',
              },
            }}
          />
        </Box>
      )}

      {/* Warning for required checklist items */}
      {selectedCondition && (
        <Collapse in={!localChecklist.powers_on || !localChecklist.screen_intact}>
          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mt: 2 }}
          >
            <Typography variant="body2">
              <strong>Note:</strong> Items that don't power on or have cracked screens typically qualify for "Poor" condition at most.
            </Typography>
          </Alert>
        </Collapse>
      )}
    </Box>
  );
}

export default ConditionSelector;
