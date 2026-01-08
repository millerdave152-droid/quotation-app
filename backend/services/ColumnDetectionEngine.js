/**
 * Column Detection Engine
 * Uses smart heuristics to automatically detect and map columns from import files
 */

class ColumnDetectionEngine {
  constructor() {
    // Define column patterns for detection
    this.columnPatterns = {
      model: {
        namePatterns: [
          'model', 'model number', 'model #', 'model#', 'modelnumber',
          'sku', 'item', 'item number', 'item #', 'part', 'part number',
          'part #', 'part id', 'partid', 'product number', 'product #', 'product code', 'code',
          'article', 'article number', 'upc', 'mfr. p/n', 'mfr p/n', 'manufacturer part'
        ],
        valuePatterns: [
          /^[A-Z]{2,4}[\d]{2,}/i,           // Samsung: RF28R7351SG
          /^[A-Z\d]{5,15}$/i,               // General alphanumeric
          /^[\d]{5,12}$/,                    // Numeric only (UPC-like)
          /^[A-Z]{1,3}-?[A-Z\d]{3,}/i       // LG: LRMVS3006S
        ],
        weight: { name: 0.6, value: 0.4 },
        targetField: 'model',
        isRequired: true
      },

      manufacturer: {
        namePatterns: [
          'manufacturer', 'brand', 'vendor', 'mfr', 'make', 'mfg',
          'supplier', 'company', 'manufacturer name', 'brand name'
        ],
        knownValues: [
          'samsung', 'lg', 'whirlpool', 'ge', 'frigidaire', 'electrolux',
          'maytag', 'kitchenaid', 'bosch', 'miele', 'sony', 'panasonic',
          'sharp', 'haier', 'hisense', 'tcl', 'vizio', 'bose', 'jbl',
          'denon', 'yamaha', 'pioneer', 'onkyo', 'klipsch', 'sonos',
          'cafe', 'monogram', 'profile', 'jenn-air', 'dacor', 'thermador',
          'sub-zero', 'wolf', 'viking', 'bertazzoni', 'fisher & paykel'
        ],
        weight: { name: 0.5, value: 0.5 },
        targetField: 'manufacturer',
        isRequired: false
      },

      name: {
        namePatterns: [
          'name', 'product name', 'item name', 'product title', 'title',
          'short description', 'product', 'item'
        ],
        valuePatterns: [
          /^.{10,100}$/  // 10-100 characters (typical product name length)
        ],
        weight: { name: 0.7, value: 0.3 },
        targetField: 'name',
        isRequired: false
      },

      description: {
        namePatterns: [
          'description', 'product description', 'item description', 'desc',
          'long description', 'full description', 'details', 'specifications'
        ],
        valuePatterns: [
          /^.{20,}/  // At least 20 characters
        ],
        weight: { name: 0.8, value: 0.2 },
        targetField: 'description',
        isRequired: false
      },

      category: {
        namePatterns: [
          'category', 'product category', 'type', 'product type', 'class',
          'classification', 'group', 'product group', 'department', 'subcategory'
        ],
        knownValues: [
          'refrigerator', 'washer', 'dryer', 'dishwasher', 'range', 'oven',
          'microwave', 'freezer', 'cooktop', 'hood', 'compactor', 'disposal',
          'tv', 'television', 'soundbar', 'speaker', 'receiver', 'amplifier',
          'sofa', 'sectional', 'recliner', 'bed', 'mattress', 'dresser',
          'table', 'chair', 'desk', 'cabinet', 'entertainment', 'a/v'
        ],
        weight: { name: 0.6, value: 0.4 },
        targetField: 'category',
        isRequired: false
      },

      cost: {
        namePatterns: [
          'cost', 'dealer cost', 'dealer', 'dc', 'net', 'net price',
          'wholesale', 'wholesale price', 'unit cost', 'your cost',
          'your price', 'buy price', 'purchase price', 'landed cost'
        ],
        valuePatterns: [
          /^\$?[\d,]+\.?\d{0,2}$/,     // $1,234.56 or 1234.56
          /^\$?[\d]+$/                  // $1234 or 1234
        ],
        constraints: {
          isNumeric: true,
          typical: { min: 50, max: 20000 }  // Typical appliance cost range
        },
        weight: { name: 0.5, value: 0.5 },
        targetField: 'cost_cents',
        isRequired: true,
        transformation: { type: 'multiply_100' }
      },

      promo_cost: {
        namePatterns: [
          'promo', 'promo cost', 'promotion', 'promotional', 'sale',
          'sale price', 'special', 'special price', 'better cost',
          'avg promo', 'average promo', 'promo price', 'deal'
        ],
        valuePatterns: [
          /^\$?[\d,]+\.?\d{0,2}$/
        ],
        constraints: {
          isNumeric: true,
          lessThan: 'cost'  // Should be less than regular cost
        },
        weight: { name: 0.6, value: 0.4 },
        targetField: 'promo_cost_cents',
        isRequired: false,
        transformation: { type: 'multiply_100' }
      },

      msrp: {
        namePatterns: [
          'msrp', 'retail', 'retail price', 'list', 'list price',
          'suggested retail', 'srp', 'suggested', 'rrp', 'recommended retail'
        ],
        valuePatterns: [
          /^\$?[\d,]+\.?\d{0,2}$/
        ],
        constraints: {
          isNumeric: true,
          greaterThan: 'cost'  // Should be greater than cost
        },
        weight: { name: 0.6, value: 0.4 },
        targetField: 'msrp_cents',
        isRequired: false,
        transformation: { type: 'multiply_100' }
      },

      retail_price: {
        namePatterns: [
          'go to', 'go-to', 'goto', 'go to price', 'selling price',
          'sell price', 'price', 'retail', 'store price', 'your retail'
        ],
        valuePatterns: [
          /^\$?[\d,]+\.?\d{0,2}$/
        ],
        constraints: {
          isNumeric: true,
          greaterThan: 'cost'
        },
        weight: { name: 0.5, value: 0.5 },
        targetField: 'retail_price_cents',
        isRequired: false,
        transformation: { type: 'multiply_100' }
      },

      map_price: {
        namePatterns: [
          'map', 'map price', 'minimum advertised', 'minimum advertised price',
          'advertised', 'min price'
        ],
        valuePatterns: [
          /^\$?[\d,]+\.?\d{0,2}$/
        ],
        constraints: {
          isNumeric: true
        },
        weight: { name: 0.7, value: 0.3 },
        targetField: 'map_price_cents',
        isRequired: false,
        transformation: { type: 'multiply_100' }
      },

      color: {
        namePatterns: [
          'color', 'colour', 'finish', 'color/finish', 'exterior color'
        ],
        knownValues: [
          'white', 'black', 'stainless', 'stainless steel', 'slate',
          'fingerprint resistant', 'bisque', 'silver', 'gray', 'grey',
          'platinum', 'graphite', 'tuscan', 'bronze', 'navy', 'matte'
        ],
        weight: { name: 0.6, value: 0.4 },
        targetField: 'color',
        isRequired: false
      },

      availability: {
        namePatterns: [
          'availability', 'status', 'stock', 'in stock', 'available',
          'inventory', 'qty', 'quantity'
        ],
        knownValues: [
          'in stock', 'available', 'out of stock', 'discontinued',
          'backorder', 'special order', 'active', 'inactive'
        ],
        weight: { name: 0.7, value: 0.3 },
        targetField: 'availability',
        isRequired: false
      }
    };

    // Priority order for price fields (when multiple price columns exist)
    this.pricePriority = ['cost', 'msrp', 'promo_cost', 'retail_price', 'map_price'];
  }

