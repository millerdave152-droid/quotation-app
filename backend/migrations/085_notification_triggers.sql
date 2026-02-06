-- ============================================================================
-- Migration 085: Notification Triggers & Sent Log Enhancement
-- ============================================================================

-- Enhance notification_log for template-based notifications
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS template_code VARCHAR(100);
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS channel VARCHAR(20);
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(50);
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS related_type VARCHAR(50);
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS related_id INTEGER;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS variables JSONB;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS event_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_notification_log_customer ON notification_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_template ON notification_log(template_code);
CREATE INDEX IF NOT EXISTS idx_notification_log_related ON notification_log(related_type, related_id);

-- Trigger configuration table — which events are enabled
CREATE TABLE IF NOT EXISTS notification_trigger_config (
  id SERIAL PRIMARY KEY,
  event_name VARCHAR(100) UNIQUE NOT NULL,
  template_code VARCHAR(100) REFERENCES notification_templates(code),
  is_enabled BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed trigger config for the 5 default templates
INSERT INTO notification_trigger_config (event_name, template_code, description) VALUES
('order.confirmed',         'order_confirmation',  'Send order confirmation email when transaction is completed'),
('delivery.scheduled',      'delivery_scheduled',  'Send delivery details email when delivery is booked'),
('delivery.reminder_due',   'delivery_reminder',   'Send SMS reminder at 6 PM the day before delivery'),
('delivery.driver_enroute', 'driver_enroute',      'Send SMS when driver starts heading to customer'),
('delivery.completed',      'delivery_complete',   'Send delivery completion email with feedback link')
ON CONFLICT (event_name) DO NOTHING;
