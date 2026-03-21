# XLSX → ExcelJS Migration Plan

**Date:** 2026-03-10
**Current package:** `xlsx` (SheetJS Community Edition) v0.18.5
**Target package:** `exceljs` (actively maintained)
**Severity:** HIGH — 1 high-severity vulnerability, no fix available

## 1. Vulnerability Summary

```
npm audit:
  xlsx  *
  Severity: high
  - Prototype Pollution in SheetJS (GHSA-4r6h-8v6p-xvw6)
  - Regular Expression Denial of Service / ReDoS (GHSA-5pgg-2g8v-p4x9)
  No fix available — package is unmaintained
```

The SheetJS community edition (`xlsx`) is no longer receiving security patches. The
commercial version (SheetJS Pro) has fixes, but requires a paid license. `exceljs` is
the recommended open-source alternative with active maintenance and compatible functionality.

---

## 2. Usage Audit — 50 Files

### 2.1 Breakdown by Operation Type

| Category | Count | Files |
|----------|-------|-------|
| **READ only** (no DB) | 11 | `debug-*.js` (6), `analyze-excel.js`, `get-all-stock.js`, `get-samsung-products.js`, `read-bb-files.js`, `read-whirlpool-pricelist.js` |
| **READ → DB** (read Excel, write to PostgreSQL) | 28 | All `import-*.js` scripts (25), `update-samsung-msrp.js`, `verify-cost-calculation.js`, `fix-whirlpool-manufacturers.js` |
| **READ only** (routes/services) | 4 | `routes/importTemplates.js`, `routes/price-imports.js`, `routes/products.js`, `services/PromotionImportService.js` |
| **WRITE only** | 4 | `routes/scheduled-reports.js`, `scripts/create-bb-export.js`, `scripts/extract-vesta-pdf.js`, `scripts/extract-jennair-pdf.js` |
| **BOTH** (read + write) | 1 | `scripts/bb-product-enrichment.js` |
| **Total** | **50** | |

### 2.2 Breakdown by Location

| Location | Count | Notes |
|----------|-------|-------|
| `routes/` | 3 | Production API — highest priority |
| `services/` | 1 | Production service — highest priority |
| `scripts/` | 45 | CLI/batch scripts — lower blast radius |
| `__tests__/` | 0 | No tests directly import xlsx |

---

## 3. XLSX API Methods Used

| xlsx Method | Files | exceljs Equivalent |
|-------------|-------|--------------------|
| `XLSX.readFile(path)` | 43 | `await workbook.xlsx.readFile(path)` |
| `XLSX.read(buffer, { type: 'buffer' })` | 4 | `await workbook.xlsx.load(buffer)` |
| `XLSX.utils.sheet_to_json(sheet, { header: 1 })` | 40 | `worksheet.getSheetValues()` then map rows, or `worksheet.eachRow()` to build array-of-arrays |
| `XLSX.utils.sheet_to_json(sheet, { defval: '' })` | 4 | `worksheet.eachRow()` with header-key mapping |
| `XLSX.utils.sheet_to_json(sheet, { range: N })` | 3 | `worksheet.eachRow()` starting from row N+1 |
| `XLSX.utils.decode_range(sheet['!ref'])` | 1 | `worksheet.dimensions` (returns `{ top, left, bottom, right }`) |
| `workbook.SheetNames` | 8 | `workbook.worksheets.map(ws => ws.name)` |
| `workbook.Sheets[name]` | 8 | `workbook.getWorksheet(name)` |
| `XLSX.utils.book_new()` | 5 | `new ExcelJS.Workbook()` |
| `XLSX.utils.aoa_to_sheet(data)` | 5 | `worksheet.addRows(data)` |
| `XLSX.utils.json_to_sheet(data)` | 1 | `worksheet.columns = [...]; worksheet.addRows(data)` |
| `XLSX.utils.book_append_sheet(wb, ws, name)` | 5 | `workbook.addWorksheet(name)` (returns the worksheet) |
| `XLSX.writeFile(wb, path)` | 5 | `await workbook.xlsx.writeFile(path)` |
| `ws['!cols'] = [{ wch: N }]` | 5 | `worksheet.columns = [{ width: N }, ...]` or `worksheet.getColumn(i).width = N` |

### Key Differences

