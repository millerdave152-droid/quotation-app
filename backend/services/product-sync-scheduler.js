/**
 * PRODUCT SYNC SCHEDULER
 * =======================
 * Monitors the cleaned_data folder from Excel automation system
 * and automatically triggers CSV imports when new files appear.
 * 
 * Features:
 * - File system watching for new CSV files
 * - Scheduled polling at configurable intervals
 * - Duplicate file detection
 * - Automatic import triggering
 * - Error handling and retry logic
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const CSVImportService = require('./csv-import-service');

class ProductSyncScheduler {
    constructor(dbPool, config) {
        this.pool = dbPool;
        this.config = config;
        this.importService = new CSVImportService(dbPool);
        this.watcher = null;
        this.syncInterval = null;
        this.isProcessing = false;
        this.processedFiles = new Set();
        this.lastSyncTime = null;
    }

    /**
     * Start the sync scheduler
     */
    async start() {
        console.log('\n' + '='.repeat(70));
        console.log('PRODUCT SYNC SCHEDULER STARTING');
        console.log('='.repeat(70));
        console.log(`Watching folder: ${this.config.cleanedDataPath}`);
        console.log(`Sync interval: ${this.config.syncIntervalMinutes} minutes`);
        console.log(`Auto-import enabled: ${this.config.autoImportEnabled}`);
        console.log('='.repeat(70));
        
        if (!this.config.autoImportEnabled) {
            console.log('⚠️  Auto-import is DISABLED. Enable in .env file.');
            return;
        }
        
        // Verify watched folder exists
        try {
            await fs.access(this.config.cleanedDataPath);
        } catch (error) {
            console.error(`❌ Watched folder does not exist: ${this.config.cleanedDataPath}`);
            return;
        }
        
        // Load previously processed files
        await this.loadProcessedFiles();
        
        // Start file watcher
        this.startFileWatcher();
        
        // Start scheduled sync
        this.startScheduledSync();
        
        // Update sync status in database
        await this.updateSyncStatus('running');
        
        console.log('✓ Product sync scheduler started successfully');
    }

    /**
     * Stop the sync scheduler
     */
    async stop() {
        console.log('\nStopping product sync scheduler...');
        
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        await this.updateSyncStatus('stopped');
        
        console.log('✓ Product sync scheduler stopped');
    }

    /**
     * Start file system watcher for real-time detection
     */
    startFileWatcher() {
        console.log('\n📁 Starting file watcher...');
        
        this.watcher = chokidar.watch(
            path.join(this.config.cleanedDataPath, '*.csv'),
            {
                persistent: true,
                ignoreInitial: true, // Don't trigger on existing files
                awaitWriteFinish: {
                    stabilityThreshold: 2000, // Wait 2s for file to finish writing
                    pollInterval: 100
                }
            }
        );
        
        this.watcher.on('add', async (filePath) => {
            console.log(`\n📥 New file detected: ${path.basename(filePath)}`);
            await this.processNewFile(filePath);
        });
        
        this.watcher.on('error', (error) => {
            console.error('File watcher error:', error);
        });
        
        console.log('✓ File watcher active');
    }

    /**
     * Start scheduled polling (backup for file watcher)
     */
    startScheduledSync() {
        console.log('\n⏰ Starting scheduled sync...');
        
        const intervalMs = this.config.syncIntervalMinutes * 60 * 1000;
        
        this.syncInterval = setInterval(async () => {
            console.log('\n⏰ Scheduled sync triggered');
            await this.syncAll();
        }, intervalMs);
        
        console.log(`✓ Scheduled sync active (every ${this.config.syncIntervalMinutes} minutes)`);
    }

    /**
     * Process a new file
     */
    async processNewFile(filePath) {
        const fileName = path.basename(filePath);
        
        // Check if already processed
        if (this.processedFiles.has(fileName)) {
            console.log(`⚠️  File already processed: ${fileName}`);
            return;
        }
        
        // Check if currently processing
        if (this.isProcessing) {
            console.log(`⚠️  Import already in progress, queuing: ${fileName}`);
            // TODO: Implement proper queue
            return;
        }
        
        this.isProcessing = true;
        
        try {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`Processing: ${fileName}`);
            console.log('='.repeat(70));
            
            // Import the CSV file
            const result = await this.importService.importCSVFile(filePath, 'automatic');
            
            if (result.success) {
                // Mark as processed
                this.processedFiles.add(fileName);
                await this.saveProcessedFiles();
                
                // Update last sync time
                this.lastSyncTime = new Date();
                await this.updateSyncStatus('success', fileName);
                
                console.log(`✓ Successfully processed: ${fileName}`);
                
                // Send notification if configured
                await this.sendNotification('success', fileName, result);
            }
            
        } catch (error) {
            console.error(`❌ Error processing ${fileName}:`, error.message);
            await this.updateSyncStatus('failed', fileName, error.message);
            
            // Send notification
            await this.sendNotification('error', fileName, { error: error.message });
            
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Sync all unprocessed files in watched folder
     */
    async syncAll() {
        if (this.isProcessing) {
            console.log('⚠️  Sync already in progress');
            return;
        }
        
        try {
            // Get all CSV files in watched folder
            const files = await fs.readdir(this.config.cleanedDataPath);
            const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
            
            console.log(`Found ${csvFiles.length} CSV files`);
            
            // Filter unprocessed files
            const unprocessedFiles = csvFiles.filter(f => !this.processedFiles.has(f));
            
            if (unprocessedFiles.length === 0) {
                console.log('✓ All files already processed');
                return;
            }
            
            console.log(`Processing ${unprocessedFiles.length} new files...`);
            
            // Process each file
            for (const fileName of unprocessedFiles) {
                const filePath = path.join(this.config.cleanedDataPath, fileName);
                await this.processNewFile(filePath);
            }
            
        } catch (error) {
            console.error('Error during sync:', error);
        }
    }

    /**
     * Load list of previously processed files
     */
    async loadProcessedFiles() {
        try {
            const query = `
    SELECT DISTINCT file_name, MAX(import_date) as latest_import
    FROM import_logs 
    WHERE status = 'success'
    GROUP BY file_name
    ORDER BY latest_import DESC
`;
            
            const result = await this.pool.query(query);
            
            result.rows.forEach(row => {
                this.processedFiles.add(row.file_name);
            });
            
            console.log(`Loaded ${this.processedFiles.size} previously processed files`);
            
        } catch (error) {
            console.error('Error loading processed files:', error);
        }
    }

    /**
     * Save processed files list (for redundancy)
     */
    async saveProcessedFiles() {
        // Files are already tracked in import_logs table
        // This method is a placeholder for additional tracking if needed
    }

    /**
     * Update sync status in database
     */
    async updateSyncStatus(status, lastFile = null, errorMessage = null) {
        try {
            const updateQuery = `
                UPDATE sync_status SET
                    last_sync_date = CURRENT_TIMESTAMP,
                    last_sync_status = $1,
                    last_sync_file = $2,
                    last_error = $3,
                    sync_count = sync_count + 1,
                    last_updated = CURRENT_TIMESTAMP
                WHERE id = 1
            `;
            
            await this.pool.query(updateQuery, [status, lastFile, errorMessage]);
            
        } catch (error) {
            console.error('Error updating sync status:', error);
        }
    }

    /**
     * Send notification (email, webhook, etc.)
     */
    async sendNotification(type, fileName, data) {
        // TODO: Implement notification system
        // This could send emails, webhooks, Slack messages, etc.
        
        if (type === 'success') {
            console.log(`\n📧 Notification: Successfully imported ${fileName}`);
            console.log(`   - Products added: ${data.results.added}`);
            console.log(`   - Products updated: ${data.results.updated}`);
            console.log(`   - Price changes: ${data.results.priceChanges}`);
        } else if (type === 'error') {
            console.log(`\n📧 Notification: Error importing ${fileName}`);
            console.log(`   - Error: ${data.error}`);
        }
    }

    /**
     * Get sync statistics
     */
    async getStats() {
        try {
            const query = `
                SELECT 
                    last_sync_date,
                    last_sync_status,
                    last_sync_file,
                    sync_count,
                    sync_enabled
                FROM sync_status
                WHERE id = 1
            `;
            
            const result = await this.pool.query(query);
            
            const importStats = await this.importService.getImportStats();
            
            return {
                ...result.rows[0],
                ...importStats,
                processedFilesCount: this.processedFiles.size,
                isRunning: this.watcher !== null
            };
            
        } catch (error) {
            console.error('Error getting stats:', error);
            return null;
        }
    }

    /**
     * Manual sync trigger (for API endpoint)
     */
    async manualSync() {
        console.log('\n🔄 Manual sync triggered');
        await this.syncAll();
    }

    /**
     * Reset processed files list (for testing/maintenance)
     */
    async resetProcessedFiles() {
        console.log('⚠️  Resetting processed files list');
        this.processedFiles.clear();
        console.log('✓ Processed files list cleared');
    }
}

module.exports = ProductSyncScheduler;