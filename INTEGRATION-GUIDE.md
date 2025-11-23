# Revenue Features Integration Guide

## Status: Ready to Integrate

This guide shows exactly what to add to `QuotationManager.jsx` to integrate all revenue features.

---

## ✅ STEP 1: Imports (ALREADY DONE)

```javascript
import {
  FinancingCalculator,
  WarrantySelector,
  DeliverySelector,
  RebatesDisplay,
  TradeInEstimator
} from './RevenueFeatures';
```

---

## ✅ STEP 2: State Variables (ALREADY DONE)

```javascript
const [quoteFinancing, setQuoteFinancing] = useState(null);
const [quoteWarranties, setQuoteWarranties] = useState([]);
const [quoteDelivery, setQuoteDelivery] = useState(null);
const [quoteRebates, setQuoteRebates] = useState([]);
const [quoteTradeIns, setQuoteTradeIns] = useState([]);
const [showRevenueFeatures, setShowRevenueFeatures] = useState(false);
```

---

## ⏳ STEP 3: Update `calculateQuoteTotals()` Function

**Location:** Line 358

**Current Code:**
```javascript
const calculateQuoteTotals = () => {
  const subtotal = quoteItems.reduce((sum, item) =>
    sum + (item.sell * item.quantity), 0);
  const discount = (subtotal * discountPercent) / 100;
  const afterDiscount = subtotal - discount;
  const tax = afterDiscount * 0.13; // 13% HST
  const total = afterDiscount + tax;
  const totalCost = quoteItems.reduce((sum, item) =>
    sum + (item.cost * item.quantity), 0);
  const profit = afterDiscount - totalCost;
  const profitMargin = afterDiscount > 0 ? (profit / afterDiscount * 100) : 0;

  return { subtotal, discount, tax, total, profit, profitMargin };
};
```

**New Code (with revenue features):**
```javascript
const calculateQuoteTotals = () => {
  // Base product totals
  const subtotal = quoteItems.reduce((sum, item) =>
    sum + (item.sell * item.quantity), 0);
  const discount = (subtotal * discountPercent) / 100;
  const afterDiscount = subtotal - discount;

  // Add revenue features to subtotal
  let revenueAddOns = 0;

  // Add delivery cost
  if (quoteDelivery && quoteDelivery.calculation) {
    revenueAddOns += (quoteDelivery.calculation.totalCents / 100);
  }

  // Add warranties cost
  if (quoteWarranties.length > 0) {
    revenueAddOns += quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0);
  }

  // Subtract trade-ins
  let tradeInCredit = 0;
  if (quoteTradeIns.length > 0) {
    tradeInCredit = quoteTradeIns.reduce((sum, t) => sum + (t.estimatedValueCents / 100), 0);
  }

  // Subtract rebates
  let rebateCredit = 0;
  if (quoteRebates.length > 0) {
    rebateCredit = quoteRebates.reduce((sum, r) => {
      if (r.rebate_percent) {
        return sum + (afterDiscount * (r.rebate_percent / 100));
      }
      return sum + (r.rebate_amount_cents / 100);
    }, 0);
  }

  // Calculate final total with all add-ons and credits
  const afterAddOns = afterDiscount + revenueAddOns - tradeInCredit - rebateCredit;
  const tax = afterAddOns * 0.13; // 13% HST
  const total = afterAddOns + tax;

  // Calculate profit
  const totalCost = quoteItems.reduce((sum, item) =>
    sum + (item.cost * item.quantity), 0);
  const profit = afterAddOns - totalCost;
  const profitMargin = afterAddOns > 0 ? (profit / afterAddOns * 100) : 0;

  return {
    subtotal,
    discount,
    revenueAddOns,
    tradeInCredit,
    rebateCredit,
    afterAddOns,
    tax,
    total,
    profit,
    profitMargin,
    // Detailed breakdown for display
    deliveryCost: quoteDelivery ? (quoteDelivery.calculation.totalCents / 100) : 0,
    warrantiesCost: quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0),
    financing: quoteFinancing
  };
};
```

---

## ⏳ STEP 4: Add Revenue Features Section to Quote Builder UI

**Location:** After the product list section (around line 2800-2900)

**Add this section:**

