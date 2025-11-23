# CSV Import Guide for Quotation App

## ✅ System Status: FULLY OPERATIONAL

### Import Test Results (2025-11-20)
- **Status**: ✅ SUCCESS
- **File**: new-manufacturer-template.csv
- **Total Products**: 10 products
- **Successful**: 10/10 (100%)
- **New Manufacturers Added**: Bosch, Miele, SubZero, Wolf
- **Duration**: 0.41 seconds
- **Errors**: 0

---

## 📋 CSV Format

### Required Columns:
- **MANUFACTURER** (or BRAND_NAME or BRAND) - Required
- **MODEL** - Required

### Recommended Columns:
- **ACTUAL_COST** (or ACTUAL_COST_PRE_TAX) - Product cost in dollars
- **MSRP** (or RETAIL_PRICE) - Retail price in dollars
- **CATEGORY** - Product category
- **SUBCATEGORY** - Product subcategory
- **DESCRIPTION** - Product description

### Example CSV Format:
```csv
MANUFACTURER,MODEL,ACTUAL_COST,MSRP,CATEGORY,SUBCATEGORY,DESCRIPTION
Bosch,SHX878WD5N,599.00,999.00,Dishwashers,Built-In,24" Built-In Dishwasher
Miele,G7316SCUSS,1299.00,2199.00,Dishwashers,Built-In,24" Built-In Dishwasher
```

---

## 🚀 How to Import CSV Files

### Method 1: Web Interface (Recommended)
1. Open http://localhost:3000 in your browser
2. Navigate to **Products** section
3. Click **"Import CSV"** button
4. Select your CSV file
5. Click **"Upload"**
6. Review import summary

### Method 2: Command Line (Advanced)
```bash
curl -X POST http://localhost:3001/api/products/import-csv \
  -F "csvfile=@path/to/your-file.csv"
```

### Method 3: PowerShell (Windows)
```powershell
$uri = "http://localhost:3001/api/products/import-csv"
$filePath = "C:\path\to\your-file.csv"
$form = @{
    csvfile = Get-Item -Path $filePath
}
Invoke-RestMethod -Uri $uri -Method Post -Form $form
```

---

## 📁 Sample Template Files

### Location:
- **Sample CSV**: `C:\Users\davem\OneDrive\Documents\Quotationapp_Backup\new-manufacturer-template.csv`
- **This Guide**: `C:\Users\davem\OneDrive\Documents\Quotationapp_Backup\CSV-IMPORT-GUIDE.md`

### Template Contents:
The sample CSV contains 10 products from 4 manufacturers:
- Bosch (3 products)
- Miele (3 products)
- SubZero (2 products)
- Wolf (2 products)

---

## ✨ Import Features

### Automatic Processing:
✅ Prices converted from dollars to cents automatically
✅ Duplicate detection by model number
✅ Existing products updated (not duplicated)
✅ Price history tracked for existing products
✅ Import logs saved for review
✅ Validation errors reported with line numbers

### Column Name Flexibility:
The system accepts multiple column name variations:
- **Manufacturer**: MANUFACTURER, BRAND_NAME, BRAND
- **Cost**: ACTUAL_COST, ACTUAL_COST_PRE_TAX
- **Price**: MSRP, RETAIL_PRICE
- **Category**: CATEGORY, CATEGORY_STAGING
- **Description**: DESCRIPTION, DETAIL_STAGING

---

## 🎯 Import Results

### Successfully Imported Manufacturers:

1. **Bosch**
   - Model: SHX878WD5N (Dishwasher - $599/$999)
   - Model: B36CL80ENS (Refrigerator - $2499/$3999)
   - Model: HBL8451UC (Wall Oven - $1899/$2999)

2. **Miele**
   - Model: G7316SCUSS (Dishwasher - $1299/$2199)
   - Model: HR1924DF (Dual Fuel Range - $8999/$12999)
   - Model: DA6698W (Hood - $1699/$2799)

3. **SubZero**
   - Model: BI36UFDIDSPH (Refrigerator - $8999/$14999)
   - Model: IC30CIDRH (Ice Maker - $3499/$5999)

4. **Wolf**
   - Model: DF304 (Dual Fuel Range - $3299/$5499)
   - Model: ICBMDD30 (Induction Cooktop - $2999/$4999)

---

## 🔍 Verify Your Import

### Search for Products:
```bash
# Search for Bosch products
curl "http://localhost:3001/api/products?search=Bosch&limit=5"

# Search for specific model
curl "http://localhost:3001/api/products?search=SHX878WD5N"
```

### Or search in the web app:
1. Go to **New Quote** view
2. Type manufacturer name in the product search box
3. Your new products will appear!

---

## 📊 Import Statistics

### Current Database Status:
- **Endpoint**: http://localhost:3001/api/products/import-csv
- **Status**: ✅ OPERATIONAL
- **Backend**: ✅ RUNNING (port 3001)
- **Frontend**: ✅ RUNNING (port 3000)
- **Database**: ✅ CONNECTED

### Import Rules:
- Minimum price: $1.00
- Maximum price: $100,000
- Auto-categorize uncategorized products: YES
- Update existing products: YES
- Track price history: YES

---

## 🛠️ Troubleshooting

### Common Issues:

**Issue**: "No file uploaded"
**Solution**: Ensure field name is "csvfile" in the upload form

**Issue**: "Missing required fields"
**Solution**: Ensure MANUFACTURER and MODEL columns exist

**Issue**: "Invalid price format"
**Solution**: Use decimal format (e.g., 599.99, not $599.99)

**Issue**: Products not showing in search
**Solution**: Refresh browser (Ctrl+Shift+R) and try again

### Get Help:
- Check import logs in backend console
- Review validation errors in import response
- Verify CSV format matches template

---

## 📝 Notes

- CSV files must be saved with UTF-8 encoding
- Model numbers must be unique per manufacturer
- Prices are stored in cents internally (multiply by 100)
- Import logs are saved automatically
- Large files (>10,000 rows) may take several minutes

---

## 🎉 Success!

Your CSV import system is fully configured and tested. You can now:
1. ✅ Import new manufacturers via CSV
2. ✅ Add products in bulk
3. ✅ Update existing product prices
4. ✅ Track price changes over time
5. ✅ Search and use products in quotes

**Next Steps:**
- Create your own CSV file using the template
- Import your manufacturer data
- Start building quotes with your new products!
