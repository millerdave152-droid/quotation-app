# TeleTime POS - Complete Codebase Structure

## Overview
A full-featured Point of Sale system built with React (Vite) frontend and Node.js/Express backend, integrating with the existing quotation system.

---

## Directory Structure

```
apps/pos/                          # Frontend React Application
├── index.html                     # PWA-ready entry HTML
├── package.json                   # Dependencies: React 18, React Router, Heroicons, Axios
├── vite.config.js                 # Vite config with API proxy to :3001
├── tailwind.config.js             # Tailwind CSS configuration
├── postcss.config.js              # PostCSS configuration
│
└── src/
    ├── main.jsx                   # App entry point with providers
    ├── App.jsx                    # Routes and authentication flow
    ├── index.css                  # Global styles with Tailwind
    │
    ├── api/                       # API Client Layer
    │   ├── axios.js               # Axios instance with auth interceptors
    │   ├── index.js               # API exports
    │   ├── customers.js           # Customer API (search, CRUD)
    │   ├── products.js            # Products API (search, categories, barcode)
    │   ├── quotes.js              # Quotes API (lookup, load for conversion)
    │   ├── register.js            # Register/Shift API
    │   └── transactions.js        # Transaction API (create, void, refund)
    │
    ├── context/                   # React Context Providers
    │   ├── AuthContext.jsx        # Authentication state & JWT management
    │   ├── CartContext.jsx        # Shopping cart state & calculations
    │   └── RegisterContext.jsx    # Register & shift management
    │
    ├── hooks/                     # Custom React Hooks
    │   ├── useCart.js             # Enhanced cart with transaction processing
    │   ├── useRegister.js         # Register context wrapper
    │   └── useBarcode.js          # Barcode scanner keyboard listener
    │
    ├── components/                # UI Components
    │   ├── ErrorBoundary.jsx      # React error boundary
    │   │
    │   ├── Cart/                  # Shopping Cart Components
    │   │   ├── Cart.jsx           # Main cart container
    │   │   ├── CartItem.jsx       # Individual cart line item
    │   │   ├── CartTotals.jsx     # Subtotal, tax, total display
    │   │   ├── CartActions.jsx    # Cart action buttons
    │   │   ├── CustomerBadge.jsx  # Selected customer display
    │   │   ├── HeldTransactions.jsx # Parked transactions list
    │   │   └── index.js           # Exports
    │   │
    │   ├── Checkout/              # Checkout Flow Components
    │   │   ├── CheckoutModal.jsx  # Full-screen checkout overlay
    │   │   ├── PaymentMethods.jsx # Payment method selection
    │   │   ├── CashPayment.jsx    # Cash payment with change calc
    │   │   ├── CardPayment.jsx    # Card payment (manual/terminal)
    │   │   ├── SplitPayment.jsx   # Split payment management
    │   │   ├── DiscountInput.jsx  # Discount entry ($ or %)
    │   │   ├── PaymentComplete.jsx # Success screen
    │   │   └── index.js           # Exports
    │   │
    │   ├── Products/              # Product Browsing Components
    │   │   ├── ProductSearch.jsx  # Search input with suggestions
    │   │   ├── ProductGrid.jsx    # Product tile grid with pagination
    │   │   ├── ProductTile.jsx    # Individual product card
    │   │   ├── CategoryBar.jsx    # Horizontal category filters
    │   │   ├── BarcodeScanner.jsx # Hidden barcode listener
    │   │   └── index.js           # Exports
    │   │
    │   ├── Customer/              # Customer Management
    │   │   ├── CustomerLookup.jsx # Customer search modal
    │   │   ├── QuickAddCustomer.jsx # Inline customer creation
    │   │   ├── CustomerQuotesPanel.jsx # Customer's quotes list
    │   │   └── index.js           # Exports
    │   │
    │   ├── Quotes/                # Quote Conversion
    │   │   ├── QuoteLookup.jsx    # Quote search modal
    │   │   ├── QuotePreview.jsx   # Quote details preview
    │   │   ├── QuoteConversionBanner.jsx # Active quote indicator
    │   │   └── index.js           # Exports
    │   │
    │   ├── Register/              # Register Management
    │   │   ├── RegisterSelect.jsx # Register selection screen
    │   │   ├── OpenRegister.jsx   # Open shift form
    │   │   ├── CloseRegister.jsx  # Close shift with reconciliation
    │   │   ├── ShiftSummary.jsx   # Running shift totals
    │   │   ├── ShiftReport.jsx    # Printable shift report
    │   │   └── index.js           # Exports
    │   │
    │   └── Receipt/               # Receipt Generation
    │       ├── Receipt.jsx        # Receipt template
    │       ├── PrintReceipt.jsx   # Print functionality
    │       ├── EmailReceipt.jsx   # Email functionality
    │       └── index.js           # Exports
    │
    ├── pages/                     # Page Components
    │   ├── Login.jsx              # Login screen
    │   ├── POSMain.jsx            # Main POS interface
    │   ├── Register.jsx           # Register management page
    │   ├── Reports.jsx            # Manager reports
    │   ├── ShiftClose.jsx         # Shift closing flow
    │   └── NotFound.jsx           # 404 page
    │
    └── utils/                     # Utility Functions
        ├── formatters.js          # Currency, date formatting
        └── taxCalculator.js       # Canadian tax calculations

backend/                           # Backend Node.js/Express
├── routes/
│   ├── register.js                # Register & shift management API
│   ├── transactions.js            # Transaction CRUD API
│   └── pos-quotes.js              # Quote lookup for POS
│
└── migrations/
    ├── 001_pos_tables.sql         # Core POS schema
    ├── 002_pos_seed_data.sql      # Sample data
    └── 003_pos_quote_integration.sql # Quote-POS integration
```