1. **Synchronous → Asynchronous**: `xlsx` is fully synchronous. `exceljs` uses `async/await` for file I/O. Every `readFile`/`writeFile`/`read`/`load` call must be awaited.

2. **Array-of-arrays pattern**: `sheet_to_json({ header: 1 })` returns `[[val, val, ...], ...]`. In exceljs, the equivalent is:
   ```js
   const rows = [];
   worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
     rows.push(row.values.slice(1)); // row.values is 1-indexed, slot 0 is undefined
   });
   ```

3. **Object-keyed rows**: `sheet_to_json({ defval: '' })` returns `[{ Header1: val, Header2: val }, ...]`. In exceljs:
   ```js
   const headers = worksheet.getRow(1).values.slice(1);
   const rows = [];
   worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
     if (rowNumber === 1) return;
     const obj = {};
     headers.forEach((h, i) => { obj[h] = row.getCell(i + 1).value ?? ''; });
     rows.push(obj);
   });
   ```

4. **Column widths**: `ws['!cols'] = [{ wch: 20 }]` → `worksheet.getColumn(1).width = 20`

5. **Range/skip rows**: `{ range: N }` → start `eachRow` from row N+1.

---

## 4. Helper Module: `utils/excelReader.js`

To avoid rewriting 40+ nearly-identical `readFile → sheet_to_json` patterns, create a shared helper:

```js
// utils/excelReader.js
const ExcelJS = require('exceljs');

/**
 * Read an Excel file and return rows as array-of-arrays (like sheet_to_json({ header: 1 })).
 * Drop-in replacement for the xlsx readFile + sheet_to_json pattern.
 *
 * @param {string|Buffer} input - File path or Buffer
 * @param {Object} opts
 * @param {string}  [opts.sheet]    - Sheet name (default: first sheet)
 * @param {number}  [opts.range]    - Skip this many header rows (like xlsx { range: N })
 * @param {*}       [opts.defval]   - Default value for empty cells (default: undefined)
 * @param {boolean} [opts.asObjects] - Return [{header: val}] instead of arrays
 * @returns {Promise<{ rows: any[][], sheetNames: string[], sheetName: string }>}
 */
async function readExcel(input, opts = {}) {
  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(input)) {
    await workbook.xlsx.load(input);
  } else {
    await workbook.xlsx.readFile(input);
  }

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  const worksheet = opts.sheet
    ? workbook.getWorksheet(opts.sheet)
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`Sheet not found: ${opts.sheet || '(first)'}`);

  const startRow = (opts.range || 0) + 1;
  const rows = [];

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber < startRow) return;
    const values = row.values.slice(1).map(v => v ?? (opts.defval !== undefined ? opts.defval : undefined));
    rows.push(values);
  });

  if (opts.asObjects && rows.length > 0) {
    const headers = rows.shift();
    return {
      rows: rows.map(r => {
        const obj = {};
        headers.forEach((h, i) => { obj[h || `__col${i}`] = r[i]; });
        return obj;
      }),
      sheetNames,
      sheetName: worksheet.name
    };
  }

  return { rows, sheetNames, sheetName: worksheet.name };
}

module.exports = { readExcel, ExcelJS };
```

This reduces most script migrations to a 2-line change:
```diff
- const XLSX = require('xlsx');
+ const { readExcel } = require('../utils/excelReader');
  ...
- const workbook = XLSX.readFile(filePath);
- const sheet = workbook.Sheets[workbook.SheetNames[0]];
- const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
+ const { rows: data } = await readExcel(filePath, { defval: '' });
```

---

## 5. Migration Phases

### Phase 1 — Simple READ-only Scripts (Pilot)
**Scope:** 11 debug/read scripts with no DB writes, no downstream dependencies
**Effort:** ~4 hours
**Risk:** Minimal — these are developer CLI tools, not production paths

| File | Methods Used | Notes |
|------|-------------|-------|
| `scripts/debug-bosch.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/debug-bertazzoni.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/debug-whirlpool.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/debug-presrv.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/debug-fulgor.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/debug-thor.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/analyze-excel.js` | `readFile`, `sheet_to_json({header:1})` | Generic tool |
| `scripts/get-all-stock.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/get-samsung-products.js` | `readFile`, `sheet_to_json({header:1})` | 1 sheet |
| `scripts/read-bb-files.js` | `readFile`, `sheet_to_json({header:1})` | 2 files |
| `scripts/read-whirlpool-pricelist.js` | `readFile`, `sheet_to_json({header:1})` | Multi-sheet |

