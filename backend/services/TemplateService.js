/**
 * Template Service
 * Handles manufacturer import template CRUD and matching operations
 */

class TemplateService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get all templates with optional filtering
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async listTemplates(options = {}) {
    const { manufacturer, activeOnly = true, fileType } = options;

    const cacheKey = `templates:${manufacturer || 'all'}:${activeOnly}:${fileType || 'all'}`;

    return await this.cache.cacheQuery(cacheKey, 'short', async () => {
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      if (activeOnly) {
        whereConditions.push('is_active = true');
      }

      if (manufacturer) {
        whereConditions.push(`UPPER(manufacturer) = UPPER($${paramIndex})`);
        queryParams.push(manufacturer);
        paramIndex++;
      }

      if (fileType) {
        whereConditions.push(`file_type = $${paramIndex}`);
        queryParams.push(fileType);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      const query = `
        SELECT
          id, name, manufacturer, description, version, file_type,
          filename_patterns, header_patterns, column_mappings, price_mappings,
          header_row_index, is_active, is_default, confidence_threshold,
          use_count, last_used_at, success_rate, total_imports, successful_imports,
          created_at, updated_at
        FROM manufacturer_import_templates
        ${whereClause}
        ORDER BY
          is_default DESC,
          use_count DESC,
          manufacturer ASC,
          name ASC
      `;

      const result = await this.pool.query(query, queryParams);
      return result.rows;
    });
  }

  /**
   * Get template by ID with full details
   * @param {number} id - Template ID
   * @returns {Promise<object|null>}
   */
  async getTemplateById(id) {
    const result = await this.pool.query(`
      SELECT * FROM manufacturer_import_templates WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const template = result.rows[0];

    // Get column mappings
    const mappingsResult = await this.pool.query(`
      SELECT * FROM template_column_mappings
      WHERE template_id = $1
      ORDER BY priority DESC, id ASC
    `, [id]);
    template.column_mappings_detailed = mappingsResult.rows;

    // Get price field mappings
    const priceResult = await this.pool.query(`
      SELECT * FROM template_price_fields
      WHERE template_id = $1
      ORDER BY priority DESC, id ASC
    `, [id]);
    template.price_fields = priceResult.rows;

    return template;
  }

  /**
   * Create a new template
   * @param {object} templateData - Template data
   * @returns {Promise<number>} - New template ID
   */
  async createTemplate(templateData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // If this is set as default, unset other defaults for this manufacturer
      if (templateData.isDefault) {
        await client.query(`
          UPDATE manufacturer_import_templates
          SET is_default = false
          WHERE UPPER(manufacturer) = UPPER($1)
        `, [templateData.manufacturer]);
      }

      const result = await client.query(`
        INSERT INTO manufacturer_import_templates (
          name, manufacturer, description, version, file_type,
          filename_patterns, header_patterns, header_signature,
          column_mappings, transformations, price_mappings,
          header_row_index, data_start_row, skip_rows, skip_patterns,
          is_active, is_default, confidence_threshold,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING id
      `, [
        templateData.name,
        templateData.manufacturer,
        templateData.description || null,
        templateData.version || 1,
        templateData.fileType || null,
        JSON.stringify(templateData.filenamePatterns || []),
        JSON.stringify(templateData.headerPatterns || []),
        templateData.headerSignature || null,
        JSON.stringify(templateData.columnMappings || {}),
        JSON.stringify(templateData.transformations || {}),
        JSON.stringify(templateData.priceMappings || {}),
        templateData.headerRowIndex || 1,
        templateData.dataStartRow || 2,
        templateData.skipRows || 0,
        JSON.stringify(templateData.skipPatterns || []),
        templateData.isActive !== false,
        templateData.isDefault || false,
        templateData.confidenceThreshold || 80,
        templateData.createdBy || 'system'
      ]);

      const templateId = result.rows[0].id;

      // Insert detailed column mappings if provided
      if (templateData.columnMappingsDetailed) {
        for (const mapping of templateData.columnMappingsDetailed) {
          await client.query(`
            INSERT INTO template_column_mappings (
              template_id, source_column_name, source_column_index,
              source_column_aliases, target_field, transformation_type,
              transformation_config, is_required, validation_regex,
              default_value, priority
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            templateId,
            mapping.sourceColumnName,
            mapping.sourceColumnIndex || null,
            JSON.stringify(mapping.sourceColumnAliases || []),
            mapping.targetField,
            mapping.transformationType || null,
            mapping.transformationConfig ? JSON.stringify(mapping.transformationConfig) : null,
            mapping.isRequired || false,
            mapping.validationRegex || null,
            mapping.defaultValue || null,
            mapping.priority || 0
          ]);
        }
      }

      // Insert price field mappings if provided
      if (templateData.priceFields) {
        for (const priceField of templateData.priceFields) {
          await client.query(`
            INSERT INTO template_price_fields (
              template_id, field_name, source_column_name,
              target_column, price_type, is_primary,
              priority, multiply_by, condition_column, condition_value
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            templateId,
            priceField.fieldName,
            priceField.sourceColumnName,
            priceField.targetColumn,
            priceField.priceType,
            priceField.isPrimary || false,
            priceField.priority || 0,
            priceField.multiplyBy || 100,
            priceField.conditionColumn || null,
            priceField.conditionValue || null
          ]);
        }
      }

      await client.query('COMMIT');
      this.invalidateTemplateCache();
      return templateId;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing template
   * @param {number} id - Template ID
   * @param {object} templateData - Updated template data
   * @returns {Promise<object|null>}
   */
  async updateTemplate(id, templateData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if template exists
      const existing = await client.query(
        'SELECT id FROM manufacturer_import_templates WHERE id = $1',
        [id]
      );
      if (existing.rows.length === 0) {
        return null;
      }

      // If setting as default, unset other defaults
      if (templateData.isDefault) {
        await client.query(`
          UPDATE manufacturer_import_templates
          SET is_default = false
          WHERE UPPER(manufacturer) = UPPER($1) AND id != $2
        `, [templateData.manufacturer, id]);
      }

      await client.query(`
        UPDATE manufacturer_import_templates SET
          name = COALESCE($1, name),
          manufacturer = COALESCE($2, manufacturer),
          description = COALESCE($3, description),
          version = version + 1,
          file_type = COALESCE($4, file_type),
          filename_patterns = COALESCE($5, filename_patterns),
          header_patterns = COALESCE($6, header_patterns),
          column_mappings = COALESCE($7, column_mappings),
          price_mappings = COALESCE($8, price_mappings),
          header_row_index = COALESCE($9, header_row_index),
          is_active = COALESCE($10, is_active),
          is_default = COALESCE($11, is_default),
          updated_by = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
      `, [
        templateData.name,
        templateData.manufacturer,
        templateData.description,
        templateData.fileType,
        templateData.filenamePatterns ? JSON.stringify(templateData.filenamePatterns) : null,
        templateData.headerPatterns ? JSON.stringify(templateData.headerPatterns) : null,
        templateData.columnMappings ? JSON.stringify(templateData.columnMappings) : null,
        templateData.priceMappings ? JSON.stringify(templateData.priceMappings) : null,
        templateData.headerRowIndex,
        templateData.isActive,
        templateData.isDefault,
        templateData.updatedBy || 'system',
        id
      ]);

      await client.query('COMMIT');
      this.invalidateTemplateCache();
      return await this.getTemplateById(id);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a template
   * @param {number} id - Template ID
   * @returns {Promise<boolean>}
   */
  async deleteTemplate(id) {
    const result = await this.pool.query(
      'DELETE FROM manufacturer_import_templates WHERE id = $1 RETURNING id',
      [id]
    );
    this.invalidateTemplateCache();
    return result.rows.length > 0;
  }

  /**
   * Clone a template
   * @param {number} sourceId - Source template ID
   * @param {object} newData - New template data overrides
   * @returns {Promise<number>} - New template ID
   */
  async cloneTemplate(sourceId, newData = {}) {
    const source = await this.getTemplateById(sourceId);
    if (!source) {
      throw new Error('Source template not found');
    }

    const cloneData = {
      name: newData.name || `${source.name} (Copy)`,
      manufacturer: newData.manufacturer || source.manufacturer,
      description: newData.description || source.description,
      fileType: source.file_type,
      filenamePatterns: source.filename_patterns,
      headerPatterns: source.header_patterns,
      columnMappings: source.column_mappings,
      priceMappings: source.price_mappings,
      headerRowIndex: source.header_row_index,
      isActive: true,
      isDefault: false,
      createdBy: newData.createdBy || 'system'
    };

    return await this.createTemplate(cloneData);
  }

  /**
   * Get manufacturers with template counts
   * @returns {Promise<Array>}
   */
  async getManufacturersWithTemplates() {
    const result = await this.pool.query(`
      SELECT
        manufacturer,
        COUNT(*) as template_count,
        SUM(use_count) as total_uses,
        MAX(last_used_at) as last_used
      FROM manufacturer_import_templates
      WHERE is_active = true
      GROUP BY manufacturer
      ORDER BY total_uses DESC, manufacturer ASC
    `);
    return result.rows;
  }

  /**
   * Record template usage after import
   * @param {number} templateId - Template ID
   * @param {object} importResults - Import results
   */
  async recordTemplateUsage(templateId, importResults) {
    const wasSuccessful = importResults.failed === 0 ||
      (importResults.successful / (importResults.successful + importResults.failed)) > 0.9;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update template statistics
      await client.query(`
        UPDATE manufacturer_import_templates SET
          use_count = use_count + 1,
          last_used_at = CURRENT_TIMESTAMP,
          total_imports = total_imports + 1,
          successful_imports = successful_imports + $1,
          success_rate = CASE
            WHEN total_imports + 1 > 0
            THEN ((successful_imports + $1)::decimal / (total_imports + 1)) * 100
            ELSE 100
          END
        WHERE id = $2
      `, [wasSuccessful ? 1 : 0, templateId]);

      // Record in history
      await client.query(`
        INSERT INTO template_match_history (
          template_id, filename, file_type, match_method,
          confidence_score, was_successful,
          rows_processed, rows_imported, rows_updated, rows_failed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        templateId,
        importResults.filename || 'unknown',
        importResults.fileType || null,
        importResults.matchMethod || 'manual',
        importResults.confidenceScore || 100,
        wasSuccessful,
        importResults.total || 0,
        importResults.inserted || 0,
        importResults.updated || 0,
        importResults.failed || 0
      ]);

      await client.query('COMMIT');
      this.invalidateTemplateCache();

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to record template usage:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find matching template for a file
   * @param {string} filename - Filename
   * @param {Array<string>} headers - Column headers
   * @param {Array<object>} sampleRows - Sample data rows
   * @returns {Promise<object>}
   */
  async findMatchingTemplate(filename, headers, sampleRows = []) {
    const candidates = [];

    // Get all active templates
    const templates = await this.listTemplates({ activeOnly: true });

    for (const template of templates) {
      let score = 0;
      const scores = {};

      // 1. Filename pattern matching (35% weight)
      const filenameScore = this.scoreFilenameMatch(filename, template.filename_patterns);
      scores.filename = filenameScore;
      score += filenameScore * 0.35;

      // 2. Header pattern matching (50% weight)
      const headerScore = this.scoreHeaderMatch(headers, template.column_mappings);
      scores.header = headerScore;
      score += headerScore * 0.50;

      // 3. Content/manufacturer detection (15% weight)
      const contentScore = this.scoreContentMatch(sampleRows, template.manufacturer);
      scores.content = contentScore;
      score += contentScore * 0.15;

      if (score > 0) {
        candidates.push({
          templateId: template.id,
          templateName: template.name,
          manufacturer: template.manufacturer,
          isDefault: template.is_default,
          totalScore: Math.round(score),
          scores,
          template
        });
      }
    }

    // Sort by score
    candidates.sort((a, b) => b.totalScore - a.totalScore);

    const bestMatch = candidates[0] || null;
    const requiresManualSelection = !bestMatch || bestMatch.totalScore < 50;

    return {
      bestMatch,
      alternatives: candidates.slice(1, 5),
      requiresManualSelection,
      allCandidates: candidates
    };
  }

  /**
   * Score filename pattern match
   */
  scoreFilenameMatch(filename, patterns) {
    if (!patterns || patterns.length === 0) return 0;

    const normalizedFilename = filename.toLowerCase();
    let matchCount = 0;

    for (const pattern of patterns) {
      if (normalizedFilename.includes(pattern.toLowerCase())) {
        matchCount++;
      }
    }

    return matchCount > 0 ? Math.min((matchCount / patterns.length) * 100 + 20, 100) : 0;
  }

  /**
   * Score header pattern match
   */
  scoreHeaderMatch(headers, columnMappings) {
    if (!headers || headers.length === 0 || !columnMappings) return 0;

    const normalizedHeaders = headers.map(h => (h || '').toString().toLowerCase().trim());
    const expectedColumns = Object.keys(columnMappings);
    let matchCount = 0;

    for (const expectedCol of expectedColumns) {
      const normalizedExpected = expectedCol.toLowerCase().trim();
      if (normalizedHeaders.includes(normalizedExpected)) {
        matchCount++;
      }
    }

    return expectedColumns.length > 0
      ? Math.round((matchCount / expectedColumns.length) * 100)
      : 0;
  }

  /**
   * Score content/manufacturer match
   */
  scoreContentMatch(sampleRows, templateManufacturer) {
    if (!sampleRows || sampleRows.length === 0) return 0;

    const normalizedMfr = templateManufacturer.toUpperCase();

    for (const row of sampleRows) {
      for (const value of Object.values(row)) {
        if (value && value.toString().toUpperCase().includes(normalizedMfr)) {
          return 80;
        }
      }
    }

    return 0;
  }

  /**
   * Record a user correction for template learning
   */
  async recordCorrection(templateId, correction) {
    await this.pool.query(`
      INSERT INTO template_learning_log (
        template_id, event_type,
        original_mapping, corrected_mapping,
        filename, row_example,
        corrected_by, correction_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      templateId,
      correction.eventType,
      JSON.stringify(correction.original || {}),
      JSON.stringify(correction.corrected || {}),
      correction.filename || null,
      correction.rowExample ? JSON.stringify(correction.rowExample) : null,
      correction.correctedBy || 'user',
      correction.reason || null
    ]);
  }

  /**
   * Get template learning history
   */
  async getLearningHistory(templateId) {
    const result = await this.pool.query(`
      SELECT * FROM template_learning_log
      WHERE template_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [templateId]);
    return result.rows;
  }

  /**
   * Get template usage history
   */
  async getUsageHistory(templateId, limit = 20) {
    const result = await this.pool.query(`
      SELECT * FROM template_match_history
      WHERE template_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [templateId, limit]);
    return result.rows;
  }

  /**
   * Invalidate template cache
   */
  invalidateTemplateCache() {
    if (this.cache && this.cache.invalidatePattern) {
      this.cache.invalidatePattern('templates:');
    }
  }

  /**
   * Test template with sample data
   */
  async testTemplate(template, headers, sampleData) {
    const results = {
      rowsProcessed: sampleData.length,
      validRows: 0,
      invalidRows: 0,
      mappedFields: [],
      unmappedHeaders: [],
      errors: [],
      preview: []
    };

    const columnMappings = template.column_mappings || {};
    const normalizedHeaders = headers.map(h => (h || '').toString().trim());

    // Check which headers are mapped
    for (const header of normalizedHeaders) {
      if (columnMappings[header]) {
        results.mappedFields.push({
          source: header,
          target: columnMappings[header].targetField
        });
      } else {
        results.unmappedHeaders.push(header);
      }
    }

    // Process sample rows
    for (let i = 0; i < Math.min(sampleData.length, 10); i++) {
      const row = sampleData[i];
      const mappedRow = {};
      const rowErrors = [];

      for (const [sourceCol, config] of Object.entries(columnMappings)) {
        const headerIndex = normalizedHeaders.indexOf(sourceCol);
        if (headerIndex >= 0) {
          let value = Object.values(row)[headerIndex];

          // Apply transformation
          if (config.transformation) {
            value = this.applyTransformation(value, config.transformation);
          }

          mappedRow[config.targetField] = value;

          // Check required fields
          if (config.isRequired && !value) {
            rowErrors.push(`Missing required field: ${config.targetField}`);
          }
        }
      }

      if (rowErrors.length > 0) {
        results.invalidRows++;
        results.errors.push({ row: i + 1, errors: rowErrors });
      } else {
        results.validRows++;
      }

      results.preview.push(mappedRow);
    }

    return results;
  }

  /**
   * Apply data transformation
   */
  applyTransformation(value, transformation) {
    if (!value) return value;

    const strValue = value.toString().trim();
    const type = transformation.type || transformation;

    switch (type) {
      case 'multiply_100':
        // Strip currency symbols and convert to cents
        const numValue = parseFloat(strValue.replace(/[$,]/g, ''));
        return isNaN(numValue) ? 0 : Math.round(numValue * 100);

      case 'uppercase':
        return strValue.toUpperCase();

      case 'lowercase':
        return strValue.toLowerCase();

      case 'trim':
        return strValue;

      case 'strip_currency':
        return strValue.replace(/[$,]/g, '');

      default:
        return value;
    }
  }
}

module.exports = TemplateService;
