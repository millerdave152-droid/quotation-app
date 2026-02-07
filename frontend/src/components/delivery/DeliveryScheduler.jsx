import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  LocalShipping,
  CalendarMonth,
  AccessTime,
  LocationOn,
  Person,
  Phone,
  Notes,
  ChevronLeft,
  ChevronRight,
  Check,
  Warning,
  Block
} from '@mui/icons-material';
import apiClient from '../../services/apiClient';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '-';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

const SlotCard = ({ slot, selected, onSelect, disabled }) => {
  const availableSpots = slot.capacity - slot.booked;
  const capacityPercent = (slot.booked / slot.capacity) * 100;
  const isAvailable = availableSpots > 0 && !slot.is_blocked;

  return (
    <Card
      variant={selected ? 'elevation' : 'outlined'}
      sx={{
        cursor: isAvailable && !disabled ? 'pointer' : 'not-allowed',
        bgcolor: selected ? 'primary.light' : slot.is_blocked ? 'grey.200' : 'white',
        opacity: isAvailable ? 1 : 0.6,
        transition: 'all 0.2s',
        '&:hover': isAvailable && !disabled ? { transform: 'translateY(-2px)', boxShadow: 2 } : {}
      }}
      onClick={() => isAvailable && !disabled && onSelect(slot)}
    >
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {formatTime(slot.slot_start)} - {formatTime(slot.slot_end)}
          </Typography>
          {slot.is_blocked ? (
            <Chip icon={<Block />} label="Blocked" size="small" color="error" />
          ) : (
            <Chip
              label={`${availableSpots} left`}
              size="small"
              color={availableSpots <= 2 ? 'warning' : 'success'}
            />
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={capacityPercent}
          color={capacityPercent >= 80 ? 'warning' : 'primary'}
          sx={{ height: 6, borderRadius: 1 }}
        />
        {slot.is_blocked && slot.block_reason && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
            {slot.block_reason}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

const DeliveryScheduler = ({ orderId, quotationId, customerId, onBookingComplete, initialPostalCode = '' }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [lookingUpZone, setLookingUpZone] = useState(false);

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });

  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    deliveryAddress: '',
    deliveryInstructions: '',
    contactPhone: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchZones();
  }, []);

  useEffect(() => {
    if (selectedZone) {
      fetchSlots();
    }
  }, [selectedZone, currentWeekStart]);

  const fetchZones = async () => {
    try {
      const response = await apiClient.get(`${API_BASE}/delivery/zones`);
      setZones(response.data);
    } catch (err) {
      console.error('Error fetching zones:', err);
    }
  };

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const endDate = new Date(currentWeekStart);
      endDate.setDate(endDate.getDate() + 6);

      const response = await apiClient.get(`${API_BASE}/delivery/slots`, {
        params: {
          zoneId: selectedZone.id,
          startDate: currentWeekStart.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      });
      setSlots(response.data);
    } catch (err) {
      console.error('Error fetching slots:', err);
      setError('Failed to load delivery slots');
    } finally {
      setLoading(false);
    }
  };

  const handlePostalCodeLookup = async () => {
    if (!postalCode || postalCode.length < 3) return;

    try {
      setLookingUpZone(true);
      setError(null);

      // Look up zone by postal code
      const response = await apiClient.get(`${API_BASE}/delivery/zones/lookup`, {
        params: { postalCode: postalCode.replace(/\s/g, '').toUpperCase() }
      });

      if (response.data) {
        setSelectedZone(response.data);
      } else {
        setError('No delivery zone found for this postal code');
      }
    } catch (err) {
      console.error('Error looking up zone:', err);
      setError(err.response?.data?.error || 'Could not find delivery zone for this postal code');
    } finally {
      setLookingUpZone(false);
    }
  };

  const handleWeekChange = (direction) => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + (direction * 7));

    // Don't allow going to past weeks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) return;

    setCurrentWeekStart(newDate);
    setSelectedSlot(null);
  };

  const handleSlotSelect = (slot) => {
    setSelectedSlot(slot);
  };

  const handleBookingSubmit = async () => {
    if (!selectedSlot) return;

    try {
      setSubmitting(true);
      setError(null);

      const bookingData = {
        slotId: selectedSlot.id,
        orderId,
        quotationId,
        customerId,
        ...bookingForm
      };

      const response = await apiClient.post(`${API_BASE}/delivery/bookings`, bookingData);

      setBookingDialogOpen(false);
      if (onBookingComplete) {
        onBookingComplete(response.data);
      }
    } catch (err) {
      console.error('Error creating booking:', err);
      setError(err.response?.data?.error || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  // Group slots by date
  const slotsByDate = slots.reduce((acc, slot) => {
    const date = slot.slot_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {});

  // Generate week days
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(currentWeekStart);
    day.setDate(day.getDate() + i);
    weekDays.push(day.toISOString().split('T')[0]);
  }

  return (
    <Box>
      {/* Postal Code Lookup */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
          <LocationOn sx={{ mr: 1 }} /> Delivery Location
        </Typography>

        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Postal Code"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
              placeholder="M5V 2T6"
              helperText="Enter postal code to find delivery zone"
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Button
              fullWidth
              variant="contained"
              onClick={handlePostalCodeLookup}
              disabled={lookingUpZone || !postalCode}
            >
              {lookingUpZone ? <CircularProgress size={24} /> : 'Find Zone'}
            </Button>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel>Or Select Zone</InputLabel>
              <Select
                value={selectedZone?.id || ''}
                label="Or Select Zone"
                onChange={(e) => {
                  const zone = zones.find(z => z.id === e.target.value);
                  setSelectedZone(zone);
                }}
              >
                {zones.map((zone) => (
                  <MenuItem key={zone.id} value={zone.id}>
                    {zone.zone_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {selectedZone && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
              Zone: {selectedZone.zone_name}
            </Typography>
            <Typography variant="body2">
              Base Delivery Fee: {formatCurrency(selectedZone.base_delivery_fee_cents)}
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* Calendar View */}
      {selectedZone && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <CalendarMonth sx={{ mr: 1 }} /> Select Delivery Slot
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={() => handleWeekChange(-1)}>
                <ChevronLeft />
              </IconButton>
              <Typography variant="subtitle1" sx={{ minWidth: 200, textAlign: 'center' }}>
                Week of {formatDate(currentWeekStart)}
              </Typography>
              <IconButton onClick={() => handleWeekChange(1)}>
                <ChevronRight />
              </IconButton>
            </Box>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={2}>
              {weekDays.map((date) => {
                const daySlots = slotsByDate[date] || [];
                const dayDate = new Date(date + 'T00:00:00');
                const isPast = dayDate < new Date().setHours(0, 0, 0, 0);

                return (
                  <Grid item xs={12} sm={6} md={12 / 7} key={date}>
                    <Box sx={{
                      textAlign: 'center',
                      mb: 1,
                      opacity: isPast ? 0.5 : 1
                    }}>
                      <Typography variant="caption" color="text.secondary">
                        {dayDate.toLocaleDateString('en-CA', { weekday: 'short' })}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                        {dayDate.getDate()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {daySlots.length > 0 ? (
                        daySlots.map((slot) => (
                          <SlotCard
                            key={slot.id}
                            slot={slot}
                            selected={selectedSlot?.id === slot.id}
                            onSelect={handleSlotSelect}
                            disabled={isPast}
                          />
                        ))
                      ) : (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ textAlign: 'center', p: 2 }}
                        >
                          No slots
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          )}

          {/* Selected Slot Summary */}
          {selectedSlot && (
            <Box sx={{ mt: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    Selected: {formatDate(selectedSlot.slot_date)}
                  </Typography>
                  <Typography variant="body2">
                    {formatTime(selectedSlot.slot_start)} - {formatTime(selectedSlot.slot_end)}
                  </Typography>
                </Grid>
                <Grid item>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setBookingDialogOpen(true)}
                    startIcon={<Check />}
                  >
                    Book This Slot
                  </Button>
                </Grid>
              </Grid>
            </Box>
          )}
        </Paper>
      )}

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onClose={() => setBookingDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <LocalShipping sx={{ mr: 1, verticalAlign: 'middle' }} />
          Confirm Delivery Booking
        </DialogTitle>
        <DialogContent>
          {selectedSlot && (
            <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2">Delivery Slot</Typography>
              <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                {formatDate(selectedSlot.slot_date)} | {formatTime(selectedSlot.slot_start)} - {formatTime(selectedSlot.slot_end)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Zone: {selectedZone?.zone_name} | Fee: {formatCurrency(selectedZone?.base_delivery_fee_cents)}
              </Typography>
            </Box>
          )}

          <TextField
            fullWidth
            label="Delivery Address"
            value={bookingForm.deliveryAddress}
            onChange={(e) => setBookingForm({ ...bookingForm, deliveryAddress: e.target.value })}
            multiline
            rows={2}
            sx={{ mb: 2 }}
            required
          />

          <TextField
            fullWidth
            label="Contact Phone"
            value={bookingForm.contactPhone}
            onChange={(e) => setBookingForm({ ...bookingForm, contactPhone: e.target.value })}
            sx={{ mb: 2 }}
            required
          />

          <TextField
            fullWidth
            label="Delivery Instructions (Optional)"
            value={bookingForm.deliveryInstructions}
            onChange={(e) => setBookingForm({ ...bookingForm, deliveryInstructions: e.target.value })}
            multiline
            rows={2}
            placeholder="e.g., Gate code, parking instructions, specific delivery notes..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBookingDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleBookingSubmit}
            disabled={submitting || !bookingForm.deliveryAddress || !bookingForm.contactPhone}
          >
            {submitting ? <CircularProgress size={24} /> : 'Confirm Booking'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeliveryScheduler;