  /**
   * Detect column mappings from headers and sample data
   * @param {Array<string>} headers - Column headers
   * @param {Array<object>} sampleRows - Sample data rows
   * @param {string} detectedManufacturer - Optionally detected manufacturer
   * @returns {object} - Detection results
   */
  detectColumns(headers, sampleRows = [], detectedManufacturer = null) {
    const results = {
      mappings: {},
      unmappedHeaders: [],
      confidence: {},
      suggestions: [],
      detectedManufacturer: null,
      priceColumns: []
    };

    // Normalize headers
    const normalizedHeaders = headers.map((h, idx) => ({
      original: h,
      normalized: (h || '').toString().toLowerCase().trim().replace(/[_\-\.]/g, ' '),
      index: idx
    }));

    // Get sample values for each column
    const columnSamples = this.extractColumnSamples(normalizedHeaders, sampleRows);

    // Score each header against each field type
    const allScores = {};

    for (const header of normalizedHeaders) {
      allScores[header.index] = {};

      for (const [fieldType, pattern] of Object.entries(this.columnPatterns)) {
        const score = this.scoreColumn(header, columnSamples[header.index], pattern);
        allScores[header.index][fieldType] = score;
      }
    }

    // Assign optimal mappings using greedy algorithm
    const assignedFields = new Set();
    const assignedHeaders = new Set();

    // Sort all potential mappings by score
    const allMappings = [];
    for (const [headerIdx, scores] of Object.entries(allScores)) {
      for (const [fieldType, score] of Object.entries(scores)) {
        if (score > 0) {
          allMappings.push({
            headerIdx: parseInt(headerIdx),
            fieldType,
            score
          });
        }
      }
    }

    allMappings.sort((a, b) => b.score - a.score);

    // Assign mappings greedily
    for (const mapping of allMappings) {
      if (!assignedFields.has(mapping.fieldType) && !assignedHeaders.has(mapping.headerIdx)) {
        const header = normalizedHeaders[mapping.headerIdx];
        const pattern = this.columnPatterns[mapping.fieldType];

        results.mappings[header.original] = {
          targetField: pattern.targetField,
          sourceIndex: mapping.headerIdx,
          confidence: mapping.score,
          isRequired: pattern.isRequired || false,
          transformation: pattern.transformation || null
        };

        results.confidence[header.original] = mapping.score;
        assignedFields.add(mapping.fieldType);
        assignedHeaders.add(mapping.headerIdx);

        // Track price columns
        if (['cost', 'promo_cost', 'msrp', 'retail_price', 'map_price'].includes(mapping.fieldType)) {
          results.priceColumns.push({
            header: header.original,
            fieldType: mapping.fieldType,
            targetField: pattern.targetField
          });
        }
      }
    }

    // Find unmapped headers
    for (const header of normalizedHeaders) {
      if (!assignedHeaders.has(header.index)) {
        results.unmappedHeaders.push(header.original);

        // Generate suggestions for unmapped headers
        const suggestions = this.generateSuggestions(header, columnSamples[header.index]);
        if (suggestions.length > 0) {
          results.suggestions.push({
            header: header.original,
            suggestions
          });
        }
      }
    }

    // Detect manufacturer from data if not provided
    if (!detectedManufacturer) {
      results.detectedManufacturer = this.detectManufacturer(sampleRows);
    } else {
      results.detectedManufacturer = detectedManufacturer;
    }

    // Calculate overall confidence
    const confidences = Object.values(results.confidence);
    results.overallConfidence = confidences.length > 0
      ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : 0;

    return results;
  }

