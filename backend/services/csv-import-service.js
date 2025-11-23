/**
 * CSV IMPORT SERVICE - CORRECTED FOR YOUR SCHEMA
 * Uses: cost_cents, msrp_cents, list_cost (instead of actual_cost/msrp)
 */

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');

class CSVImportService {
    constructor(dbPool) {
        this.pool = dbPool;
        
        // Column mappings from CSV to database (CORRECTED)
        this.columnMappings = {
            'MANUFACTURER': 'manufacturer',
            'BRAND_NAME': 'manufacturer',
            'MODEL': 'model',
            'ACTUAL_COST': 'cost_cents',      // Maps to cost_cents
            'COST': 'cost_cents',
            'MSRP': 'msrp_cents',             // Maps to msrp_cents
            'CATEGORY': 'category',
            'SUBCATEGORY': 'subcategory',
            'DESCRIPTION': 'description',
            'DETAIL_STAGING': 'description',
            'CATEGORY_STAGING': 'category',
            'SUBCATEGORY_STAGING': 'subcategory'
        };
        
        this.requiredFields = ['model', 'manufacturer'];
    }

    /**
     * Import a single CSV file
     */
    async importCSVFile(filePath, importSource = 'automatic') {
        const startTime = Date.now();
        const fileName = path.basename(filePath);
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Starting CSV Import: ${fileName}`);
        console.log('='.repeat(70));
        
        const logId = await this.createImportLog(fileName, filePath, importSource);
        
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true
            });
            
            console.log(`Parsed ${records.length} records from CSV`);
            
            const results = {
                processed: 0,
                added: 0,
                updated: 0,
                failed: 0,
                priceChanges: 0,
                errors: []
            };
            
            for (let i = 0; i < records.length; i++) {
                try {
                    const record = records[i];
                    const rowNum = i + 2;
                    
                    const productData = this.mapRecordToProduct(record);
                    
                    if (!this.validateProduct(productData)) {
                        results.errors.push({
                            row: rowNum,
                            model: productData.model || 'N/A',
                            error: 'Missing required fields',
                            data: record
                        });
                        results.failed++;
                        continue;
                    }
                    
                    const result = await this.importProduct(
                        productData,
                        fileName,
                        importSource
                    );
                    
                    results.processed++;
                    if (result.action === 'added') {
                        results.added++;
                    } else if (result.action === 'updated') {
                        results.updated++;
                        if (result.priceChanged) {
                            results.priceChanges++;
                        }
                    }
                    
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        row: i + 2,
                        error: error.message,
                        data: records[i]
                    });
                    console.error(`Error processing row ${i + 2}:`, error.message);
                }
            }
            
            const processingTime = (Date.now() - startTime) / 1000;
            
            await this.updateImportLog(logId, 'success', results, processingTime);
            
            if (results.errors.length > 0) {
                await this.logImportErrors(logId, results.errors);
            }
            
            console.log(`\n${'='.repeat(70)}`);
            console.log('IMPORT COMPLETE');
            console.log('='.repeat(70));
            console.log(`Processed:      ${results.processed}`);
            console.log(`Added:          ${results.added}`);
            console.log(`Updated:        ${results.updated}`);
            console.log(`Failed:         ${results.failed}`);
            console.log(`Price Changes:  ${results.priceChanges}`);
            console.log(`Processing Time: ${processingTime.toFixed(2)}s`);
            console.log('='.repeat(70));
            
            return {
                success: true,
                logId,
                results,
                processingTime
            };
            
        } catch (error) {
            const processingTime = (Date.now() - startTime) / 1000;
            await this.updateImportLog(logId, 'failed', {}, processingTime, error.message);
            
            console.error(`Import failed: ${error.message}`);
            throw error;
        }
    }

    mapRecordToProduct(record) {
        const product = {};
        
        for (const [csvCol, dbField] of Object.entries(this.columnMappings)) {
            if (record[csvCol]) {
                product[dbField] = record[csvCol];
            }
        }
        
        // Convert prices to cents
        if (product.cost_cents) {
            product.cost_cents = this.dollarsToCents(product.cost_cents);
        }
        if (product.msrp_cents) {
            product.msrp_cents = this.dollarsToCents(product.msrp_cents);
        }
        
        // Clean up manufacturer name
        if (product.manufacturer) {
            product.manufacturer = product.manufacturer.trim().toUpperCase();
        }
        
        // Clean up model number
        if (product.model) {
            product.model = product.model.trim().toUpperCase();
        }
        
        return product;
    }

    dollarsToCents(dollarString) {
        if (!dollarString) return 0;
        
        let cleaned = dollarString.toString().replace(/[$,]/g, '');
        let dollars = parseFloat(cleaned);
        if (isNaN(dollars)) return 0;
        
        return Math.round(dollars * 100);
    }

    centsToDollars(cents) {
        if (!cents) return '$0.00';
        return `$${(cents / 100).toFixed(2)}`;
    }

    validateProduct(product) {
        for (const field of this.requiredFields) {
            if (!product[field] || product[field] === '') {
                return false;
            }
        }
        return true;
    }

    async importProduct(productData, fileName, importSource) {
        const { manufacturer, model } = productData;
        
        const existingQuery = `
            SELECT id, cost_cents, msrp_cents 
            FROM products 
            WHERE manufacturer = $1 AND model = $2
        `;
        const existingResult = await this.pool.query(existingQuery, [manufacturer, model]);
        
        if (existingResult.rows.length === 0) {
            return await this.addNewProduct(productData, fileName, importSource);
        } else {
            const existingProduct = existingResult.rows[0];
            return await this.updateExistingProduct(
                existingProduct,
                productData,
                fileName,
                importSource
            );
        }
    }

    async addNewProduct(productData, fileName, importSource) {
        const insertQuery = `
            INSERT INTO products (
                manufacturer, model, description, category,
                cost_cents, msrp_cents, price, name,
                import_source, import_date, import_file_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10)
            RETURNING id
        `;
        
        const values = [
            productData.manufacturer,
            productData.model,
            productData.description || '',
            productData.category || 'Uncategorized',
            productData.cost_cents || 0,
            productData.msrp_cents || 0,
            productData.cost_cents || 0,  // price column (same as cost_cents)
            productData.model,             // name column (use model as name)
            importSource,
            fileName
        ];
        
        const result = await this.pool.query(insertQuery, values);
        
        await this.logPriceChange(
            result.rows[0].id,
            productData.manufacturer,
            productData.model,
            0,
            productData.cost_cents || 0,
            'new_product',
            importSource,
            fileName
        );
        
        console.log(`✓ Added new product: ${productData.manufacturer} ${productData.model}`);
        
        return { action: 'added', priceChanged: false };
    }

    async updateExistingProduct(existingProduct, productData, fileName, importSource) {
        const priceChanged = existingProduct.cost_cents !== productData.cost_cents;
        
        const updateQuery = `
            UPDATE products SET
                description = COALESCE($1, description),
                category = COALESCE($2, category),
                cost_cents = $3,
                msrp_cents = $4,
                price = $3,
                name = COALESCE($8, model),
                import_source = $5,
                import_date = CURRENT_TIMESTAMP,
                import_file_name = $6,
                last_price_change_date = CASE WHEN $3 != cost_cents THEN CURRENT_TIMESTAMP ELSE last_price_change_date END,
                last_price_change_amount = CASE WHEN $3 != cost_cents THEN $3 - cost_cents ELSE last_price_change_amount END
            WHERE id = $7
        `;
        
        const values = [
            productData.description,
            productData.category,
            productData.cost_cents || 0,
            productData.msrp_cents || 0,
            importSource,
            fileName,
            existingProduct.id,
            productData.model
        ];
        
        await this.pool.query(updateQuery, values);
        
        if (priceChanged) {
            const changeType = productData.cost_cents > existingProduct.cost_cents 
                ? 'increase' 
                : 'decrease';
            
            await this.logPriceChange(
                existingProduct.id,
                productData.manufacturer,
                productData.model,
                existingProduct.cost_cents,
                productData.cost_cents,
                changeType,
                importSource,
                fileName,
                existingProduct.msrp_cents,
                productData.msrp_cents
            );
            
            const oldPrice = this.centsToDollars(existingProduct.cost_cents);
            const newPrice = this.centsToDollars(productData.cost_cents);
            console.log(`↻ Updated ${productData.manufacturer} ${productData.model}: ${oldPrice} → ${newPrice}`);
        } else {
            console.log(`✓ Updated ${productData.manufacturer} ${productData.model} (no price change)`);
        }
        
        return { action: 'updated', priceChanged };
    }

    async logPriceChange(
        productId, manufacturer, model,
        oldPriceCents, newPriceCents, changeType,
        importSource, fileName,
        oldMsrpCents = null, newMsrpCents = null
    ) {
        const priceDiff = newPriceCents - oldPriceCents;
        const percentChange = oldPriceCents > 0 
            ? ((priceDiff / oldPriceCents) * 100).toFixed(2)
            : 0;
        
        const insertQuery = `
            INSERT INTO price_history (
                product_id, manufacturer, model,
                old_price_cents, new_price_cents, price_change_cents, price_change_percent,
                change_type, old_msrp_cents, new_msrp_cents,
                import_source, import_file_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        
        const values = [
            productId, manufacturer, model,
            oldPriceCents, newPriceCents, priceDiff, percentChange,
            changeType, oldMsrpCents, newMsrpCents,
            importSource, fileName
        ];
        
        await this.pool.query(insertQuery, values);
    }

    async createImportLog(fileName, filePath, importSource) {
        const insertQuery = `
            INSERT INTO import_logs (
                file_name, file_path, import_source, status
            ) VALUES ($1, $2, $3, 'in_progress')
            RETURNING id
        `;
        
        const result = await this.pool.query(insertQuery, [fileName, filePath, importSource]);
        return result.rows[0].id;
    }

    async updateImportLog(logId, status, results, processingTime, errorMessage = null) {
        const updateQuery = `
            UPDATE import_logs SET
                status = $1,
                products_processed = $2,
                products_added = $3,
                products_updated = $4,
                products_failed = $5,
                price_changes_detected = $6,
                processing_time_seconds = $7,
                error_message = $8,
                summary = $9
            WHERE id = $10
        `;
        
        const summary = JSON.stringify(results);
        
        const values = [
            status,
            results.processed || 0,
            results.added || 0,
            results.updated || 0,
            results.failed || 0,
            results.priceChanges || 0,
            processingTime,
            errorMessage,
            summary,
            logId
        ];
        
        await this.pool.query(updateQuery, values);
    }

    async logImportErrors(logId, errors) {
        for (const error of errors) {
            const insertQuery = `
                INSERT INTO import_errors (
                    import_log_id, row_number, product_model,
                    error_type, error_message, raw_data
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `;
            
            const values = [
                logId,
                error.row,
                error.model || 'N/A',
                'validation',
                error.error,
                JSON.stringify(error.data)
            ];
            
            await this.pool.query(insertQuery, values);
        }
    }

    async getImportStats() {
        const query = `
            SELECT 
                COUNT(*) as total_imports,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                SUM(products_added) as total_added,
                SUM(products_updated) as total_updated,
                SUM(price_changes_detected) as total_price_changes,
                MAX(import_date) as last_import
            FROM import_logs
            WHERE import_date >= CURRENT_DATE - INTERVAL '30 days'
        `;
        
        const result = await this.pool.query(query);
        return result.rows[0];
    }

    async getRecentPriceChanges(limit = 50) {
        const query = `
            SELECT * FROM recent_price_changes
            LIMIT $1
        `;
        
        const result = await this.pool.query(query, [limit]);
        return result.rows;
    }
}

module.exports = CSVImportService;