**Validation:** Run each script against its original Excel file, diff output vs pre-migration output.

---

### Phase 2 — READ → DB Import Scripts (Single Sheet)
**Scope:** 21 import scripts that read one sheet and upsert to PostgreSQL
**Effort:** ~8 hours (mechanical — all follow the same pattern via `readExcel` helper)
**Risk:** Low — scripts are run manually, not triggered by API requests

| File | Special Notes |
|------|--------------|
| `scripts/import-bosch.js` | Standard pattern |
| `scripts/import-bertazzoni.js` | Standard pattern |
| `scripts/import-fulgor.js` | Standard pattern |
| `scripts/import-presrv.js` | Standard pattern |
| `scripts/import-thor.js` | Standard pattern |
| `scripts/import-napoleon.js` | Standard pattern |
| `scripts/import-napoleon-fireplaces.js` | Standard pattern |
| `scripts/import-tcl.js` | Standard pattern |
| `scripts/import-sony-tv.js` | Standard pattern |
| `scripts/import-samsung-tv.js` | Standard pattern |
| `scripts/import-samsung-av.js` | Standard pattern |
| `scripts/import-lg-tv.js` | Standard pattern |
| `scripts/import-kitchenaid-small.js` | Standard pattern |
| `scripts/import-jennair.js` | Standard pattern |
| `scripts/import-vesta.js` | Standard pattern |
| `scripts/import-inventory.js` | Standard pattern |
| `scripts/import-pos-inventory.js` | Standard pattern |
| `scripts/import-ge-msrp.js` | Uses `{ range: 6 }` — skip 6 rows |
| `scripts/import-lg-msrp.js` | Uses `{ range: 4 }` — skip 4 rows |
| `scripts/update-samsung-msrp.js` | Uses `{ range: 3 }` — skip 3 rows |
| `scripts/import-hisense.js` | Weekly pricing columns — medium complexity |

**Validation:** Dry-run each script, compare DB query results before/after.

---

### Phase 3 — READ → DB Import Scripts (Multi-Sheet)
**Scope:** 7 scripts that read multiple worksheets
**Effort:** ~4 hours
**Risk:** Low-Medium — multi-sheet logic needs careful sheet name handling

| File | Sheets | Notes |
|------|--------|-------|
| `scripts/import-whirlpool-pricelist.js` | All sheets | Iterates SheetNames |
| `scripts/import-whirlpool-msrp.js` | All sheets | Multi-brand |
| `scripts/fix-whirlpool-manufacturers.js` | All sheets | Brand = sheet name |
| `scripts/verify-cost-calculation.js` | Named sheet | Specific sheet lookup |
| `scripts/import-yoder.js` | 2 sheets | Grills + accessories |
| `scripts/import-hisense-tv.js` | 3 sheets | Cost + MAP sheets |
| `scripts/import-bfbd.js` | Multiple | Per-brand sheets, different column layouts |

**Validation:** Same as Phase 2. `import-bfbd.js` is the most complex — test each brand sheet separately.

---

### Phase 4 — Complex Import Scripts
**Scope:** 2 high-complexity import scripts
**Effort:** ~3 hours
**Risk:** Medium — complex business logic intertwined with Excel parsing

| File | Complexity | Notes |
|------|-----------|-------|
| `scripts/import-samsung-pricelist.js` | Complex | Dry-run mode, transactions, column detection |
| `scripts/import-access-inventory.js` | Complex | 2942 products, brand normalization, conflict detection, CSV report |

**Validation:** Run in dry-run mode, compare full output report.

---

### Phase 5 — WRITE-only Scripts
**Scope:** 3 scripts + 1 route that create Excel files
**Effort:** ~4 hours
**Risk:** Medium — output format must be byte-identical in structure (not binary-identical)