  /**
   * Extract sample values for each column
   */
  extractColumnSamples(headers, sampleRows) {
    const samples = {};

    for (const header of headers) {
      samples[header.index] = [];
    }

    for (const row of sampleRows.slice(0, 10)) {
      const values = Array.isArray(row) ? row : Object.values(row);
      for (let i = 0; i < values.length && i < headers.length; i++) {
        if (values[i] !== null && values[i] !== undefined && values[i] !== '') {
          samples[i].push(values[i].toString());
        }
      }
    }

    return samples;
  }

  /**
   * Score a column against a field pattern
   */
  scoreColumn(header, sampleValues, pattern) {
    let nameScore = 0;
    let valueScore = 0;
    const isBlankHeader = !header.normalized || header.normalized.trim() === '';

    // Score based on header name (skip if blank header)
    if (!isBlankHeader) {
      for (const namePattern of pattern.namePatterns) {
        const normalizedPattern = namePattern.toLowerCase();
        if (header.normalized === normalizedPattern) {
          nameScore = 100;  // Exact match
          break;
        } else if (header.normalized.includes(normalizedPattern)) {
          nameScore = Math.max(nameScore, 70);  // Contains match
        } else if (normalizedPattern.includes(header.normalized) && header.normalized.length > 3) {
          nameScore = Math.max(nameScore, 50);  // Reverse contains
        }
      }
    }

    // Score based on sample values
    if (sampleValues && sampleValues.length > 0) {
      let matchCount = 0;

      // Check value patterns
      if (pattern.valuePatterns) {
        for (const value of sampleValues) {
          for (const regex of pattern.valuePatterns) {
            if (regex.test(value)) {
              matchCount++;
              break;
            }
          }
        }
        valueScore = (matchCount / sampleValues.length) * 100;
      }

      // Check known values
      if (pattern.knownValues) {
        for (const value of sampleValues) {
          const normalizedValue = value.toLowerCase().trim();
          if (pattern.knownValues.some(kv => normalizedValue.includes(kv.toLowerCase()))) {
            matchCount++;
          }
        }
        valueScore = Math.max(valueScore, (matchCount / sampleValues.length) * 100);
      }

      // Check numeric constraints
      if (pattern.constraints?.isNumeric) {
        const numericCount = sampleValues.filter(v =>
          !isNaN(parseFloat(v.toString().replace(/[$,]/g, '')))
        ).length;
        valueScore = Math.max(valueScore, (numericCount / sampleValues.length) * 80);
      }
    }

    // Calculate weighted score
    let weights = pattern.weight || { name: 0.5, value: 0.5 };

    // For blank headers, rely entirely on value matching
    if (isBlankHeader) {
      weights = { name: 0, value: 1.0 };
    }

    return Math.round(nameScore * weights.name + valueScore * weights.value);
  }