---

## Key Features

### 1. Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access (admin, manager, cashier)
- Session persistence in localStorage

### 2. Register & Shift Management
- Multiple register support
- Shift open/close with cash reconciliation
- Variance tracking (over/short)
- One shift per user at a time

### 3. Shopping Cart
- Add products by search, scan, or grid click
- Quantity management (+/-)
- Item-level discounts (%)
- Cart-level discounts ($ or %)
- Serial number tracking
- Hold/recall transactions
- Canadian tax calculation (HST/GST/PST by province)

### 4. Checkout Flow
- Multiple payment methods (Cash, Credit, Debit, Gift Card)
- Split payments
- Change calculation
- Card payment (manual entry or terminal simulation)
- Discount application during checkout

### 5. Quote Integration
- Search quotes by number or customer
- Load quote into cart
- Preserve quote pricing and discounts
- Track converted quotes
- Commission attribution

### 6. Product Management
- Category-based browsing
- Search with autocomplete
- Barcode scanning support
- Stock level display
- Price check mode

### 7. Customer Management
- Customer search and selection
- Quick customer creation
- View customer quotes
- Customer-linked transactions

### 8. Keyboard Shortcuts
- F2: Focus search
- F4: Customer lookup
- F5: Quote lookup
- F7: Hold transaction
- F8: Price check
- F12: Checkout
- Escape: Cancel/close

---

## Database Schema (POS Tables)

### Core Tables
```sql
-- Registers (POS terminals)
registers (register_id, register_name, location, is_active, created_at)

-- Shifts (cash drawer sessions)
register_shifts (shift_id, register_id, user_id, opened_at, closed_at,
                 opening_cash, closing_cash, expected_cash, cash_variance,
                 status, notes)

-- Transactions (sales)
transactions (transaction_id, transaction_number, shift_id, customer_id,
              quote_id, user_id, salesperson_id, subtotal, discount_amount,
              discount_reason, hst_amount, gst_amount, pst_amount,
              tax_province, total_amount, status, source, created_at)

-- Transaction line items
transaction_items (id, transaction_id, product_id, product_name,
                   product_sku, quantity, unit_price, unit_cost,
                   discount_percent, discount_amount, tax_amount,
                   line_total, serial_number, taxable)

-- Payments
payments (id, transaction_id, payment_method, amount, card_last_four,
          card_brand, authorization_code, cash_tendered, change_given,
          status, processed_at)
```

### Integration Tables (from migration 003)
```sql
-- Conversion audit trail
conversion_audit (id, source_type, source_id, target_type, target_id, ...)

-- Sales commissions
sales_commissions (id, salesperson_id, source_type, source_id, ...)

-- Payment reconciliation
payment_reconciliation (id, invoice_payment_id, pos_payment_id, ...)
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Registers
- `GET /api/registers` - List all registers
- `POST /api/registers` - Create register
- `PUT /api/registers/:id` - Update register
- `DELETE /api/registers/:id` - Deactivate register
- `POST /api/registers/open` - Open shift
- `POST /api/registers/close` - Close shift
- `GET /api/registers/active` - Get user's active shift
- `GET /api/registers/shift/:id` - Get shift details
- `GET /api/registers/shift/:id/transactions` - Get shift transactions

### Transactions
- `POST /api/transactions` - Create transaction
- `GET /api/transactions` - List transactions
- `GET /api/transactions/:id` - Get transaction details
- `POST /api/transactions/:id/void` - Void transaction
- `POST /api/transactions/:id/refund` - Process refund
- `GET /api/transactions/daily-summary` - Daily summary

### Products
- `GET /api/products/search` - Search products
- `GET /api/products/categories` - Get categories
- `GET /api/products/barcode/:code` - Lookup by barcode

### Quotes (POS)
- `GET /api/pos/quotes/search` - Search quotes
- `GET /api/pos/quotes/:id` - Get quote for conversion

### Customers
- `GET /api/customers/search` - Search customers
- `POST /api/customers` - Create customer
- `GET /api/customers/:id/quotes` - Get customer quotes

---

## Configuration

### Environment Variables
```bash
# Frontend (apps/pos/.env)
VITE_API_URL=/api
VITE_APP_NAME=TeleTime POS
VITE_DEFAULT_TAX_PROVINCE=ON

# Backend (backend/.env)
PORT=3001
DATABASE_URL=postgres://...
JWT_SECRET=...
```

### Tax Rates (Built-in)
```javascript
const TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0 },      // Ontario - HST 13%
  BC: { hst: 0, gst: 0.05, pst: 0.07 },   // BC - GST 5% + PST 7%
  AB: { hst: 0, gst: 0.05, pst: 0 },      // Alberta - GST 5%
  // ... all provinces supported
};
```

---

## Running the Application

### Development
```bash
# Start backend (from project root)
npm run dev

# Start POS frontend (from apps/pos)
cd apps/pos
npm install
npm run dev
```

### Production Build
```bash
cd apps/pos
npm run build
# Outputs to apps/pos/dist/
```

---

## File Sizes (Approximate)
| File | Lines |
|------|-------|
| CartContext.jsx | 780 |
| POSMain.jsx | 815 |
| CheckoutModal.jsx | 420 |
| register.js (backend) | 795 |
| transactions.js (backend) | 1010 |
| useCart.js | 490 |

---

## Recent Bug Fixes Applied
1. **Card checkout validation** - Fixed Joi schema for `cardLastFour`
2. **Stock display** - Added support for multiple stock field names
3. **Category loading** - Fixed API response extraction
4. **Discount feature** - Added DiscountInput component to checkout

---

Generated: 2026-01-26
