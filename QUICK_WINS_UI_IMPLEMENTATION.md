# Quick Wins - UI Implementation Guide

## ✅ COMPLETED
- State variables added
- fetchEmailTemplates() function added
- saveQuote() updated to include protection settings
- PDF service enhanced with watermarking

## 🚧 REMAINING UI COMPONENTS TO ADD

### 1. Quote Protection Settings Panel (in Builder View)

**Location:** In QuotationManager.jsx, find the builder view section (around line 2200-2300) where you have the quote items table. Add this panel AFTER the quote items table but BEFORE the "Save Quote" buttons.

**Code to add:**

```jsx
{/* QUOTE PROTECTION SETTINGS */}
<div style={{
  background: 'white',
  borderRadius: '12px',
  padding: '24px',
  marginTop: '24px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
}}>
  <h3 style={{
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }}>
    🔒 Quote Protection Settings
  </h3>

  <div style={{ display: 'grid', gap: '16px' }}>
    {/* Hide Model Numbers */}
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      cursor: 'pointer',
      padding: '12px',
      background: '#f9fafb',
      borderRadius: '8px'
    }}>
      <input
        type="checkbox"
        checked={hideModelNumbers}
        onChange={(e) => setHideModelNumbers(e.target.checked)}
        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
      />
      <div>
        <div style={{ fontWeight: '600', fontSize: '14px' }}>
          Hide Model Numbers (Customer-Facing Quote)
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Protects pricing from competitors. Shows only product descriptions.
        </div>
      </div>
    </label>

    {/* Watermark Settings */}
    <div style={{
      padding: '12px',
      background: '#f9fafb',
      borderRadius: '8px'
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <input
          type="checkbox"
          checked={watermarkEnabled}
          onChange={(e) => setWatermarkEnabled(e.target.checked)}
          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
        />
        <span style={{ fontWeight: '600', fontSize: '14px' }}>
          Enable PDF Watermark
        </span>
      </label>

      {watermarkEnabled && (
        <div style={{ marginLeft: '32px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Watermark Text:
          </label>
          <input
            type="text"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="CONFIDENTIAL - FOR {CUSTOMER} ONLY"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            Use {"{CUSTOMER}"} for customer name placeholder
          </div>
        </div>
      )}
    </div>

    {/* Quote Expiry Date */}
    <div style={{
      padding: '12px',
      background: '#f9fafb',
      borderRadius: '8px'
    }}>
      <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
        Quote Expires:
      </label>
      <input
        type="date"
        value={quoteExpiryDate}
        onChange={(e) => setQuoteExpiryDate(e.target.value)}
        min={new Date().toISOString().split('T')[0]}
        style={{
          padding: '8px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '14px'
        }}
      />
      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
        Default: 14 days from creation
      </div>
    </div>
  </div>
</div>
```

---

### 2. Email Template Selector (in Email Dialog)

**Location:** In QuotationManager.jsx, find the email dialog (search for "showEmailDialog" around line 3200-3400). Add this BEFORE the email subject input field.

**Code to add:**

