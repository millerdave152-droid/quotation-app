/**
 * Lead Import Service
 * Handles bulk CSV import of leads with field mapping and duplicate detection
 */

const { parse } = require('csv-parse/sync');

class LeadImportService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Standard field mappings
   */
  static FIELD_MAPPINGS = {
    // Contact fields
    contact_name: ['name', 'contact_name', 'full_name', 'fullname', 'customer_name', 'customer'],
    contact_email: ['email', 'contact_email', 'e-mail', 'email_address', 'emailaddress'],
    contact_phone: ['phone', 'contact_phone', 'telephone', 'phone_number', 'phonenumber', 'mobile', 'cell'],

    // Source fields
    lead_source: ['source', 'lead_source', 'leadsource', 'how_heard', 'referral_source'],
    source_details: ['source_details', 'source_info', 'referral_details'],

    // Priority and timeline
    priority: ['priority', 'urgency', 'lead_priority', 'hotness'],
    timeline: ['timeline', 'purchase_timeline', 'when', 'timeframe'],

    // Context
    inquiry_reason: ['reason', 'inquiry_reason', 'purpose', 'inquiry_purpose'],
    requirements_notes: ['notes', 'requirements', 'requirements_notes', 'description', 'comments', 'details'],

    // Follow-up
    follow_up_date: ['follow_up', 'follow_up_date', 'followup', 'followup_date', 'callback_date'],

    // Contact preferences
    preferred_contact_method: ['preferred_contact', 'contact_method', 'contact_preference'],
    best_time_to_contact: ['best_time', 'best_time_to_contact', 'call_time']
  };

  /**
   * Parse CSV content and auto-detect column mappings
   */
  parseCSV(csvContent, options = {}) {
    const { delimiter = ',', hasHeaders = true } = options;

    // Parse CSV
    const records = parse(csvContent, {
      delimiter,
      columns: hasHeaders,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });

    if (records.length === 0) {
      return { columns: [], records: [], mappings: {} };
    }

    // Get column names
    const columns = Object.keys(records[0]);

    // Auto-detect mappings
    const mappings = this.detectMappings(columns);

    return { columns, records, mappings };
  }

  /**
   * Auto-detect field mappings based on column names
   */
  detectMappings(columns) {
    const mappings = {};

    for (const column of columns) {
      const normalizedColumn = column.toLowerCase().trim().replace(/[\s_-]+/g, '_');

      for (const [field, aliases] of Object.entries(LeadImportService.FIELD_MAPPINGS)) {
        if (aliases.includes(normalizedColumn) || aliases.some(a => normalizedColumn.includes(a))) {
          mappings[column] = field;
          break;
        }
      }
    }

    return mappings;
  }

  /**
   * Validate and transform a row based on mappings
   */
  transformRow(row, mappings) {
    const lead = {};
    const errors = [];

    for (const [column, field] of Object.entries(mappings)) {
      const value = row[column];

      if (value === undefined || value === null || value === '') {
        continue;
      }

      switch (field) {
        case 'contact_name':
          if (value.length < 2) {
            errors.push(`Invalid name: "${value}"`);
          } else {
            lead.contact_name = value.trim();
          }
          break;

        case 'contact_email':
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (value && !emailRegex.test(value)) {
            errors.push(`Invalid email: "${value}"`);
          } else if (value) {
            lead.contact_email = value.trim().toLowerCase();
          }
          break;

        case 'contact_phone':
          // Normalize phone number
          const phone = value.replace(/[^\d+]/g, '');
          if (phone.length >= 10) {
            lead.contact_phone = phone;
          } else if (value) {
            errors.push(`Invalid phone: "${value}"`);
          }
          break;

        case 'priority':
          const normalizedPriority = value.toLowerCase().trim();
          if (['hot', 'warm', 'cold'].includes(normalizedPriority)) {
            lead.priority = normalizedPriority;
          } else if (['high', 'urgent', '1'].includes(normalizedPriority)) {
            lead.priority = 'hot';
          } else if (['medium', 'normal', '2'].includes(normalizedPriority)) {
            lead.priority = 'warm';
          } else if (['low', '3'].includes(normalizedPriority)) {
            lead.priority = 'cold';
          }
          break;

        case 'timeline':
          const normalizedTimeline = value.toLowerCase().trim();
          if (['asap', 'immediate', 'now', 'urgent'].includes(normalizedTimeline)) {
            lead.timeline = 'asap';
          } else if (normalizedTimeline.includes('1-2 week') || normalizedTimeline.includes('1_2_week')) {
            lead.timeline = '1_2_weeks';
          } else if (normalizedTimeline.includes('1-3 month') || normalizedTimeline.includes('1_3_month')) {
            lead.timeline = '1_3_months';
          } else if (normalizedTimeline.includes('3-6 month') || normalizedTimeline.includes('3_6_month')) {
            lead.timeline = '3_6_months';
          } else if (normalizedTimeline.includes('research') || normalizedTimeline.includes('later')) {
            lead.timeline = 'just_researching';
          }
          break;

        case 'follow_up_date':
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              lead.follow_up_date = date.toISOString().split('T')[0];
            }
          } catch (e) {
            errors.push(`Invalid date: "${value}"`);
          }
          break;

        default:
          lead[field] = value.trim();
      }
    }

    return { lead, errors };
  }

  /**
   * Check for potential duplicate leads
   */
  async findDuplicates(leads) {
    const duplicates = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      // Check against existing database
      const existingQuery = `
        SELECT id, lead_number, contact_name, contact_email, contact_phone
        FROM leads
        WHERE (
          (contact_email IS NOT NULL AND contact_email = $1)
          OR (contact_phone IS NOT NULL AND contact_phone = $2)
          OR (LOWER(contact_name) = LOWER($3))
        )
        LIMIT 5
      `;

      const result = await this.pool.query(existingQuery, [
        lead.contact_email || '',
        lead.contact_phone || '',
        lead.contact_name || ''
      ]);

      if (result.rows.length > 0) {
        duplicates.push({
          rowIndex: i,
          newLead: lead,
          existingLeads: result.rows,
          matchType: result.rows[0].contact_email === lead.contact_email ? 'email' :
                     result.rows[0].contact_phone === lead.contact_phone ? 'phone' : 'name'
        });
      }
    }

    return duplicates;
  }

  /**
   * Import leads from parsed CSV data
   */
  async importLeads(records, mappings, options = {}) {
    const {
      skipDuplicates = true,
      defaultPriority = 'warm',
      defaultSource = 'csv_import',
      userId = null
    } = options;

    const results = {
      total: records.length,
      imported: 0,
      skipped: 0,
      errors: [],
      duplicates: [],
      importedLeads: []
    };

    // Transform all rows first
    const transformedLeads = [];
    for (let i = 0; i < records.length; i++) {
      const { lead, errors } = this.transformRow(records[i], mappings);

      if (errors.length > 0) {
        results.errors.push({ row: i + 1, errors });
        results.skipped++;
        continue;
      }

      if (!lead.contact_name) {
        results.errors.push({ row: i + 1, errors: ['Missing contact name'] });
        results.skipped++;
        continue;
      }

      // Apply defaults
      if (!lead.priority) lead.priority = defaultPriority;
      if (!lead.lead_source) lead.lead_source = defaultSource;

      transformedLeads.push({ rowIndex: i, lead });
    }

    // Check for duplicates
    const duplicates = await this.findDuplicates(transformedLeads.map(t => t.lead));
    const duplicateRowIndices = new Set(duplicates.map(d => d.rowIndex));

    results.duplicates = duplicates;

    // Import non-duplicate leads
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const { rowIndex, lead } of transformedLeads) {
        if (skipDuplicates && duplicateRowIndices.has(rowIndex)) {
          results.skipped++;
          continue;
        }

        // Generate lead number
        const seqResult = await client.query("SELECT nextval('lead_number_seq')");
        const seq = seqResult.rows[0].nextval;
        const year = new Date().getFullYear();
        const leadNumber = `LD-${year}-${String(seq).padStart(4, '0')}`;

        // Insert lead
        const insertResult = await client.query(`
          INSERT INTO leads (
            lead_number, contact_name, contact_email, contact_phone,
            lead_source, source_details, priority, timeline,
            inquiry_reason, requirements_notes, follow_up_date,
            preferred_contact_method, best_time_to_contact,
            status, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'new', $14
          ) RETURNING id, lead_number
        `, [
          leadNumber,
          lead.contact_name,
          lead.contact_email || null,
          lead.contact_phone || null,
          lead.lead_source,
          lead.source_details || null,
          lead.priority,
          lead.timeline || null,
          lead.inquiry_reason || null,
          lead.requirements_notes || null,
          lead.follow_up_date || null,
          lead.preferred_contact_method || null,
          lead.best_time_to_contact || null,
          userId
        ]);

        results.imported++;
        results.importedLeads.push({
          id: insertResult.rows[0].id,
          leadNumber: insertResult.rows[0].lead_number,
          contactName: lead.contact_name
        });

        // Log activity
        await client.query(`
          INSERT INTO lead_activities (lead_id, activity_type, description, performed_by)
          VALUES ($1, 'created', 'Lead imported from CSV', $2)
        `, [insertResult.rows[0].id, userId]);
      }

      await client.query('COMMIT');

      // Invalidate cache
      if (this.cache) {
        this.cache.invalidatePattern('leads:');
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return results;
  }

  /**
   * Get sample CSV template
   */
  getImportTemplate() {
    return {
      headers: ['Name', 'Email', 'Phone', 'Source', 'Priority', 'Timeline', 'Notes'],
      sampleRows: [
        ['John Smith', 'john@example.com', '555-123-4567', 'Website', 'Hot', 'ASAP', 'Interested in fridge'],
        ['Jane Doe', 'jane@example.com', '555-987-6543', 'Referral', 'Warm', '1-2 Weeks', 'Kitchen renovation'],
        ['Bob Wilson', 'bob@example.com', '555-555-5555', 'Walk-in', 'Cold', 'Just Researching', 'Browsing options']
      ]
    };
  }
}

module.exports = LeadImportService;
