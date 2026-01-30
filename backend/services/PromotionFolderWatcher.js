/**
 * PromotionFolderWatcher
 *
 * Watches configured folders for new promotion Excel files.
 * When a new file is detected:
 * 1. Imports it using PromotionImportService
 * 2. Moves it to a 'processed' subfolder
 * 3. Logs the import result
 *
 * Can be run as:
 * - Periodic scan (cron-style)
 * - Continuous watch (using chokidar)
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');

class PromotionFolderWatcher {
  constructor(pool, importService) {
    this.pool = pool;
    this.importService = importService;
    this.watchers = new Map(); // folder_id -> chokidar watcher
    this.isScanning = false;
  }

  /**
   * Start watching all active folders
   */
  async startWatching() {
    const folders = await this.getActiveFolders();
    console.log(`[PromotionFolderWatcher] Starting watch on ${folders.length} folders`);

    for (const folder of folders) {
      await this.watchFolder(folder);
    }
  }

  /**
   * Stop all watchers
   */
  async stopWatching() {
    console.log('[PromotionFolderWatcher] Stopping all watchers');
    for (const [folderId, watcher] of this.watchers) {
      await watcher.close();
      console.log(`[PromotionFolderWatcher] Stopped watching folder ${folderId}`);
    }
    this.watchers.clear();
  }

  /**
   * Watch a single folder for new files
   */
  async watchFolder(folder) {
    const { id, folder_path, manufacturer } = folder;

    // Verify folder exists
    try {
      await fs.access(folder_path);
    } catch (err) {
      console.error(`[PromotionFolderWatcher] Folder does not exist: ${folder_path}`);
      return;
    }

    // Create processed subfolder
    const processedPath = path.join(folder_path, 'processed');
    try {
      await fs.mkdir(processedPath, { recursive: true });
    } catch (err) {
      // Ignore if already exists
    }

    // Set up chokidar watcher
    const watcher = chokidar.watch(folder_path, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't process existing files on start
      depth: 0 // Only watch top level
    });

    watcher.on('add', async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (['.xlsx', '.xls', '.csv'].includes(ext)) {
        console.log(`[PromotionFolderWatcher] New file detected: ${filePath}`);
        await this.processFile(folder, filePath);
      }
    });

    watcher.on('error', (error) => {
      console.error(`[PromotionFolderWatcher] Watcher error for folder ${id}:`, error);
    });

    this.watchers.set(id, watcher);
    console.log(`[PromotionFolderWatcher] Now watching: ${folder_path}`);
  }

  /**
   * Process a single file
   */
  async processFile(folder, filePath) {
    const { id: folderId, folder_path, manufacturer } = folder;
    const fileName = path.basename(filePath);

    console.log(`[PromotionFolderWatcher] Processing file: ${fileName}`);

    try {
      // Import the file
      const result = await this.importService.importPromotionFile(filePath, {
        manufacturer,
        source: 'folder_watch',
        userId: null // System import
      });

      // Move to processed folder
      const processedPath = path.join(folder_path, 'processed', fileName);
      try {
        await fs.rename(filePath, processedPath);
        console.log(`[PromotionFolderWatcher] Moved to: ${processedPath}`);
      } catch (moveErr) {
        // If rename fails (cross-device), copy and delete
        await fs.copyFile(filePath, processedPath);
        await fs.unlink(filePath);
        console.log(`[PromotionFolderWatcher] Copied and deleted: ${processedPath}`);
      }

      // Update folder stats
      await this.pool.query(`
        UPDATE promotion_watch_folders
        SET files_processed = files_processed + 1,
            last_file_processed = $1,
            last_checked_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [fileName, folderId]);

      console.log(`[PromotionFolderWatcher] Successfully processed: ${fileName}`);
      return result;

    } catch (err) {
      console.error(`[PromotionFolderWatcher] Error processing ${fileName}:`, err.message);

      // Move to failed folder
      const failedPath = path.join(folder_path, 'failed');
      try {
        await fs.mkdir(failedPath, { recursive: true });
        await fs.rename(filePath, path.join(failedPath, fileName));
      } catch (moveErr) {
        console.error(`[PromotionFolderWatcher] Could not move failed file:`, moveErr.message);
      }

      throw err;
    }
  }

  /**
   * Manually scan all folders for new files
   * This is used for periodic scans instead of continuous watching
   */
  async scanAllFolders() {
    if (this.isScanning) {
      console.log('[PromotionFolderWatcher] Scan already in progress, skipping');
      return { skipped: true };
    }

    this.isScanning = true;
    const results = {
      folders_scanned: 0,
      files_processed: 0,
      files_failed: 0,
      errors: []
    };

    try {
      const folders = await this.getActiveFolders();
      console.log(`[PromotionFolderWatcher] Scanning ${folders.length} folders`);

      for (const folder of folders) {
        try {
          const folderResult = await this.scanFolder(folder);
          results.folders_scanned++;
          results.files_processed += folderResult.processed;
          results.files_failed += folderResult.failed;
        } catch (err) {
          results.errors.push({
            folder: folder.folder_path,
            error: err.message
          });
        }
      }

      console.log(`[PromotionFolderWatcher] Scan complete: ${results.files_processed} files processed`);
      return results;

    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan a single folder for new files
   */
  async scanFolder(folder) {
    const { id, folder_path, manufacturer } = folder;
    const result = { processed: 0, failed: 0 };

    try {
      await fs.access(folder_path);
    } catch (err) {
      console.log(`[PromotionFolderWatcher] Folder not accessible: ${folder_path}`);
      return result;
    }

    // List files in folder
    const files = await fs.readdir(folder_path);
    const excelFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.xlsx', '.xls', '.csv'].includes(ext);
    });

    console.log(`[PromotionFolderWatcher] Found ${excelFiles.length} Excel files in ${folder_path}`);

    // Process each file
    for (const fileName of excelFiles) {
      const filePath = path.join(folder_path, fileName);

      try {
        await this.processFile(folder, filePath);
        result.processed++;
      } catch (err) {
        result.failed++;
        console.error(`[PromotionFolderWatcher] Failed to process ${fileName}:`, err.message);
      }
    }

    // Update last checked timestamp
    await this.pool.query(`
      UPDATE promotion_watch_folders
      SET last_checked_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    return result;
  }

  /**
   * Get all active watch folders from database
   */
  async getActiveFolders() {
    const result = await this.pool.query(`
      SELECT id, folder_path, manufacturer, check_interval_minutes
      FROM promotion_watch_folders
      WHERE is_active = true
      ORDER BY id
    `);
    return result.rows;
  }

  /**
   * Add a new watch folder
   */
  async addWatchFolder(folderPath, manufacturer = null, checkInterval = 60) {
    // Verify folder exists
    try {
      await fs.access(folderPath);
    } catch (err) {
      throw new Error(`Folder does not exist or is not accessible: ${folderPath}`);
    }

    const result = await this.pool.query(`
      INSERT INTO promotion_watch_folders (folder_path, manufacturer, check_interval_minutes)
      VALUES ($1, $2, $3)
      ON CONFLICT (folder_path) DO UPDATE SET
        manufacturer = EXCLUDED.manufacturer,
        check_interval_minutes = EXCLUDED.check_interval_minutes,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [folderPath, manufacturer, checkInterval]);

    const folder = result.rows[0];

    // Start watching if we're in continuous mode
    if (this.watchers.size > 0) {
      await this.watchFolder(folder);
    }

    return folder;
  }

  /**
   * Remove a watch folder
   */
  async removeWatchFolder(folderId) {
    // Stop watcher if running
    if (this.watchers.has(folderId)) {
      const watcher = this.watchers.get(folderId);
      await watcher.close();
      this.watchers.delete(folderId);
    }

    await this.pool.query(`
      UPDATE promotion_watch_folders
      SET is_active = false
      WHERE id = $1
    `, [folderId]);
  }

  /**
   * Get watch folder status
   */
  async getWatchFolderStatus() {
    const result = await this.pool.query(`
      SELECT
        pwf.*,
        (SELECT COUNT(*) FROM promotion_import_logs WHERE file_path LIKE pwf.folder_path || '%') as total_imports
      FROM promotion_watch_folders pwf
      ORDER BY pwf.created_at DESC
    `);

    return result.rows.map(row => ({
      ...row,
      is_watching: this.watchers.has(row.id)
    }));
  }
}

module.exports = PromotionFolderWatcher;
