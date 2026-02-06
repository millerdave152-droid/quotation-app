# TeleTime POS

A modern Point of Sale system built with React + Vite + Tailwind CSS, designed for tablet and desktop use in retail environments.

## Quick Start

```bash
# 1. Run database migration (from project root)
psql -U your_user -d teletime -f backend/migrations/001_pos_tables.sql

# 2. Seed test data - create at least one register
psql -U your_user -d teletime -c "
INSERT INTO registers (name, location, is_active)
VALUES ('Register 1', 'Main Floor', true);
"

# 3. Start the backend (in one terminal)
cd backend
npm run dev

# 4. Start the POS app (in another terminal)
cd apps/pos
npm install
npm run dev

# 5. Access POS at http://localhost:3000
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   SHARED BACKEND                         │
│  PostgreSQL + Express API (port 5000)                    │
└─────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  TeleTime   │  │  TeleTime   │  │  Customer   │
│   QUOTES    │  │    POS      │  │   Portal    │
│ (Existing)  │  │ (port 3000) │  │  (Future)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Application Flow

```
1. User visits http://localhost:3000
   ↓
2. Check localStorage for JWT token
   ↓
3. If token exists → Validate with GET /api/auth/me
   ↓
4. If valid → Check RegisterContext for active shift
   ↓
5. Route based on state:

   ┌─────────────────┬─────────────────────────────────┐
   │ State           │ Route                           │
   ├─────────────────┼─────────────────────────────────┤
   │ No token        │ /login                          │
   │ Invalid token   │ /login                          │
   │ No shift        │ /open-shift (RegisterSelect)    │
   │ Active shift    │ / (POSMain)                     │
   │ Manager + shift │ /reports (optional)             │
   └─────────────────┴─────────────────────────────────┘
```

## Screen Layout

```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Register Info | User | Quick Actions     │
├───────────────────────────────────┬─────────────────────┤
│                                   │                     │
│  Product Search         (60%)    │  Customer Badge     │
│  ─────────────────                │  ───────────────    │
│  Category Tabs                    │                     │
│  ─────────────────                │  Cart Items   (40%) │
│                                   │  - Item 1           │
│  Product Grid                     │  - Item 2           │
│  ┌─────┐ ┌─────┐ ┌─────┐         │  - Item 3           │
│  │     │ │     │ │     │         │                     │
│  └─────┘ └─────┘ └─────┘         │  ───────────────    │
│  ┌─────┐ ┌─────┐ ┌─────┐         │  Subtotal           │
│  │     │ │     │ │     │         │  Tax (HST/GST/PST)  │
│  └─────┘ └─────┘ └─────┘         │  TOTAL              │
│                                   │                     │
│                                   │  [CHECKOUT]         │
├───────────────────────────────────┴─────────────────────┤
│ Quick Keys: [Quote F5] [Customer F4] [Hold F7] [Price F8]│
└─────────────────────────────────────────────────────────┘
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F2` | Focus product search |
| `F4` | Open customer lookup |
| `F5` | Open quote lookup |
| `F7` | Hold current transaction |
| `F8` | Price check |
| `F12` | Open checkout |
| `ESC` | Close modal / Cancel |

## Features

### Register Management
- Register selection screen
- Opening cash count (simple or detailed with Canadian denominations)
- Shift summary in header (sales count, total)
- Closing flow with variance calculation (green ≤$5, yellow $5-20, red >$20)
- Printable end-of-day report
- localStorage persistence for shift recovery

### Cart & Checkout
- Add/remove/update items with quantity controls
- Line item discounts
- Cart-wide discount
- Canadian tax calculation (HST/GST/PST by province)
- Hold/recall transactions
- Multiple payment methods (cash, credit, debit, split)
- Change calculation with quick tender buttons

### Product Browsing
- Category filtering
- Real-time search with debounce
- Barcode scanner input detection
- Infinite scroll product grid
- Price check modal

### Customer & Quotes
- Customer search with pending quote indicators
- Quick add customer inline
- Quote lookup and conversion to sale
- Commission tracking for quote creator

## Project Structure

```
apps/pos/
├── index.html              # PWA-ready HTML template
├── vite.config.js          # Vite config (proxy to :5000)
├── package.json
├── .env.example
├── public/
│   ├── manifest.json       # PWA manifest
│   └── pos-icon.svg
└── src/
    ├── main.jsx            # Entry point + providers
    ├── App.jsx             # Routes + guards
    ├── index.css           # Tailwind styles
    │
    ├── api/                # API service layer
    │   ├── axios.js        # Configured axios instance
    │   ├── products.js
    │   ├── transactions.js
    │   ├── register.js
    │   ├── customers.js
    │   └── quotes.js
    │
    ├── context/            # React contexts
    │   ├── AuthContext.jsx
    │   ├── RegisterContext.jsx
    │   └── CartContext.jsx
    │
    ├── hooks/              # Custom hooks
    │   ├── useCart.js
    │   └── useRegister.js
    │
    ├── components/
    │   ├── Register/       # Shift management
    │   ├── Products/       # Product browsing
    │   ├── Cart/           # Shopping cart
    │   ├── Checkout/       # Payment flow
    │   ├── Customer/       # Customer lookup
    │   ├── Quotes/         # Quote conversion
    │   └── ErrorBoundary.jsx
    │
    ├── pages/
    │   ├── Login.jsx
    │   ├── POSMain.jsx
    │   ├── Reports.jsx
    │   └── NotFound.jsx
    │
    └── utils/
        ├── formatters.js   # Currency, date, phone
        └── tax.js          # Canadian tax rates
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/me` | GET | Validate JWT token |
| `/api/register` | GET | List available registers |
| `/api/register/shift/active` | GET | Get active shift |
| `/api/register/:id/open` | POST | Open a new shift |
| `/api/register/shift/:id/close` | POST | Close current shift |
| `/api/register/shift/:id/summary` | GET | Get shift summary |
| `/api/transactions` | POST | Create transaction |
| `/api/transactions/:id/void` | POST | Void transaction |
| `/api/products/quick-search` | GET | Search products |
| `/api/products/categories` | GET | Get categories |
| `/api/customers/search` | GET | Search customers |
| `/api/quotes/lookup` | GET | Search quotes |

## Environment Variables

```bash
# API Configuration
VITE_API_URL=http://localhost:5000/api

