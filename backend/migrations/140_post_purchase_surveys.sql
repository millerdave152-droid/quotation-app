-- Migration 140: Post-Purchase Survey & Review System

CREATE TABLE IF NOT EXISTS survey_templates (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(200) NOT NULL,
  trigger_event VARCHAR(50) NOT NULL CHECK (trigger_event IN ('purchase', 'delivery', 'work_order_complete', 'installation', 'manual')),
  trigger_delay_hours INTEGER DEFAULT 24,
  questions JSONB NOT NULL DEFAULT '[]',
  google_review_redirect_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES survey_templates(id),
  customer_id INTEGER REFERENCES customers(id),
  transaction_id INTEGER,
  work_order_id INTEGER,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  answers JSONB DEFAULT '{}',
  feedback_text TEXT,
  redirected_to_google BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_queue (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES survey_templates(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  transaction_id INTEGER,
  work_order_id INTEGER,
  send_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'failed', 'cancelled')),
  sent_at TIMESTAMPTZ,
  email VARCHAR(255),
  phone VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_template ON survey_responses(template_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_token ON survey_responses(token);
CREATE INDEX IF NOT EXISTS idx_survey_responses_customer ON survey_responses(customer_id);
CREATE INDEX IF NOT EXISTS idx_survey_queue_send_at ON survey_queue(send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_survey_queue_status ON survey_queue(status);

INSERT INTO permissions (code, name, description, category) VALUES
  ('surveys.view', 'View surveys and responses', 'View surveys and responses', 'marketing'),
  ('surveys.create', 'Create survey templates', 'Create survey templates', 'marketing'),
  ('surveys.edit', 'Edit survey templates', 'Edit survey templates', 'marketing'),
  ('surveys.send', 'Send surveys', 'Send surveys', 'marketing')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'surveys.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