```jsx
{/* Email Template Selector */}
<div style={{ marginBottom: '16px' }}>
  <label style={{
    display: 'block',
    fontWeight: '600',
    marginBottom: '8px'
  }}>
    📧 Email Template:
  </label>
  <select
    value={selectedEmailTemplate || ''}
    onChange={(e) => {
      const templateId = e.target.value;
      if (templateId) {
        const template = emailTemplates.find(t => t.id === parseInt(templateId));
        if (template) {
          setEmailSubject(template.subject_line
            .replace('{quote_number}', selectedQuote.quote_number || selectedQuote.id)
            .replace('{customer_name}', selectedQuote.customer_name)
          );
          setEmailMessage(template.body_text
            .replace('{customer_first_name}', selectedQuote.customer_name.split(' ')[0])
            .replace('{customer_name}', selectedQuote.customer_name)
            .replace('{quote_number}', selectedQuote.quote_number || selectedQuote.id)
            .replace('{quote_date}', new Date(selectedQuote.created_at).toLocaleDateString())
            .replace('{product_summary}', `${quoteItems.length} items`)
            .replace('{quote_expiry_date}', quoteExpiryDate || 'TBD')
            .replace('{sales_rep_name}', 'Sales Team')
            .replace('{sales_rep_phone}', '(416) 555-1234')
          );
          setSelectedEmailTemplate(templateId);
        }
      }
    }}
    style={{
      width: '100%',
      padding: '10px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
      background: 'white'
    }}
  >
    <option value="">-- Select a template or write custom message --</option>
    {emailTemplates.map(template => (
      <option key={template.id} value={template.id}>
        {template.name} ({template.category})
      </option>
    ))}
  </select>

  {/* Show talking points if template selected */}
  {selectedEmailTemplate && emailTemplates.find(t => t.id === parseInt(selectedEmailTemplate))?.talking_points?.length > 0 && (
    <div style={{
      marginTop: '12px',
      padding: '12px',
      background: '#fef3c7',
      borderRadius: '6px',
      fontSize: '12px'
    }}>
      <strong>💡 Talking Points for Follow-Up Call:</strong>
      <ul style={{ margin: '8px 0 0 20px', paddingLeft: '0' }}>
        {emailTemplates.find(t => t.id === parseInt(selectedEmailTemplate)).talking_points.map((point, idx) => (
          <li key={idx} style={{ marginTop: '4px' }}>{point}</li>
        ))}
      </ul>
    </div>
  )}
</div>
```

---

### 3. Quote Expiry Indicators (in List View)

**Location:** In QuotationManager.jsx, find the quote list rendering (search for "sortedQuotes.map" around line 1850-2000). In the quote card/row display, add this indicator next to the quote status.

**Helper Function** - Add this before the return statement:

```jsx
const getExpiryInfo = (expiryDate) => {
  if (!expiryDate) return null;

  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) {
    return { text: 'EXPIRED', color: '#dc2626', bg: '#fee2e2', urgent: true };
  } else if (daysUntilExpiry === 0) {
    return { text: 'Expires Today!', color: '#dc2626', bg: '#fee2e2', urgent: true };
  } else if (daysUntilExpiry <= 3) {
    return { text: `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`, color: '#dc2626', bg: '#fee2e2', urgent: true };
  } else if (daysUntilExpiry <= 7) {
    return { text: `Expires in ${daysUntilExpiry} days`, color: '#ea580c', bg: '#ffedd5', urgent: false };
  } else if (daysUntilExpiry <= 14) {
    return { text: `Expires in ${daysUntilExpiry} days`, color: '#ca8a04', bg: '#fef3c7', urgent: false };
  }

  return null;
};
```

**UI Component** - Add this in the quote card display:

```jsx
{/* Expiry Warning Badge */}
{getExpiryInfo(quote.quote_expiry_date) && (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    background: getExpiryInfo(quote.quote_expiry_date).bg,
    color: getExpiryInfo(quote.quote_expiry_date).color,
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    marginLeft: '8px'
  }}>
    {getExpiryInfo(quote.quote_expiry_date).urgent && '⚠️ '}
    {getExpiryInfo(quote.quote_expiry_date).text}
  </div>
)}
```

---

### 4. Reset Protection Settings (in resetBuilder function)

**Location:** Find the `resetBuilder` function (around line 559-570). Add these lines:

```jsx
const resetBuilder = () => {
  setSelectedCustomer(null);
  setQuoteItems([]);
  setDiscountPercent(0);
  setNotes('');
  setInternalNotes('');
  setTerms('Payment due within 30 days. All prices in CAD.');
  setProductSearchTerm('');
  setCustomerSearchTerm('');
  setShowCustomerDropdown(false);
  setEditingQuoteId(null);

  // ADD THESE LINES:
  setHideModelNumbers(false);
  setWatermarkText('CONFIDENTIAL - FOR CUSTOMER USE ONLY');
  setWatermarkEnabled(true);
  setQuoteExpiryDate('');
  setSelectedEmailTemplate(null);
};
```

