/**
 * TeleTime POS - Trade-In Details Component
 * Step 3: Serial number, calculated value, notes, and photos
 */

import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  Grid,
  Divider,
  IconButton,
  Button,
  Chip,
  Card,
  CardContent,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Alert,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  Delete as DeleteIcon,
  QrCodeScanner as ScanIcon,
  Info as InfoIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as ValueIcon,
  TrendingDown as DeductionIcon,
  Note as NoteIcon,
  PhotoLibrary as PhotoIcon,
  Add as AddIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TradeInDetails({
  product,
  condition,
  isManualEntry,
  manualProduct,
  // Serial/IMEI
  serialNumber,
  onSerialNumberChange,
  imei,
  onImeiChange,
  // Value
  baseValue,
  conditionMultiplier,
  customAdjustment,
  onCustomAdjustmentChange,
  adjustmentReason,
  onAdjustmentReasonChange,
  // Notes
  internalNotes,
  onInternalNotesChange,
  // Photos
  photos = [],
  onPhotosChange,
  // Validation
  requiresSerial = false,
  requiresImei = false,
  imeiError = null,
}) {
  const fileInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Calculate values
  const effectiveBaseValue = isManualEntry
    ? parseFloat(manualProduct?.estimatedValue) || 0
    : parseFloat(baseValue) || 0;

  const multiplier = parseFloat(conditionMultiplier) || 1;
  const adjustment = parseFloat(customAdjustment) || 0;
  const assessedValue = effectiveBaseValue * multiplier;
  const finalValue = Math.max(0, assessedValue + adjustment);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Photo handling
  const handlePhotoUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setUploadingPhoto(true);

    try {
      // Convert files to base64 for preview (in production, upload to server)
      const newPhotos = await Promise.all(
        files.map(async (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                id: Date.now() + Math.random(),
                url: reader.result,
                name: file.name,
                type: file.type,
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );

      onPhotosChange([...photos, ...newPhotos]);
    } catch (err) {
      console.error('Photo upload error:', err);
    } finally {
      setUploadingPhoto(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (photoId) => {
    onPhotosChange(photos.filter((p) => p.id !== photoId));
  };

  const productName = isManualEntry
    ? `${manualProduct?.brand} ${manualProduct?.model}`
    : `${product?.brand} ${product?.model}`;

  return (
    <Box>
      {/* Product & Condition Summary */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          mb: 3,
          background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
          borderRadius: 2,
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">
              Product
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>
              {productName}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">
              Condition
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>
              {condition?.condition_name} ({Math.round(multiplier * 100)}%)
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Live Value Calculator */}
      <Card
        elevation={4}
        sx={{
          mb: 3,
          borderRadius: 2,
          bgcolor: 'success.50',
          border: '2px solid',
          borderColor: 'success.main',
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <MoneyIcon color="success" />
            <Typography variant="h6" fontWeight={600} color="success.dark">
              Calculated Trade-In Value
            </Typography>
          </Box>

          {/* Value Breakdown */}
          <Box sx={{ bgcolor: 'white', p: 2, borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Base Value
              </Typography>
              <Typography variant="body1">
                {formatCurrency(effectiveBaseValue)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                × Condition ({condition?.condition_name})
              </Typography>
              <Typography variant="body1">
                {formatCurrency(assessedValue)}
              </Typography>
            </Box>

            {adjustment !== 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {adjustment > 0 ? (
                    <ValueIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  ) : (
                    <DeductionIcon sx={{ fontSize: 16, color: 'error.main' }} />
                  )}
                  <Typography
                    variant="body2"
                    color={adjustment > 0 ? 'success.main' : 'error.main'}
                  >
                    Adjustment
                  </Typography>
                </Box>
                <Typography
                  variant="body1"
                  color={adjustment > 0 ? 'success.main' : 'error.main'}
                >
                  {adjustment > 0 ? '+' : ''}
                  {formatCurrency(adjustment)}
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" fontWeight={700}>
                Trade-In Value
              </Typography>
              <Typography variant="h4" fontWeight={700} color="success.main">
                {formatCurrency(finalValue)}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Serial Number & IMEI */}
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Device Identification
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={requiresSerial ? 'Serial Number *' : 'Serial Number (Optional)'}
            value={serialNumber}
            onChange={(e) => onSerialNumberChange(e.target.value)}
            placeholder="Enter device serial number"
            error={requiresSerial && !serialNumber}
            helperText={
              requiresSerial && !serialNumber
                ? 'Required for this product type'
                : 'Usually found in Settings > About'
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Scan serial number (coming soon)">
                    <IconButton edge="end" disabled>
                      <ScanIcon />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={requiresImei ? 'IMEI *' : 'IMEI (Optional)'}
            value={imei}
            onChange={(e) => onImeiChange(e.target.value)}
            placeholder="15-digit IMEI number"
            error={!!imeiError || (requiresImei && !imei)}
            helperText={
              imeiError ||
              (requiresImei && !imei
                ? 'Required for phones'
                : 'Dial *#06# to find IMEI')
            }
            inputProps={{ maxLength: 17 }}
            InputProps={{
              endAdornment: imei && !imeiError && (
                <InputAdornment position="end">
                  <CheckIcon color="success" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
      </Grid>

      {/* Value Adjustment */}
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Value Adjustment (Optional)
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Adjustment Amount"
            value={customAdjustment}
            onChange={(e) => onCustomAdjustmentChange(e.target.value)}
            type="number"
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            helperText="Use negative for deductions"
            placeholder="0.00"
          />
        </Grid>

        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label="Reason for Adjustment"
            value={adjustmentReason}
            onChange={(e) => onAdjustmentReasonChange(e.target.value)}
            placeholder="e.g., Missing charger, bonus promo, damaged accessories"
            disabled={!customAdjustment || customAdjustment === '0'}
          />
        </Grid>
      </Grid>

      {/* Internal Notes */}
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        <NoteIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
        Internal Notes
      </Typography>

      <TextField
        fullWidth
        multiline
        rows={3}
        value={internalNotes}
        onChange={(e) => onInternalNotesChange(e.target.value)}
        placeholder="Staff notes about this trade-in (not shown to customer)..."
        sx={{ mb: 3 }}
      />

      {/* Photo Upload */}
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        <PhotoIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
        Device Photos (Optional)
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Photos help document device condition for records and disputes.
        </Typography>
      </Alert>

      <Box sx={{ mb: 2 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoUpload}
          style={{ display: 'none' }}
          id="trade-in-photo-upload"
        />

        <Button
          variant="outlined"
          startIcon={uploadingPhoto ? <CircularProgress size={20} /> : <CameraIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          sx={{ mr: 1 }}
        >
          {uploadingPhoto ? 'Uploading...' : 'Add Photos'}
        </Button>

        {photos.length > 0 && (
          <Chip
            label={`${photos.length} photo${photos.length > 1 ? 's' : ''}`}
            color="primary"
            size="small"
          />
        )}
      </Box>

      {/* Photo Preview Grid */}
      {photos.length > 0 && (
        <ImageList cols={4} gap={8} sx={{ mb: 2 }}>
          {photos.map((photo) => (
            <ImageListItem
              key={photo.id}
              sx={{
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <img
                src={photo.url}
                alt={photo.name}
                loading="lazy"
                style={{
                  height: 100,
                  objectFit: 'cover',
                }}
              />
              <ImageListItemBar
                sx={{ background: 'rgba(0,0,0,0.6)' }}
                position="top"
                actionIcon={
                  <IconButton
                    size="small"
                    sx={{ color: 'white' }}
                    onClick={() => handleRemovePhoto(photo.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
                actionPosition="right"
              />
            </ImageListItem>
          ))}
        </ImageList>
      )}

      {/* Validation Warnings */}
      {(requiresSerial && !serialNumber) || (requiresImei && !imei) ? (
        <Alert severity="warning" icon={<WarningIcon />}>
          <Typography variant="body2">
            Please fill in all required fields before proceeding.
          </Typography>
        </Alert>
      ) : null}
    </Box>
  );
}

export default TradeInDetails;