| File | Features | Notes |
|------|----------|-------|
| `scripts/extract-vesta-pdf.js` | `book_new`, `aoa_to_sheet`, `writeFile`, `!cols` | PDF → Excel |
| `scripts/extract-jennair-pdf.js` | `book_new`, `aoa_to_sheet`, `writeFile`, `!cols` | PDF → Excel |
| `scripts/create-bb-export.js` | `book_new`, `aoa_to_sheet`, `writeFile`, `!cols`, 2 sheets | Best Buy template |
| `routes/scheduled-reports.js` | `book_new`, `aoa_to_sheet`, `json_to_sheet`, `writeFile`, `!cols` | **PRODUCTION** — generates reports sent via email |

**Validation:** Generate output file with both old and new code, open in Excel, compare visually and structurally. For `scheduled-reports.js`, generate a test report and verify email attachment opens correctly.

---

### Phase 6 — BOTH (Read + Write) Scripts
**Scope:** 1 file
**Effort:** ~2 hours
**Risk:** Medium-High — most complex xlsx usage in the codebase

| File | Features | Notes |
|------|----------|-------|
| `scripts/bb-product-enrichment.js` | All read + write methods, multi-sheet (4), column widths | Reads inventory, writes Best Buy export |

**Validation:** Run with test inventory file, diff output Excel against pre-migration output.

---

### Phase 7 — Production Routes and Services (Highest Priority)
**Scope:** 4 files that handle live API traffic
**Effort:** ~6 hours (extra time for integration testing)
**Risk:** HIGH — these serve the frontend and process user uploads

| File | Type | Methods | Downstream |
|------|------|---------|-----------|
| `routes/importTemplates.js` | READ | `read(buffer)`, `sheet_to_json({header:1})` | Frontend: ProductImportWizard, ManufacturerTemplateManager |
| `routes/price-imports.js` | READ | `readFile`, `sheet_to_json({header:1})` | Frontend: price import UI |
| `routes/products.js` | READ | `read(buffer)`, `sheet_to_json` (2 variants), `decode_range` | Frontend: product import, core product CRUD |
| `services/PromotionImportService.js` | READ | `read(buffer)`, `sheet_to_json({header:1})` | `manufacturerPromotions.js`, `PromotionFolderWatcher.js` |

**Validation:**
- Unit tests for each file's Excel parsing logic
- Integration test: upload a real vendor Excel file through the API, verify parsed output
- Regression test: `products.js` `decode_range` replacement must handle offset headers correctly

> **Note:** Despite being highest risk, Phase 7 is scheduled last because the earlier phases
> build confidence with the `readExcel` helper and establish patterns. The production routes
> will use the same helper, battle-tested across 45 scripts.

---

## 6. Risk Assessment

### 5 Highest-Risk Files (Most Complex / Most Dependencies)

| # | File | Risk Factors |
|---|------|-------------|
| 1 | **`routes/products.js`** | Core product route, uses `decode_range`, two `sheet_to_json` variants, heavy frontend dependency |
| 2 | **`routes/scheduled-reports.js`** | Only production WRITE path, generates Excel attachments sent via email to users |
| 3 | **`routes/importTemplates.js`** | Frontend upload pipeline depends on exact parsed output format |
| 4 | **`scripts/bb-product-enrichment.js`** | Only file with BOTH read + write, 4-sheet output, column widths |
| 5 | **`scripts/import-samsung-pricelist.js`** | Most complex import logic — dry-run, transactions, detailed reporting |

### 5 Lowest-Risk Files (Phase 1 Pilot Candidates)

| # | File | Why Low Risk |
|---|------|-------------|
| 1 | **`scripts/debug-bosch.js`** | Read-only, console output, no DB, no downstream deps |
| 2 | **`scripts/debug-bertazzoni.js`** | Same — pure debugging tool |
| 3 | **`scripts/analyze-excel.js`** | Generic utility, read-only, trivial |
| 4 | **`scripts/get-samsung-products.js`** | Read-only, console output |
| 5 | **`scripts/get-all-stock.js`** | Read-only, console output |

---

## 7. Test Strategy

### Per-File Validation

Every migrated file must pass this checklist before the xlsx import is removed:

- [ ] **Output parity**: Run with the same input file using both `xlsx` and `exceljs` code paths. Diff the parsed output (arrays/objects). Must be identical.
- [ ] **Edge cases**: Empty sheets, sheets with merged cells, sheets starting at row > 1, files with > 10k rows.
- [ ] **Performance**: Timed comparison — `exceljs` streams large files and should be comparable or faster.
- [ ] **Write parity** (write files only): Open generated Excel in Microsoft Excel and LibreOffice. Verify column widths, sheet names, data integrity.

