-- Migration 115: Messaging hub tables
-- MessagingHub polls channel messages, supports auto-reply templates, and tracks response times.

CREATE TABLE IF NOT EXISTS marketplace_messages (
  id            SERIAL PRIMARY KEY,
  channel_id    INTEGER REFERENCES marketplace_channels(id),
  order_id      INTEGER REFERENCES marketplace_orders(id),
  thread_id     VARCHAR(100),
  direction     VARCHAR(10) NOT NULL,             -- INBOUND, OUTBOUND
  sender_type   VARCHAR(20),                      -- CUSTOMER, SELLER, OPERATOR
  sender_name   VARCHAR(255),
  subject       VARCHAR(500),
  body          TEXT NOT NULL,
  read_at       TIMESTAMP,
  replied_at    TIMESTAMP,
  auto_replied  BOOLEAN DEFAULT false,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id                SERIAL PRIMARY KEY,
  template_name     VARCHAR(100) NOT NULL,
  trigger_event     VARCHAR(50),                  -- ORDER_SHIPPED, RETURN_APPROVED, DELIVERY_ESTIMATE, null = manual
  subject_template  VARCHAR(500),
  body_template     TEXT NOT NULL,
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_messages_thread ON marketplace_messages(channel_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_mp_messages_order ON marketplace_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_mp_messages_unread ON marketplace_messages(read_at) WHERE read_at IS NULL AND direction = 'INBOUND';
CREATE INDEX IF NOT EXISTS idx_mp_messages_created ON marketplace_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger ON message_templates(trigger_event) WHERE active = true;

-- Seed default templates
INSERT INTO message_templates (template_name, trigger_event, subject_template, body_template) VALUES
('Order Shipped', 'ORDER_SHIPPED',
 'Your order #{order_id} has shipped!',
 'Hi {customer_name},

Your order #{order_id} has shipped and is on its way! You can track it here: {tracking_url}

Estimated delivery: {delivery_date}

Thank you for your purchase!
TeleTime'),
('Return Approved', 'RETURN_APPROVED',
 'Your return for order #{order_id} is approved',
 'Hi {customer_name},

We have approved your return request for order #{order_id}. Please ship the item(s) to:

{return_address}

Once received, your refund will be processed within 3-5 business days.

Thank you,
TeleTime'),
('General Response', NULL,
 'Re: {subject}',
 'Hi {customer_name},

Thank you for reaching out. {body}

Best regards,
TeleTime Customer Support')
ON CONFLICT DO NOTHING;
