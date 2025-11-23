# Product Import Template Usage Guide

## 📁 Template File
**Location:** `product-import-template.csv`

This template contains 25 example products from 10 major appliance manufacturers to help you understand the proper formatting.

---

## 🎯 Quick Start

### Option 1: Edit in Excel (Recommended)
1. **Open the template:**
   - Right-click `product-import-template.csv`
   - Select "Open with" → "Microsoft Excel"

2. **Configure Excel for proper CSV formatting:**
   - Click on columns C and D (ACTUAL_COST and MSRP)
   - Right-click → Format Cells
   - Select "Number" category
   - Set decimal places to 2
   - Uncheck "Use 1000 Separator (,)"
   - Click OK

3. **Replace example data with your products:**
   - Keep the header row (line 1) exactly as is
   - Delete the example rows (lines 2-26)
   - Add your product data

4. **Save properly:**
   - File → Save As
   - File type: **CSV (Comma delimited) (*.csv)**
   - Click Save
   - If Excel warns about features, click "Yes" to keep CSV format

### Option 2: Edit in Google Sheets
1. **Upload to Google Drive**
2. **Open with Google Sheets**
3. **Edit your data**
4. **Download as CSV:**
   - File → Download → Comma Separated Values (.csv)

---

## 📋 Field Specifications

### 1. MANUFACTURER (Required)
- **What it is:** Brand name or manufacturer name
- **Format:** Text, no special characters
- **Examples:**
  - ✅ Bosch
  - ✅ KitchenAid
  - ✅ Sub-Zero (hyphen is OK)
  - ❌ Bosch (USA) - no parentheses
  - ❌ Bosch/Thermador - no slashes

### 2. MODEL (Required)
- **What it is:** Unique model number/identifier
- **Format:** Alphanumeric, case-sensitive
- **Examples:**
  - ✅ SHX878WD5N
  - ✅ KDTE334GPS
  - ✅ RF23M8570SR
  - ❌ Model#SHX878 - no special characters
  - ❌ SHX 878 - no spaces

### 3. ACTUAL_COST (Recommended)
- **What it is:** Your cost to purchase the product (wholesale/dealer cost)
- **Format:** Numbers only, 2 decimal places, NO dollar sign
- **Examples:**
  - ✅ 599.00
  - ✅ 2499.99
  - ✅ 15000.00
  - ❌ $599.00 - no dollar sign
  - ❌ 599 - must have decimals
  - ❌ 1,599.00 - no commas

### 4. MSRP (Recommended)
- **What it is:** Manufacturer's Suggested Retail Price
- **Format:** Numbers only, 2 decimal places, NO dollar sign
- **Same rules as ACTUAL_COST**

### 5. CATEGORY (Optional but Recommended)
- **What it is:** Main product category
- **Format:** Text, consistent naming
- **Standard Categories:**
  - Dishwashers
  - Refrigerators
  - Ranges
  - Ovens
  - Cooktops
  - Hoods
  - Ice Makers
  - Wine Coolers
  - Microwaves

### 6. SUBCATEGORY (Optional)
- **What it is:** More specific product classification
- **Examples:**
  - Built-In
  - French Door
  - Wall Oven
  - Dual Fuel
  - Induction
  - Side-by-Side

### 7. DESCRIPTION (Optional but Recommended)
- **What it is:** Full product description
- **Format:** Text, be descriptive
- **Best Practices:**
  - Include size/dimensions
  - Mention key features
  - Keep under 200 characters
  - Use proper grammar
- **Examples:**
  - ✅ 24" Built-In Dishwasher with Top Controls and Flexible Rack System
  - ✅ 36" French Door Refrigerator with Bottom Freezer and Water Dispenser
  - ❌ dishwasher - too vague
  - ❌ BEST DISHWASHER EVER!!! - unprofessional

---

## ✅ Pre-Import Checklist

Before importing your CSV, verify:

