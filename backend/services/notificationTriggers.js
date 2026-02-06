/**
 * notificationTriggers.js
 * Registers event listeners that fire template-based notifications.
 * Also runs the 6 PM day-before delivery reminder cron job.
 */

const cron = require('node-cron');
const eventEmitter = require('./eventEmitter');
const notificationService = require('./NotificationTriggerService');
const pool = require('../db');

// ---- Helpers ----

function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return `$${num.toFixed(2)}`;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${formatDate(d)} at ${formatTime(d)}`;
}

function formatAddress(booking) {
  const parts = [booking.delivery_address, booking.delivery_city, booking.delivery_postal_code].filter(Boolean);
  return parts.join(', ') || 'Address on file';
}

async function getCustomer(customerId) {
  const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [customerId]);
  return rows[0] || null;
}

async function getOrder(orderId) {
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE transaction_id = $1', [orderId]
  );
  return rows[0] || null;
}

async function getOrderByDelivery(deliveryId) {
  // delivery_bookings has order_id which maps to transactions.transaction_id
  const { rows } = await pool.query(
    `SELECT t.* FROM transactions t
     JOIN delivery_bookings db ON db.order_id = t.transaction_id
     WHERE db.id = $1`, [deliveryId]
  );
  return rows[0] || null;
}

async function getOrderItemsSummary(transactionId) {
  const { rows } = await pool.query(
    `SELECT ti.product_name, ti.quantity, ti.unit_price
     FROM transaction_items ti
     WHERE ti.transaction_id = $1`, [transactionId]
  );
  if (!rows.length) return 'See your receipt for item details.';
  return rows.map(r => `• ${r.product_name} x${r.quantity} — ${formatCurrency(r.unit_price)}`).join('\n');
}

async function getDeliveryBooking(deliveryId) {
  const { rows } = await pool.query('SELECT * FROM delivery_bookings WHERE id = $1', [deliveryId]);
  return rows[0] || null;
}

// ---- Event Handlers ----

// Order confirmed
eventEmitter.on('order.confirmed', async (data) => {
  try {
    const order = data.order || data;
    const customerId = order.customer_id;
    if (!customerId) return;

    const customer = await getCustomer(customerId);
    if (!customer) return;

    const orderItems = await getOrderItemsSummary(order.transaction_id || order.id);
    const firstName = (customer.name || '').split(' ')[0] || 'Customer';

    await notificationService.send('order_confirmation', customer.id, {
      customer_name: firstName,
      order_number: order.transaction_number || order.order_number || `#${order.transaction_id}`,
      order_total: formatCurrency(order.total_amount),
      order_items: orderItems,
      store_phone: process.env.STORE_PHONE || '416-555-1234'
    }, {
      related_type: 'order',
      related_id: order.transaction_id || order.id,
      event_name: 'order.confirmed'
    });
  } catch (err) {
    console.error('[Trigger] order.confirmed error:', err.message);
  }
});

// Delivery scheduled
eventEmitter.on('delivery.scheduled', async (data) => {
  try {
    const delivery = data.delivery || data;
    const order = await getOrderByDelivery(delivery.id);
    const customerId = delivery.customer_id || order?.customer_id;
    if (!customerId) return;

    const customer = await getCustomer(customerId);
    if (!customer) return;

    const firstName = (customer.name || '').split(' ')[0] || 'Customer';
    const window = [delivery.scheduled_start, delivery.scheduled_end].filter(Boolean).join(' - ') || 'TBD';

    await notificationService.send('delivery_scheduled', customer.id, {
      customer_name: firstName,
      delivery_date: formatDate(delivery.scheduled_date || delivery.delivery_date),
      delivery_window: window,
      delivery_address: formatAddress(delivery),
      order_number: order?.transaction_number || ''
    }, {
      related_type: 'delivery',
      related_id: delivery.id,
      event_name: 'delivery.scheduled'
    });
  } catch (err) {
    console.error('[Trigger] delivery.scheduled error:', err.message);
  }
});