### Integration Tests (Production Routes)

- [ ] Upload a real vendor price list through `POST /api/import-templates/detect` — verify headers detected
- [ ] Upload a mixed CSV/Excel file through `POST /api/products/import` — verify product import
- [ ] Trigger a scheduled report generation — verify Excel attachment in email
- [ ] Upload a promotion Excel through the promotion import endpoint — verify products matched

### Regression Gate

Before merging any phase, run the full backend test suite (1,207 tests) and verify zero regressions.

---

## 8. Effort Estimate

| Phase | Scope | Files | Effort | Cumulative |
|-------|-------|-------|--------|-----------|
| **0** | Install exceljs, create `utils/excelReader.js` helper | 1 new | 1 hour | 1 hour |
| **1** | Simple read-only scripts (pilot) | 11 | 4 hours | 5 hours |
| **2** | Single-sheet import scripts | 21 | 8 hours | 13 hours |
| **3** | Multi-sheet import scripts | 7 | 4 hours | 17 hours |
| **4** | Complex import scripts | 2 | 3 hours | 20 hours |
| **5** | Write-only scripts + report route | 4 | 4 hours | 24 hours |
| **6** | Read+write scripts | 1 | 2 hours | 26 hours |
| **7** | Production routes & services | 4 | 6 hours | 32 hours |
| **8** | Remove `xlsx` from package.json, final audit | — | 1 hour | **33 hours** |
| | | **50 files** | | **~33 hours** |

**Calendar estimate:** 4–5 developer-days spread across 2–3 sprints.

---

## 9. Migration Checklist

- [ ] `npm install exceljs`
- [ ] Create `utils/excelReader.js` shared helper
- [ ] Phase 1: Migrate 11 debug/read scripts
- [ ] Phase 2: Migrate 21 single-sheet import scripts
- [ ] Phase 3: Migrate 7 multi-sheet import scripts
- [ ] Phase 4: Migrate 2 complex import scripts
- [ ] Phase 5: Migrate 4 write files (including `scheduled-reports.js`)
- [ ] Phase 6: Migrate `bb-product-enrichment.js`
- [ ] Phase 7: Migrate 4 production routes/services
- [ ] Phase 8: `npm uninstall xlsx` — verify `npm audit` is clean
- [ ] Full test suite passes (1,207+ tests)
- [ ] Manual QA on frontend Excel upload workflows

---

## 10. SR&ED Tax Credit Note

**This migration qualifies as SR&ED-eligible engineering work** under the following criteria:

- **Technological uncertainty:** The `xlsx` (SheetJS) library has known Prototype Pollution
  (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9) vulnerabilities with no upstream
  fix available. The community edition is unmaintained. Migrating 50 files from a synchronous
  API (`xlsx`) to an asynchronous streaming API (`exceljs`) requires non-trivial architectural
  changes — including converting synchronous scripts to async, handling different row indexing
  models (0-based vs 1-based), and ensuring byte-level output compatibility for downstream
  consumers (email attachments, marketplace exports).

- **Systematic investigation:** Each file requires analysis of its specific xlsx API usage
  pattern, creation of equivalent exceljs code, and validation that parsed output is
  identical. The `readExcel` helper module represents a generalized solution to the
  read-pattern problem, reducing 43 files to a common abstraction.

- **Non-routine engineering:** This is not a simple find-and-replace. Key challenges include:
  - Converting `sheet_to_json({ header: 1 })` semantics (which returns clean arrays with
    `defval` substitution) to `eachRow()` iteration (which returns 1-indexed sparse arrays)
  - Replacing `decode_range(sheet['!ref'])` with exceljs `worksheet.dimensions` for
    dynamic header row detection in `products.js`
  - Ensuring column width `wch` units map correctly to exceljs `width` units
  - Maintaining output format compatibility for Best Buy Marketplace Excel exports

- **Recommended SR&ED claim categories:**
  - Security vulnerability remediation (replacing deprecated library)
  - API migration engineering (synchronous → asynchronous)
  - Abstraction layer design (`readExcel` helper)
  - Validation and testing framework (output parity testing)

**Estimated qualifying hours:** 33 hours of engineering + 5 hours of documentation and testing = **38 hours total**.