```javascript
{/* ============================================ */}
{/* REVENUE FEATURES SECTION */}
{/* ============================================ */}
<div style={{
  marginTop: '30px',
  padding: '20px',
  backgroundColor: '#f8f9fa',
  borderRadius: '8px',
  border: '2px solid #4CAF50'
}}>
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  }}>
    <h3 style={{ margin: 0, color: '#4CAF50' }}>
      💰 Revenue Features - Maximize Your Sale!
    </h3>
    <button
      onClick={() => setShowRevenueFeatures(!showRevenueFeatures)}
      style={{
        padding: '10px 20px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold'
      }}
    >
      {showRevenueFeatures ? 'Hide Revenue Features' : 'Show Revenue Features'}
    </button>
  </div>

  {showRevenueFeatures && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Financing Calculator */}
      <FinancingCalculator
        quoteTotal={calculateQuoteTotals().total * 100} // Convert to cents
        onFinancingSelected={(financing) => {
          setQuoteFinancing(financing);
          console.log('Financing selected:', financing);
        }}
      />

      {/* Warranty Selector */}
      <WarrantySelector
        products={quoteItems}
        onWarrantyAdded={(warranty) => {
          setQuoteWarranties([...quoteWarranties, warranty]);
          console.log('Warranty added:', warranty);
        }}
      />

      {/* Delivery Selector */}
      <DeliverySelector
        customerAddress={selectedCustomer ?
          `${selectedCustomer.address}, ${selectedCustomer.city}` :
          'Customer address'
        }
        onDeliverySelected={(delivery) => {
          setQuoteDelivery(delivery);
          console.log('Delivery selected:', delivery);
        }}
      />

      {/* Rebates Display */}
      <RebatesDisplay
        products={quoteItems}
        onRebateApplied={(rebates) => {
          setQuoteRebates(rebates);
          console.log('Rebates applied:', rebates);
        }}
      />

      {/* Trade-In Estimator */}
      <TradeInEstimator
        onTradeInAdded={(tradeIn) => {
          setQuoteTradeIns([...quoteTradeIns, tradeIn]);
          console.log('Trade-in added:', tradeIn);
        }}
      />

      {/* Summary of Applied Features */}
      {(quoteFinancing || quoteWarranties.length > 0 || quoteDelivery ||
        quoteRebates.length > 0 || quoteTradeIns.length > 0) && (
        <div style={{
          backgroundColor: '#e8f5e9',
          padding: '20px',
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <h4 style={{ marginTop: 0 }}>Applied Revenue Features:</h4>

          {quoteFinancing && (
            <div style={{ marginBottom: '10px' }}>
              ✅ <strong>Financing:</strong> {quoteFinancing.plan.plan_name} -
              ${(quoteFinancing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month
            </div>
          )}

          {quoteWarranties.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              ✅ <strong>Warranties:</strong> {quoteWarranties.length} warranty plans added
              (${quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0).toFixed(2)})
            </div>
          )}

          {quoteDelivery && (
            <div style={{ marginBottom: '10px' }}>
              ✅ <strong>Delivery:</strong> {quoteDelivery.service.service_name} -
              ${(quoteDelivery.calculation.totalCents / 100).toFixed(2)}
            </div>
          )}

          {quoteRebates.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              ✅ <strong>Rebates:</strong> {quoteRebates.length} rebates applied
            </div>
          )}

          {quoteTradeIns.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              ✅ <strong>Trade-Ins:</strong> {quoteTradeIns.length} trade-ins -
              Credit: ${quoteTradeIns.reduce((sum, t) => sum + (t.estimatedValueCents / 100), 0).toFixed(2)}
            </div>
          )}

          <button
            onClick={() => {
              setQuoteFinancing(null);
              setQuoteWarranties([]);
              setQuoteDelivery(null);
              setQuoteRebates([]);
              setQuoteTradeIns([]);
            }}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear All Revenue Features
          </button>
        </div>
      )}
    </div>
  )}
</div>
```

---

## ⏳ STEP 5: Update Quote Total Display

**Location:** Where totals are displayed (around line 2844)

**Current display:**
```javascript
<div>Subtotal: ${totals.subtotal.toFixed(2)}</div>
<div>Discount: -${totals.discount.toFixed(2)}</div>
<div>Tax: ${totals.tax.toFixed(2)}</div>
<div>Total: ${totals.total.toFixed(2)}</div>
```

**Enhanced display:**
```javascript
<div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
    <span>Products Subtotal:</span>
    <strong>${totals.subtotal.toFixed(2)}</strong>
  </div>

  {totals.discount > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#f44336' }}>
      <span>Discount ({discountPercent}%):</span>
      <strong>-${totals.discount.toFixed(2)}</strong>
    </div>
  )}

  {totals.deliveryCost > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4CAF50' }}>
      <span>Delivery & Installation:</span>
      <strong>+${totals.deliveryCost.toFixed(2)}</strong>
    </div>
  )}

  {totals.warrantiesCost > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4CAF50' }}>
      <span>Extended Warranties:</span>
      <strong>+${totals.warrantiesCost.toFixed(2)}</strong>
    </div>
  )}

  {totals.tradeInCredit > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#2196F3' }}>
      <span>Trade-In Credit:</span>
      <strong>-${totals.tradeInCredit.toFixed(2)}</strong>
    </div>
  )}

  {totals.rebateCredit > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#2196F3' }}>
      <span>Manufacturer Rebates:</span>
      <strong>-${totals.rebateCredit.toFixed(2)}</strong>
    </div>
  )}

  <div style={{
    borderTop: '2px solid #ddd',
    marginTop: '10px',
    paddingTop: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px'
  }}>
    <span>Subtotal after add-ons:</span>
    <strong>${totals.afterAddOns.toFixed(2)}</strong>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
    <span>Tax (13% HST):</span>
    <strong>${totals.tax.toFixed(2)}</strong>
  </div>

  <div style={{
    borderTop: '2px solid #333',
    marginTop: '10px',
    paddingTop: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '18px',
    fontWeight: 'bold'
  }}>
    <span>TOTAL:</span>
    <span style={{ color: '#4CAF50' }}>${totals.total.toFixed(2)}</span>
  </div>

  {totals.financing && (
    <div style={{
      marginTop: '15px',
      padding: '10px',
      backgroundColor: '#e3f2fd',
      borderRadius: '4px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '14px', color: '#666' }}>Or as low as:</div>
      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2196F3' }}>
        ${(totals.financing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month
      </div>
      <div style={{ fontSize: '12px', color: '#666' }}>
        {totals.financing.plan.plan_name}
      </div>
    </div>
  )}
</div>
```