  /**
   * Detect manufacturer from sample data
   */
  detectManufacturer(sampleRows) {
    const knownMfrs = this.columnPatterns.manufacturer.knownValues;
    const mfrCounts = {};

    for (const row of sampleRows) {
      const values = Array.isArray(row) ? row : Object.values(row);
      for (const value of values) {
        if (value) {
          const normalizedValue = value.toString().toLowerCase().trim();
          for (const mfr of knownMfrs) {
            if (normalizedValue.includes(mfr.toLowerCase())) {
              mfrCounts[mfr] = (mfrCounts[mfr] || 0) + 1;
            }
          }
        }
      }
    }

    // Return most common manufacturer
    const sorted = Object.entries(mfrCounts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  /**
   * Generate suggestions for unmapped headers
   */
  generateSuggestions(header, sampleValues) {
    const suggestions = [];

    // Check if it looks like a price column
    if (sampleValues && sampleValues.some(v => /^\$?[\d,]+\.?\d{0,2}$/.test(v))) {
      suggestions.push({
        targetField: 'custom_price',
        reason: 'Contains price-like values',
        confidence: 60
      });
    }

    // Check if it looks like a text description
    if (sampleValues && sampleValues.some(v => v.length > 20)) {
      suggestions.push({
        targetField: 'description',
        reason: 'Contains long text values',
        confidence: 40
      });
    }

    return suggestions;
  }

  /**
   * Validate detected mappings against data
   */
  validateMappings(mappings, sampleRows) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check for required fields
    const requiredFields = ['model', 'cost_cents'];
    const mappedTargets = Object.values(mappings).map(m => m.targetField);

    for (const required of requiredFields) {
      if (!mappedTargets.includes(required)) {
        validation.isValid = false;
        validation.errors.push(`Missing required field: ${required}`);
      }
    }

    // Check price relationships
    const hasCost = mappedTargets.includes('cost_cents');
    const hasMsrp = mappedTargets.includes('msrp_cents');

    if (hasCost && hasMsrp && sampleRows.length > 0) {
      // Find the column indices
      const costMapping = Object.values(mappings).find(m => m.targetField === 'cost_cents');
      const msrpMapping = Object.values(mappings).find(m => m.targetField === 'msrp_cents');

      if (costMapping && msrpMapping) {
        // Check a sample row
        const sampleRow = Array.isArray(sampleRows[0]) ? sampleRows[0] : Object.values(sampleRows[0]);
        const costValue = parseFloat((sampleRow[costMapping.sourceIndex] || '0').toString().replace(/[$,]/g, ''));
        const msrpValue = parseFloat((sampleRow[msrpMapping.sourceIndex] || '0').toString().replace(/[$,]/g, ''));

        if (costValue > msrpValue && msrpValue > 0) {
          validation.warnings.push('Warning: Cost appears to be greater than MSRP in some rows');
        }
      }
    }

    return validation;
  }

  /**
   * Get all available target fields
   */
  getAvailableTargetFields() {
    return Object.entries(this.columnPatterns).map(([key, pattern]) => ({
      key,
      targetField: pattern.targetField,
      label: this.formatFieldLabel(pattern.targetField),
      isRequired: pattern.isRequired || false,
      transformation: pattern.transformation || null
    }));
  }

  /**
   * Format field label for display
   */
  formatFieldLabel(field) {
    const labels = {
      'model': 'Model Number',
      'manufacturer': 'Manufacturer/Brand',
      'name': 'Product Name',
      'description': 'Description',
      'category': 'Category',
      'cost_cents': 'Dealer/Wholesale Cost',
      'promo_cost_cents': 'Promo/Better Cost',
      'msrp_cents': 'MSRP',
      'retail_price_cents': 'Retail/Go-To Price',
      'map_price_cents': 'MAP Price',
      'color': 'Color/Finish',
      'availability': 'Availability/Status'
    };
    return labels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

module.exports = ColumnDetectionEngine;