- [ ] Header row is present and matches exactly: `MANUFACTURER,MODEL,ACTUAL_COST,MSRP,CATEGORY,SUBCATEGORY,DESCRIPTION`
- [ ] No extra columns added
- [ ] No empty rows between data
- [ ] MANUFACTURER and MODEL filled for every row
- [ ] Prices formatted as numbers with 2 decimals (no $ or commas)
- [ ] Model numbers are unique within each manufacturer
- [ ] File saved as .csv format (not .xlsx or .xls)
- [ ] File encoding is UTF-8 (default for most systems)

---

## 🚀 Importing Your CSV

### Method 1: Web Interface (Easiest)
1. Open your Quotation App: http://localhost:3000
2. Click on **"Products"** tab
3. Select **"Import Monitor"** sub-tab
4. Click **"Choose File"** or drag your CSV file
5. Click **"📤 Upload CSV"**
6. Wait for success message
7. Products will auto-refresh after import

### Method 2: Standalone Upload Page
1. Open `import-products.html` in your browser
2. Drag and drop your CSV file
3. Click **"Upload CSV"**
4. View import results
5. Refresh Products page to see new items

---

## 📊 Understanding Import Results

After import, you'll see a summary:

```
✅ Import Successful!
Total: 25
Successful: 25
New Products: 20
Updated: 5
Duration: 0.5 seconds
```

**What this means:**
- **Total:** Total rows processed in your CSV
- **Successful:** Rows imported without errors
- **New Products:** Brand new products added to database
- **Updated:** Existing products that had prices updated
- **Duration:** How long the import took

---

## 🔍 Common Issues and Solutions

### Issue 1: "Missing required fields"
**Cause:** MANUFACTURER or MODEL column is empty
**Fix:** Ensure every row has both MANUFACTURER and MODEL filled in

### Issue 2: "Invalid price format"
**Cause:** Prices contain dollar signs, commas, or text
**Fix:** Remove all non-numeric characters except decimal point
- Wrong: $599.00 or 1,599.00
- Right: 599.00 or 1599.00

### Issue 3: "Duplicate model number"
**Cause:** Same model number appears multiple times for same manufacturer
**Fix:** Make model numbers unique, or remove duplicate rows

### Issue 4: Products imported but not showing
**Cause:** Frontend hasn't refreshed
**Fix:** Click the "🔄 Refresh Data" button in the Product Management header

### Issue 5: Excel corrupts the CSV
**Cause:** Excel auto-formats numbers or adds extra quotes
**Fix:**
1. When saving, choose "CSV (Comma delimited) (*.csv)"
2. Close file and reopen in Notepad to verify format
3. Check that prices don't have quotes: `599.00` not `"599.00"`

---

## 💡 Pro Tips

### Tip 1: Start Small
Import 5-10 products first to test the system before bulk importing hundreds

### Tip 2: Keep Backups
Save a copy of your original CSV before importing in case you need to make changes

### Tip 3: Use Consistent Naming
- Always spell manufacturer names the same way (Bosch vs BOSCH vs bosch)
- Use consistent category names
- This makes searching easier later

### Tip 4: Price Strategy
- ACTUAL_COST should be your real wholesale cost
- MSRP can be the manufacturer's suggested retail
- You can adjust your selling price when creating quotes

### Tip 5: Descriptive Descriptions
Good descriptions help you find products faster when creating quotes:
- Include dimensions (24", 30", 36")
- Mention key features (Built-In, French Door, Induction)
- Note special capabilities (AutoDos, ProWash, Family Hub)

---

## 📞 Need Help?

If you encounter issues:
1. Check the import logs in the Backend console
2. Review the error messages in the import response
3. Verify your CSV matches the template format
4. Try importing the template file itself to test the system

---

## 🎉 You're Ready!

Your template includes:
- ✅ 25 real-world examples
- ✅ 10 different manufacturers
- ✅ Multiple product categories
- ✅ Properly formatted prices
- ✅ Professional descriptions

**Next steps:**
1. Open `product-import-template.csv` in Excel
2. Replace example data with your products
3. Save as CSV
4. Import into your system
5. Start creating quotes!
