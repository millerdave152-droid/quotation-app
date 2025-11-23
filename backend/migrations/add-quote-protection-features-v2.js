const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

async function addQuoteProtectionFeatures() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding quote protection features...');

    // 1. Add columns to quotations table for protection features
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS hide_model_numbers BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS watermark_text VARCHAR(255),
      ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS quote_expiry_date DATE,
      ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS tracking_token VARCHAR(100) UNIQUE,
      ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT
    `);

    console.log('✓ Added protection columns to quotations table');

    // 2. Create email templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        subject_line TEXT NOT NULL,
        body_text TEXT NOT NULL,
        variables JSONB DEFAULT '[]',
        talking_points JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✓ Created email_templates table');

    // 3. Insert default follow-up email templates using parameterized queries
    console.log('Inserting email templates...');

    // Template 1: Initial Follow-Up
    await client.query(
      `INSERT INTO email_templates (name, category, subject_line, body_text, variables, talking_points, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT DO NOTHING`,
      [
        'Initial Follow-Up (Day 2)',
        'FOLLOW_UP',
        'Quick Check-In - Quote #{quote_number} for {customer_name}',
        `Hi {customer_first_name},

I hope this email finds you well! I wanted to follow up on the quote I sent you on {quote_date} for {product_summary}.

Do you have any questions about the proposal? I'd be happy to:
✓ Walk through the quote in detail
✓ Discuss financing options (as low as {monthly_payment}/month)
✓ Arrange a product demonstration
✓ Customize the solution to better fit your needs

What time works best for a quick call this week?

Best regards,
{sales_rep_name}
{sales_rep_phone}`,
        JSON.stringify(["customer_name", "customer_first_name", "quote_number", "quote_date", "product_summary", "monthly_payment", "sales_rep_name", "sales_rep_phone"]),
        JSON.stringify(["Ask if they received the quote", "Confirm the products meet their needs", "Address any budget concerns", "Highlight financing options", "Create urgency with limited-time rebates"]),
        true
      ]
    );

    // Template 2: Reminder with Value
    await client.query(
      `INSERT INTO email_templates (name, category, subject_line, body_text, variables, talking_points, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT DO NOTHING`,
      [
        'Reminder with Value (Day 5)',
        'FOLLOW_UP',
        'Have Questions About Quote #{quote_number}?',
        `Hi {customer_first_name},

I wanted to reach out again regarding your quote for {product_summary}. I know purchasing decisions take time, and I'm here to help make this process as smooth as possible.

Here's what makes this quote special:
💎 Extended warranty included
🚚 Free delivery and installation
💰 Manufacturer rebates available
📅 Flexible financing options

Your quote is valid until {quote_expiry_date}.

Can we schedule a brief call to answer any questions?

Best,
{sales_rep_name}`,
        JSON.stringify(["customer_first_name", "quote_number", "product_summary", "quote_expiry_date", "sales_rep_name"]),
        JSON.stringify(["Ask if there are any obstacles to moving forward", "Mention competitor comparisons if applicable", "Emphasize time-sensitive rebates/promotions", "Offer to adjust quote if needed", "Provide customer testimonials"]),
        false
      ]
    );

    // Template 3: Urgency & Expiration
    await client.query(
      `INSERT INTO email_templates (name, category, subject_line, body_text, variables, talking_points, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT DO NOTHING`,
      [
        'Urgency & Expiration (Day 10)',
        'FOLLOW_UP',
        'Quote #{quote_number} Expires Soon - Let\'s Talk',
        `Hi {customer_first_name},

I noticed your quote for {product_summary} is set to expire on {quote_expiry_date} - that's only {days_until_expiry} days away!

I wanted to make sure you don't miss out on:
⚡ Special manufacturer rebates (ending soon!)
⚡ Promotional financing offers
⚡ Limited stock availability

I'd hate for you to lose these savings. Can we connect for 10 minutes today or tomorrow?

If pricing is a concern, I may be able to work with my manager to see what we can do.

Call me directly: {sales_rep_phone}

Thanks,
{sales_rep_name}`,
        JSON.stringify(["customer_first_name", "quote_number", "product_summary", "quote_expiry_date", "days_until_expiry", "sales_rep_phone", "sales_rep_name"]),
        JSON.stringify(["Create urgency with expiring rebates", "Offer to negotiate if needed", "Address last-minute objections", "Suggest alternative products if budget is tight", "Get commitment or close the quote"]),
        false
      ]
    );

    // Template 4: Final Follow-Up
    await client.query(
      `INSERT INTO email_templates (name, category, subject_line, body_text, variables, talking_points, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT DO NOTHING`,
      [
        'Final Follow-Up (Day 14)',
        'FOLLOW_UP',
        'Final Follow-Up - Quote #{quote_number}',
        `Hi {customer_first_name},

I've tried reaching out a few times about quote #{quote_number}. I understand you may have gone in a different direction, and that's completely okay!

If you're still interested but have concerns about pricing, features, or timing, please let me know. I'd be happy to:
• Revise the quote
• Suggest alternative options
• Extend the expiration date
• Connect you with a specialist

Otherwise, I'll close this quote and won't bother you further. If your needs change in the future, I'm always here to help.

Take care,
{sales_rep_name}`,
        JSON.stringify(["customer_first_name", "quote_number", "sales_rep_name"]),
        JSON.stringify(["Give customer permission to say no", "Open door for future business", "Ask for feedback on why they didn't purchase", "Offer to stay in touch", "Archive quote if no response"]),
        false
      ]
    );

    // Template 5: Quote Sent Confirmation
    await client.query(
      `INSERT INTO email_templates (name, category, subject_line, body_text, variables, talking_points, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT DO NOTHING`,
      [
        'Quote Sent Confirmation',
        'CONFIRMATION',
        'Your Quote from {company_name} - #{quote_number}',
        `Dear {customer_name},

Thank you for the opportunity to provide you with a quote!

Quote Details:
• Quote Number: #{quote_number}
• Total: {quote_total}
• Valid Until: {quote_expiry_date}

Your quote is attached to this email. Please review it at your convenience, and don't hesitate to reach out if you have any questions.

I'm here to help you find the perfect solution for your needs.

Best regards,
{sales_rep_name}
{sales_rep_email}
{sales_rep_phone}

{company_name}`,
        JSON.stringify(["customer_name", "company_name", "quote_number", "quote_total", "quote_expiry_date", "sales_rep_name", "sales_rep_email", "sales_rep_phone"]),
        JSON.stringify([]),
        true
      ]
    );

    console.log('✓ Inserted 5 default email templates');

    // 4. Create quote tracking events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_tracking_events (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        location_city VARCHAR(100),
        location_country VARCHAR(100),
        referrer TEXT,
        device_type VARCHAR(50),
        time_spent_seconds INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✓ Created quote_tracking_events table');

    // 5. Add default terms and conditions
    const defaultTerms = `QUOTATION TERMS & CONDITIONS

1. CONFIDENTIALITY
   This quotation and all pricing information contained herein are confidential and proprietary.
   This quotation is provided solely for the use of the customer named above and may not be
   disclosed to third parties without written consent.

2. VALIDITY
   This quotation is valid for 14 days from the date of issue. Prices, availability, and
   specifications are subject to change after expiration.

3. MODEL NUMBERS
   Specific model numbers and manufacturer details will be provided upon order confirmation.
   Products listed are subject to availability.

4. PRICING PROTECTION
   Prices quoted are for the customer named above only. This quotation may not be used for
   competitive bidding or price matching purposes.

5. NON-TRANSFERABLE
   This quotation is non-transferable and applies only to the customer and address listed above.

6. PAYMENT TERMS
   Payment terms as specified in the quotation. All prices in CAD unless otherwise noted.

7. DELIVERY
   Delivery dates are estimates and subject to product availability and confirmation.`;

    // 6. Update existing quotations with default expiry date (14 days from creation)
    await client.query(
      `UPDATE quotations
       SET quote_expiry_date = (created_at + INTERVAL '14 days')::date,
           terms_and_conditions = $1,
           watermark_text = 'CONFIDENTIAL - FOR CUSTOMER USE ONLY'
       WHERE quote_expiry_date IS NULL`,
      [defaultTerms]
    );

    console.log('✓ Updated existing quotations with default values');

    // 7. Create indexes for tracking performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tracking_quotation_id ON quote_tracking_events(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_tracking_event_type ON quote_tracking_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_tracking_created_at ON quote_tracking_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_quotations_expiry_date ON quotations(quote_expiry_date);
      CREATE INDEX IF NOT EXISTS idx_quotations_tracking_token ON quotations(tracking_token);
    `);

    console.log('✓ Created performance indexes');

    await client.query('COMMIT');

    console.log('\n✅ Quote protection features added successfully!');
    console.log('\nFeatures added:');
    console.log('  • Hide model numbers option');
    console.log('  • PDF watermarking');
    console.log('  • Quote expiration tracking');
    console.log('  • Quote tracking events');
    console.log('  • Email templates (5 templates)');
    console.log('  • Terms and conditions');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding quote protection features:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addQuoteProtectionFeatures()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
