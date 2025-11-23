/**
 * CSV FORMAT CHECKER
 * Checks what columns are in your CSV files
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvFile = process.argv[2];

if (!csvFile) {
    console.log('Usage: node test-csv-format.js <path-to-csv-file>');
    process.exit(1);
}

try {
    const content = fs.readFileSync(csvFile, 'utf-8');
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
    });
    
    console.log('\n=== CSV FILE ANALYSIS ===');
    console.log(`File: ${csvFile}`);
    console.log(`Total rows: ${records.length}`);
    
    if (records.length > 0) {
        console.log('\n=== COLUMNS FOUND ===');
        const columns = Object.keys(records[0]);
        columns.forEach((col, idx) => {
            console.log(`${idx + 1}. ${col}`);
        });
        
        console.log('\n=== SAMPLE DATA (First Row) ===');
        console.log(JSON.stringify(records[0], null, 2));
    }
    
} catch (error) {
    console.error('Error:', error.message);
}