// Delivery reminder (day before, SMS)
eventEmitter.on('delivery.reminder_due', async (data) => {
  try {
    const delivery = data.delivery || data;
    const order = await getOrderByDelivery(delivery.id);
    const customerId = delivery.customer_id || order?.customer_id;
    if (!customerId) return;

    const customer = await getCustomer(customerId);
    if (!customer) return;

    const window = [delivery.scheduled_start, delivery.scheduled_end].filter(Boolean).join(' - ') || 'TBD';

    await notificationService.send('delivery_reminder', customer.id, {
      delivery_date: formatDate(delivery.scheduled_date || delivery.delivery_date),
      delivery_window: window
    }, {
      related_type: 'delivery',
      related_id: delivery.id,
      event_name: 'delivery.reminder_due'
    });
  } catch (err) {
    console.error('[Trigger] delivery.reminder_due error:', err.message);
  }
});

// Driver en route
eventEmitter.on('delivery.driver_enroute', async (data) => {
  try {
    const { delivery, driver, stopsAway, eta } = data;
    if (!delivery) return;

    const order = await getOrderByDelivery(delivery.id);
    const customerId = delivery.customer_id || order?.customer_id;
    if (!customerId) return;

    const customer = await getCustomer(customerId);
    if (!customer) return;

    const trackingCode = delivery.booking_number || delivery.id;
    const trackingLink = `${process.env.TRACKING_BASE_URL || 'https://teletime.ca/track'}/${trackingCode}`;

    await notificationService.send('driver_enroute', customer.id, {
      eta_time: eta ? formatTime(eta) : 'Soon',
      tracking_link: trackingLink,
      driver_name: driver?.name || driver?.first_name || 'Your driver',
      stops_away: stopsAway != null ? String(stopsAway) : ''
    }, {
      related_type: 'delivery',
      related_id: delivery.id,
      event_name: 'delivery.driver_enroute'
    });
  } catch (err) {
    console.error('[Trigger] delivery.driver_enroute error:', err.message);
  }
});

// Delivery completed
eventEmitter.on('delivery.completed', async (data) => {
  try {
    const delivery = data.delivery || data;
    const order = await getOrderByDelivery(delivery.id);
    const customerId = delivery.customer_id || order?.customer_id;
    if (!customerId) return;

    const customer = await getCustomer(customerId);
    if (!customer) return;

    const firstName = (customer.name || '').split(' ')[0] || 'Customer';
    const orderNumber = order?.transaction_number || '';
    const feedbackLink = `${process.env.FEEDBACK_BASE_URL || 'https://teletime.ca/feedback'}/${orderNumber || delivery.id}`;

    await notificationService.send('delivery_complete', customer.id, {
      customer_name: firstName,
      order_number: orderNumber,
      delivery_time: formatDateTime(delivery.completed_at || delivery.actual_arrival || new Date()),
      feedback_link: feedbackLink
    }, {
      related_type: 'delivery',
      related_id: delivery.id,
      event_name: 'delivery.completed'
    });
  } catch (err) {
    console.error('[Trigger] delivery.completed error:', err.message);
  }
});

// ---- Cron: Day-before delivery reminders at 6 PM ----

function startReminderCron() {
  cron.schedule('0 18 * * *', async () => {
    try {
      console.log('[NotificationCron] Checking for tomorrow deliveries...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const { rows } = await pool.query(
        `SELECT * FROM delivery_bookings
         WHERE (scheduled_date = $1 OR delivery_date::date = $1)
           AND status IN ('scheduled', 'confirmed')`,
        [tomorrowStr]
      );

      console.log(`[NotificationCron] Found ${rows.length} deliveries for tomorrow (${tomorrowStr})`);
      for (const delivery of rows) {
        eventEmitter.emit('delivery.reminder_due', { delivery });
      }
    } catch (err) {
      console.error('[NotificationCron] Reminder job error:', err.message);
    }
  }, { timezone: 'America/Toronto' });

  console.log('✅ Delivery reminder cron scheduled (daily 6 PM ET)');
}

// ---- Module Exports ----

module.exports = {
  startReminderCron,
  eventEmitter,
  // Re-export for convenience
  emit: (event, data) => eventEmitter.emit(event, data)
};