# Application Settings
VITE_APP_NAME=TeleTime POS
VITE_SESSION_TIMEOUT=480

# Store Information (for receipts)
VITE_STORE_NAME=TeleTime Communications
VITE_STORE_ADDRESS=123 Main Street
VITE_STORE_CITY=Toronto, ON M5V 1A1
VITE_STORE_PHONE=(416) 555-1234

# Tax Configuration
VITE_DEFAULT_TAX_PROVINCE=ON

# Feature Flags
VITE_ENABLE_BARCODE_SCANNER=true
VITE_DEBUG=false
```

## Canadian Tax Rates

| Province | HST | GST | PST |
|----------|-----|-----|-----|
| Ontario (ON) | 13% | - | - |
| British Columbia (BC) | - | 5% | 7% |
| Alberta (AB) | - | 5% | - |
| Quebec (QC) | - | 5% | 9.975% |
| Manitoba (MB) | - | 5% | 7% |
| Saskatchewan (SK) | - | 5% | 6% |
| Nova Scotia (NS) | 15% | - | - |
| New Brunswick (NB) | 15% | - | - |
| Newfoundland (NL) | 15% | - | - |
| PEI (PE) | 15% | - | - |
| Territories | - | 5% | - |

## Cash Denominations (Canadian)

**Bills:** $100, $50, $20, $10, $5
**Coins:** $2 (Toonie), $1 (Loonie), $0.25 (Quarter), $0.10 (Dime), $0.05 (Nickel)

*Note: Pennies are no longer in circulation - cash totals round to nearest $0.05*

## Future Enhancements

| Priority | Feature | Effort |
|----------|---------|--------|
| High | Stripe Terminal integration | 2-3 days |
| High | Thermal receipt printing | 1-2 days |
| Medium | Commission tracking reports | 2-3 days |
| Medium | Inventory alerts at checkout | 1 day |
| Low | Offline mode (service worker) | 3-4 days |
| Low | Analytics dashboard | 2-3 days |

## Troubleshooting

### "No registers available"
Run the seed SQL to create a register:
```sql
INSERT INTO registers (name, location, is_active)
VALUES ('Register 1', 'Main Floor', true);
```

### "API connection failed"
- Ensure backend is running on port 5000
- Check that Vite proxy is configured in `vite.config.js`

### "Token validation failed"
- Clear localStorage: `localStorage.clear()`
- Re-login at `/login`

### Cart not persisting
- Check browser localStorage is enabled
- Look for `pos_cart` key in DevTools > Application > Local Storage

## Development

```bash
# Run with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## License

Proprietary - TeleTime Communications