---

## ⏳ STEP 6: Update `saveQuote()` Function

**Location:** Line 373

**Current code doesn't save revenue features. Add this after line 394:**

```javascript
const quoteData = {
  customer_id: selectedCustomer.id,
  items: quoteItems,
  notes,
  internal_notes: internalNotes,
  terms,
  discount_percent: discountPercent,
  created_by: 'User',
  // NEW: Add revenue features
  revenue_features: {
    financing: quoteFinancing,
    warranties: quoteWarranties,
    delivery: quoteDelivery,
    rebates: quoteRebates,
    tradeIns: quoteTradeIns
  }
};
```

---

## ⏳ STEP 7: Reset Revenue Features on New Quote

**Add this to the `createNewQuote()` function (or equivalent):**

```javascript
const createNewQuote = () => {
  setView('builder');
  setSelectedCustomer(null);
  setQuoteItems([]);
  setDiscountPercent(0);
  setNotes('');
  setInternalNotes('');
  setEditingQuoteId(null);
  // NEW: Reset revenue features
  setQuoteFinancing(null);
  setQuoteWarranties([]);
  setQuoteDelivery(null);
  setQuoteRebates([]);
  setQuoteTradeIns([]);
  setShowRevenueFeatures(false);
};
```

---

## 🎯 WHERE TO ADD THESE CHANGES

**File:** `frontend/src/components/QuotationManager.jsx`

1. **Line 358** - Update `calculateQuoteTotals()` function
2. **Line 2800-2900** - Add revenue features UI section (after product list, before totals)
3. **Line 2844** - Update totals display
4. **Line 394** - Update `saveQuote()` to include revenue features
5. Find "createNewQuote" or equivalent - Reset revenue features

---

## ✅ TESTING CHECKLIST

After integration, test these scenarios:

1. **Financing Calculator**
   - [ ] Displays available plans
   - [ ] Calculates monthly payments correctly
   - [ ] Shows in quote total as "Or as low as"

2. **Warranties**
   - [ ] Shows warranty plans for products
   - [ ] Adds warranty cost to total
   - [ ] Can add multiple warranties

3. **Delivery**
   - [ ] Calculates delivery cost based on distance/floor
   - [ ] Weekend/evening premiums work
   - [ ] Adds to total correctly

4. **Rebates**
   - [ ] Shows active rebates
   - [ ] Subtracts from total
   - [ ] Can apply multiple rebates

5. **Trade-Ins**
   - [ ] Estimates trade-in value
   - [ ] Subtracts from total
   - [ ] Can add multiple trade-ins

6. **Total Calculation**
   - [ ] All add-ons included
   - [ ] All credits subtracted
   - [ ] Tax calculated correctly
   - [ ] Final total is accurate

---

## 📊 EXPECTED USER EXPERIENCE

**Before Revenue Features:**
```
Quote Total: $2,500
(Just products + tax)
```

**After Revenue Features:**
```
Products: $2,500
+ Delivery: $176
+ Warranties: $199
- Trade-In: -$250
- Rebate: -$500
= Subtotal: $2,125
+ Tax: $276
= TOTAL: $2,401

Or as low as: $200/month
```

**Result:** Higher profit margin, better customer value, increased win rate!

---

## 🚀 QUICK START

To integrate quickly:

1. Copy Step 3 code → Replace `calculateQuoteTotals()` function
2. Copy Step 4 code → Add after product list section
3. Copy Step 5 code → Replace totals display
4. Copy Step 6 code → Update `saveQuote()` function
5. Test with a sample quote!

---

## 💡 PRO TIPS

1. **Show revenue features by default** for new quotes - set `setShowRevenueFeatures(true)` initially
2. **Add tooltips** to explain each feature's benefit
3. **Auto-suggest financing** for quotes over $1,000
4. **Auto-apply rebates** if customer's products qualify
5. **Highlight profit increase** from add-ons in internal view

---

**Integration Status:** Ready to implement
**Estimated Time:** 30-60 minutes
**Difficulty:** Medium (mostly copy-paste with careful placement)

Let me know if you need help with any specific step!
