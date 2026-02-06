-- ============================================================================
-- Migration 084: Notification Template Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push')),

  subject VARCHAR(500),
  body TEXT NOT NULL,

  available_variables JSONB,

  is_active BOOLEAN DEFAULT true,
  requires_consent BOOLEAN DEFAULT true,
  consent_type VARCHAR(30),

  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_code ON notification_templates(code);
CREATE INDEX IF NOT EXISTS idx_notification_templates_channel ON notification_templates(channel);

-- Seed default templates
INSERT INTO notification_templates (code, name, channel, subject, body, available_variables, consent_type) VALUES
('order_confirmation', 'Order Confirmation', 'email',
 'Your TeleTime Order #{{order_number}} is Confirmed',
 E'Hi {{customer_name}},\n\nThank you for your order!\n\nOrder #: {{order_number}}\nTotal: {{order_total}}\n\n{{order_items}}\n\nWe will contact you to schedule delivery.\n\nTeleTime',
 '["customer_name", "order_number", "order_total", "order_items", "store_phone"]',
 'email_transactional'),

('delivery_scheduled', 'Delivery Scheduled', 'email',
 'Your TeleTime Delivery is Scheduled for {{delivery_date}}',
 E'Hi {{customer_name}},\n\nYour delivery is scheduled!\n\nDate: {{delivery_date}}\nTime Window: {{delivery_window}}\n\nDelivery Address:\n{{delivery_address}}\n\nWe will send you a reminder the day before.\n\nTeleTime',
 '["customer_name", "delivery_date", "delivery_window", "delivery_address", "order_number"]',
 'email_transactional'),

('delivery_reminder', 'Delivery Reminder', 'sms',
 NULL,
 E'TeleTime: Reminder - Your delivery is tomorrow {{delivery_date}} between {{delivery_window}}. Reply HELP for assistance.',
 '["delivery_date", "delivery_window"]',
 'sms_transactional'),

('driver_enroute', 'Driver En Route', 'sms',
 NULL,
 E'TeleTime: Your driver is on the way! ETA: {{eta_time}}. Track: {{tracking_link}}',
 '["eta_time", "tracking_link", "driver_name", "stops_away"]',
 'sms_transactional'),

('delivery_complete', 'Delivery Complete', 'email',
 'Your TeleTime Delivery is Complete',
 E'Hi {{customer_name}},\n\nYour order has been delivered!\n\nOrder #: {{order_number}}\nDelivered: {{delivery_time}}\n\nThank you for shopping with TeleTime.\n\nPlease take a moment to rate your experience: {{feedback_link}}',
 '["customer_name", "order_number", "delivery_time", "feedback_link"]',
 'email_transactional')
ON CONFLICT (code) DO NOTHING;