---

### 5. Load Protection Settings When Editing (in editQuote function)

**Location:** Find the `editQuote` function (around line 911-950). Add these lines after loading other quote data:

```jsx
// After setting terms, add:
setHideModelNumbers(data.hide_model_numbers || false);
setWatermarkText(data.watermark_text || 'CONFIDENTIAL - FOR CUSTOMER USE ONLY');
setWatermarkEnabled(data.watermark_enabled !== false);
setQuoteExpiryDate(data.quote_expiry_date || '');
```

---

## 🎨 OPTIONAL ENHANCEMENTS

### Add Expiring Soon Filter to List View

Add this button next to other filters:

```jsx
<button
  onClick={() => {
    const expiringSoon = quotations.filter(q => {
      if (!q.quote_expiry_date) return false;
      const daysUntilExpiry = Math.ceil((new Date(q.quote_expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    });
    setFilteredQuotes(expiringSoon);
  }}
  style={{
    padding: '8px 16px',
    background: '#fbbf24',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }}
>
  ⚠️ Expiring Soon ({quotations.filter(q => {
    if (!q.quote_expiry_date) return false;
    const days = Math.ceil((new Date(q.quote_expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 7;
  }).length})
</button>
```

---

## 📍 EXACT LOCATIONS SUMMARY

| Component | Function/Section | Approximate Line | Action |
|-----------|-----------------|------------------|--------|
| State Variables | Top of component | ~110 | ✅ Done |
| Fetch Function | After fetchRebates | ~319 | ✅ Done |
| Save Quote | quoteData object | ~537 | ✅ Done |
| Protection Panel | Builder view, after quote items | ~2200-2300 | TODO: Add code above |
| Email Template | Email dialog | ~3200-3400 | TODO: Add code above |
| Expiry Helper | Before return | ~1400-1500 | TODO: Add function |
| Expiry Badge | Quote list rendering | ~1850-2000 | TODO: Add component |
| Reset Builder | resetBuilder function | ~559-570 | TODO: Add lines |
| Edit Quote | editQuote function | ~911-950 | TODO: Add lines |

---

## 🧪 TESTING CHECKLIST

After implementing the UI:

### Quote Builder
- [ ] Create new quote
- [ ] Check "Hide Model Numbers" checkbox
- [ ] Enter custom watermark text
- [ ] Set expiry date
- [ ] Save quote
- [ ] Verify settings saved in database

### PDF Generation
- [ ] Preview PDF with watermark
- [ ] Verify model numbers hidden when checkbox checked
- [ ] Check expiry warning appears on PDF
- [ ] Download PDF and verify

### Email Dialog
- [ ] Open email dialog
- [ ] Select email template
- [ ] Verify subject and body auto-fill
- [ ] Check talking points appear
- [ ] Send test email

### Quote List
- [ ] View quotes list
- [ ] Check expiry badges appear
- [ ] Verify colors (red for urgent, yellow for soon, orange for warning)
- [ ] Test "Expiring Soon" filter

---

## 🚀 DEPLOYMENT STEPS

1. **Save all files**
2. **Restart backend:** `cd backend && node server.js`
3. **Restart frontend:** `cd frontend && npm start`
4. **Clear browser cache**
5. **Test each feature**
6. **Fix any bugs**
7. **DONE!**

---

## 📝 NOTES

- All backend APIs are ready and working
- PDF service is fully enhanced
- Database schema is complete
- Just need to add the UI components above
- Estimated time: 30-45 minutes to add all UI components

---

*Last Updated: 2024-12-20*
*Status: 75% Complete - Backend Done, UI Pending*
