/**
 * IMPORT CONFIGURATION
 * ====================
 * Configuration for CSV import from Excel automation system
 */

require('dotenv').config();

module.exports = {
    // Path to cleaned_data folder from Excel automation
    cleanedDataPath: process.env.CLEANED_DATA_PATH || 
        'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\Appliance Cost\\cleaned_data',
    
    // Path to price reports from Excel automation
    priceReportsPath: process.env.PRICE_REPORTS_PATH || 
        'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\Appliance Cost',
    
    // Auto-import settings
    autoImportEnabled: process.env.AUTO_IMPORT_ENABLED === 'true',
    syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '15'),
    
    // Column mappings from CSV to database
    columnMappings: {
        // Primary mappings
        'MANUFACTURER': 'manufacturer',
        'BRAND_NAME': 'manufacturer',
        'MODEL': 'model',
        'ACTUAL_COST': 'actual_cost',
        'MSRP': 'msrp',
        'CATEGORY': 'category',
        'SUBCATEGORY': 'subcategory',
        'DESCRIPTION': 'description',
        
        // Alternative column names (from different manufacturers)
        'DETAIL_STAGING': 'description',
        'CATEGORY_STAGING': 'category',
        'SUBCATEGORY_STAGING': 'subcategory',
        'BRAND': 'manufacturer',
        'ACTUAL_COST_PRE_TAX': 'actual_cost',
        'RETAIL_PRICE': 'msrp'
    },
    
    // Required fields for valid product
    requiredFields: ['model', 'manufacturer'],
    
    // Price conversion
    priceMultiplier: 100, // Convert dollars to cents
    
    // Import rules
    rules: {
        // Skip rows with these values in MODEL column
        skipModels: ['', 'N/A', 'TBD', 'DISCONTINUED'],
        
        // Minimum price (in cents) to be considered valid
        minPrice: 100, // $1.00
        
        // Maximum price (in cents) to prevent errors
        maxPrice: 10000000, // $100,000
        
        // Auto-categorize uncategorized products
        autoCategorize: true,
        
        // Default category for uncategorized products
        defaultCategory: 'Uncategorized',
        
        // Update existing products on import
        updateExisting: true,
        
        // Track price history
        trackPriceHistory: true
    },
    
    // Manufacturer-specific rules
    manufacturerRules: {
        'SAMSUNG': {
            categoryPatterns: {
                'RF': 'Refrigerators',
                'DV': 'Dryers',
                'WF': 'Washers',
                'NE': 'Ranges',
                'DW': 'Dishwashers'
            }
        },
        'LG': {
            categoryPatterns: {
                'LR': 'Refrigerators',
                'DLE': 'Dryers',
                'WM': 'Washers',
                'LSE': 'Ranges',
                'LDF': 'Dishwashers'
            }
        },
        'WHIRLPOOL': {
            categoryPatterns: {
                'WR': 'Refrigerators',
                'WED': 'Dryers',
                'WFW': 'Washers',
                'WFE': 'Ranges',
                'WDF': 'Dishwashers'
            }
        }
    },
    
    // Notification settings
    notifications: {
        enabled: process.env.NOTIFICATION_ENABLED === 'true',
        email: {
            to: process.env.NOTIFICATION_EMAIL,
            from: process.env.EMAIL_FROM,
            sendOnSuccess: true,
            sendOnError: true,
            sendOnPriceChange: true,
            priceChangeThreshold: 10 // Notify if price changes > 10%
        }
    },
    
    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        logToFile: true,
        logPath: './logs/import.log'
    }
};