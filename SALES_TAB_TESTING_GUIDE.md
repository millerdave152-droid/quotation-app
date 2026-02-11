# Sales Tab - Testing & Operations Guide

## Login
- URL: `http://localhost:3000`
- Admin: `admin@yourcompany.com` / `TestPass123!`
- After login, expand the **Sales** section in the left sidebar

---

## 1. CUSTOMERS (`/customers`)

### What It Does
Full customer relationship manager. Every customer you quote, sell to, or track goes here. Supports CRUD, search/filter, CLV tracking, credit management, and a 360-degree customer profile.

### How to Navigate
Sidebar > **Sales** > **Customers**

### Views
| View | How to Toggle |
|------|---------------|
| **Table** | Click the table icon in the toolbar (default) |
| **Cards** | Click the card/grid icon in the toolbar |

### Adding a Customer
1. Click **+ Add Customer** (top right)
2. Fill in the form:

| Field | Required | Notes |
|-------|----------|-------|
| First Name | Yes | Min 2 characters |
| Last Name | Yes | Min 2 characters |
| Email | Yes* | *Unless "No Email Provided" is checked |
| Phone | No | Format: (555) 123-4567 or similar |
| Company | No | Autocompletes from existing companies. Check "Individual" if none |
| Address | No | Street address |
| Postal Code | No | Canadian format A1A 1A1 - auto-fills city/province when entered |
| Province | No | Dropdown of all Canadian provinces |
| City | No | Autocompletes, filters by selected province |
| Notes | No | Free text |

3. Click **Save** - duplicate email detection will warn you if a match exists

### Searching & Filtering
- **Search bar**: Type name, email, company, or phone (auto-searches after 300ms)
- **City filter**: Type a city name
- **Province filter**: Select from dropdown
- **Clear All**: Resets all filters

### Sorting (Table View)
Click column headers to sort: **Name**, **Email**, **Company**, **City** (click again to reverse)

### Actions on a Customer
| Action | How |
|--------|-----|
| **View details** | Click the eye icon, or double-click the row |
| **Edit** | Click the pencil icon |
| **Delete** | Click the trash icon (confirmation required) |
| **Refresh** | Click the Refresh button in the toolbar |

### Customer Detail Modal
When you open a customer, you see:
- **Contact info**: Email, phone, company, address
- **CLV Card**: Lifetime value, segment tier (Platinum/Gold/Silver/Bronze), churn risk, win rate
- **Stats**: Total quotes, won revenue, marketplace orders
- **Timeline**: First to last quote date range
- **Order History**: Combined quotes + marketplace orders in tabs
- **Credit Tracking**: Credit limit, balance, payment history

### Pagination
Bottom of the list: choose **10 / 20 / 50 / 100** items per page, navigate with Previous/Next

### What to Verify
- [ ] Page loads with customer data and stats bar (Total, New This Month, New This Week)
- [ ] Add Customer form validates required fields and rejects duplicate emails
- [ ] Postal code lookup auto-fills city and province
- [ ] Search returns results in real-time
- [ ] Table and Card views both display data correctly
- [ ] CLV tier badge shows on cards (Platinum/Gold/Silver/Bronze)
- [ ] Edit updates the record, Delete removes it (with confirmation)
- [ ] Sorting works on all sortable columns
- [ ] Province and City filters narrow results correctly

---

## 2. LEADS (`/leads`)

### What It Does
Lead capture and management pipeline. Track inquiries from walk-ins, phone calls, website, and referrals. Score leads, schedule follow-ups, log activities, and convert qualified leads into quotations.

### How to Navigate
Sidebar > **Sales** > **Leads**

### Stats Bar
The top bar shows real-time counts:
- **Total** - All leads
- **New** - Uncontacted leads
- **Contacted** - Initial contact made
- **Qualified** - Meets criteria
- **Hot** - High priority / ready to buy
- **Follow-ups Today** - Due today
- **Overdue** - Past due follow-ups (red, only shows if > 0)

### Creating a New Lead

**Full Form** (+ New Lead button):

| Section | Fields |
|---------|--------|
| **Contact Info** | Name (required), Email, Phone, Preferred contact method (phone/text/email), Best time to contact |
| **Lead Source** | Source dropdown (Walk-in, Phone Call, Website, Referral, Realtor, Builder/Contractor, Social Media, Other), Source details |
| **Context & Timing** | Reason (browsing, researching, moving, renovation, replacement, upgrade, builder project), Purchase timeline (ASAP, 1-2 weeks, 1-3 months, 3-6 months, just researching), Move-in date |
| **Product Requirements** | Category/subcategory, Quantity, Budget range (min/max), Brand preferences, Color preferences, Notes |
| **Internal** | Priority (Hot/Warm/Cold), Follow-up date |

**Quick Capture** (Quick Capture button):
Simplified modal for fast walk-in entry: Name, Phone, Email, Source, Priority, Notes

### Lead Statuses
| Status | Meaning | Badge Color |
|--------|---------|-------------|
| **New** | Just created, no contact yet | Blue |
| **Contacted** | First outreach made | Purple |
| **Qualified** | Meets buying criteria | Green |
| **Quote Created** | Quotation generated from lead | Amber |
| **Converted** | Won - became a customer | Green (success) |
| **Lost** | Deal lost | Red |

### Lead Priorities
| Priority | Meaning | Badge Color |
|----------|---------|-------------|
| **Hot** | Ready to buy, urgent | Red |
| **Warm** | Interested, considering | Orange |
| **Cold** | Just browsing | Gray |

### Searching & Filtering
- **Search**: By name, email, or phone
- **Status filter**: Dropdown (All, New, Contacted, Qualified, Quote Created, Converted, Lost)
- **Priority filter**: Dropdown (All, Hot, Warm, Cold)

### Lead List Columns
| Column | What It Shows |
|--------|---------------|
| Lead | Contact name + lead number |
| Score | Letter grade (A/B/C/D) based on scoring algorithm |
| Contact | Email and phone |
| Source | How they found you |
| Timeline | Purchase timeline + urgency icon (fire emoji for ASAP) |
| Status | Status badge |
| Priority | HOT / WARM / COLD badge |
| Follow-up | Date with urgency: red = overdue, orange = today, blue = tomorrow |
| Created | Relative date ("2 days ago") |
| Actions | Quick action buttons |

### Quick Actions (per lead row)
| Icon | Action | What It Does |
|------|--------|--------------|
| Phone | Log Call | Record call outcome, duration, notes |
| Email | Log Email | Record email subject and notes |
| Note | Add Note | Quick note entry |
| Lightning | Change Status | Fast status update |
| Calendar | Schedule Follow-up | Set date with shortcuts (tomorrow, 3 days, next week) |

### Converting a Lead to Quote
1. Open a lead (click to view details)
2. Click **Convert to Quote** (available for non-converted, non-lost leads)
3. This creates a new quotation pre-filled with lead data and updates lead status

### Analytics Dashboard
Click the **Analytics** button to see:
- Key metrics: Total leads, conversion rate, new leads, hot leads
- **Funnel visualization**: New -> Contacted -> Qualified -> Quote Created -> Converted
- **Lead sources breakdown**: Bar chart of top sources
- **7-day trend**: Bar chart of recent lead creation
- **Priority distribution**: Hot/Warm/Cold percentages
- **Status breakdown**: Count per status
- Date range selector: Last 7 / 30 / 90 days / 1 year

### Export
Click **Export CSV** to download all leads as a spreadsheet

### Marking a Lead as Lost
When changing status to Lost, you must select a reason:
- Price too high
- Went with competitor
- Bad timing / Not ready
- No response / Unresponsive
- Budget constraints
- Changed mind
- Product not a good fit
- Project delayed
- Duplicate lead
- Invalid / Spam
- Custom reason (free text)

### What to Verify
- [ ] Stats bar shows correct counts for each status
- [ ] + New Lead form has all sections (Contact, Source, Context, Product Requirements, Internal)
- [ ] Quick Capture opens a simplified modal
- [ ] Lead list shows all columns with correct badges and colors
- [ ] Score badge shows letter grades (A/B/C/D)
- [ ] Quick actions work: Log Call, Log Email, Add Note, Change Status, Schedule Follow-up
- [ ] Filters narrow the list correctly (status + priority)
- [ ] Search returns matches by name, email, phone
- [ ] Analytics dashboard loads with funnel, sources, trends, priority breakdown
- [ ] Convert to Quote creates a quotation and updates lead status
- [ ] Lost status requires a reason selection
- [ ] Follow-up dates show urgency coloring (red=overdue, orange=today)
- [ ] Export CSV downloads a file

---

## 3. QUOTATIONS (`/quotes`)

### What It Does
The core quoting engine. Create detailed product quotations for customers with pricing, margins, discounts, delivery, warranties, financing, and rebates. Track quotes through a pipeline from Draft to Won/Lost. Send quotes via email as PDFs.

### How to Navigate
Sidebar > **Sales** > **Quotations**

### Stats Bar
Top of page shows:
- **Total Quotes** (count)
- **Total Value** (dollar amount)
- **Win Rate** (percentage)
- Status counts: Draft, Sent, Won, Lost

### Views
| View | How to Access | Purpose |
|------|--------------|---------|
| **List** | Default view / click "List" tab | Table of all quotes with filters |
| **Pipeline** | Click "Pipeline" tab | Kanban board with drag-and-drop by status |
| **Analytics** | Click "Analytics" button | Charts and insights |

### Creating a New Quote
1. Click **+ New Quote**
2. **Select Customer**: Search and select from existing customers (or create new)
3. **Add Products**: Search products by model, manufacturer, SKU, or description
   - Click a product to add it as a line item
   - Tabs: Search, Favorites, Recent
4. **Line Item Fields** (per product):

| Field | Description |
|-------|-------------|
| Manufacturer | Auto-filled from product catalog |
| Model | Auto-filled |
| Description | Auto-filled, editable |
| SKU | Auto-filled |
| Quantity | Default 1, adjustable |
| Cost | Your cost (for margin calculation) |
| MSRP | Manufacturer suggested price |
| Sell Price | Your selling price (editable) |
| Notes | Per-item notes |

5. **Service Items** (optional): Standard Delivery, Express Delivery, Basic/Premium Installation, Haul Away
6. **Quote Settings**:
   - Discount % (0-100)
   - Customer Notes (visible to customer)
   - Internal Notes (staff only)
   - Payment Terms (default: "Payment due within 30 days. All prices in CAD.")
   - Expiry Date (default: 30 days from now)

7. **Revenue Features** (optional):
   - Financing calculator
   - Warranty selection
   - Delivery scheduling with address
   - Rebates display
   - Trade-in estimator

8. **Quote Protection** (optional):
   - Hide model numbers from customer
   - Watermark enabled/text
   - Expiry date

9. **Staff Signature**: Sign the quote digitally

10. Click **Save as Draft** or **Save & Send**

### Quote Statuses
| Status | Color | Meaning |
|--------|-------|---------|
| **Draft** | Gray | Created, not yet sent |
| **Sent** | Purple | Emailed to customer |
| **Viewed** | Sky Blue | Customer opened the quote |
| **Pending Approval** | Amber | Needs internal approval (low margin) |
| **Approved** | Green | Internally approved |
| **Won** | Dark Green | Customer accepted |
| **Lost** | Red | Deal lost |
| **Rejected** | Light Red | Quote rejected internally |
| **Converted** | Blue | Converted to POS sale |

### Actions on a Quote
| Action | Where | What It Does |
|--------|-------|--------------|
| **View** | Eye icon | Opens full quote details with items, history, actions |
| **Edit** | Pencil icon | Opens quote in builder for editing |
| **Delete** | Trash icon | Removes quote (confirmation required) |
| **Send Email** | From viewer | Sends PDF to customer via email with template |
| **Clone/Duplicate** | From viewer | Creates a copy of the quote |
| **Update Status** | From viewer or kanban drag | Changes quote status |
| **Preview PDF** | From viewer | Opens PDF preview in browser |
| **Download PDF** | From viewer | Downloads PDF file |
| **Request Approval** | From viewer | Sends to approver for low-margin quotes |
| **Counter Offer** | From viewer | Make counter offer to customer |

### Filtering & Sorting
**Status Tabs**: All, Draft, Sent, Won, Lost, Pending, etc.

**Filters**:
| Filter | Type |
|--------|------|
| Search | Quote #, customer name, email, company, product |
| Status | Dropdown |
| Date Range | Today, This Week, This Month |
| Value Range | $0-1K, $1K-5K, $5K-10K, $10K+ |
| Customer | Select specific customer |
| Expiring Soon | Quotes expiring within 7 days |

**Sort By**: Date, Value, Customer, Status (ascending or descending)

### Pipeline/Kanban View
- **Columns**: Draft, Sent, Viewed, Pending, Won, Lost
- **Drag and drop**: Drag a quote card to a different column to update its status
- **Card shows**: Quote #, customer name, total amount, days until expiry
- **Column header**: Shows count and total value for that stage

### Approval Workflow
1. If a quote's margin is below the approval threshold, it's flagged
2. Click **Request Approval** and select an approver (by email)
3. Quote moves to **Pending Approval** status
4. Approver sees it in the **Approvals** tab
5. Approver can **Approve** (moves to Approved) or **Reject** (with required reason)
6. Badge count on the Quotations nav item shows pending approvals

### Bulk Actions
Select multiple quotes with checkboxes, then:
- Change Status (batch)
- Extend Expiry Date
- Assign Salesperson
- Send Email
- Export to CSV
- Delete Selected

### Analytics Dashboard
Click **Analytics** to see:
- **Win rate by customer**: Top customers by win rate and revenue
- **Product popularity**: Most quoted and highest revenue products
- **Monthly trends**: Last 6 months of quotes created, revenue, won deals

### Pipeline Analytics (`/pipeline-analytics`)
Separate page under Sales:
- **Pipeline Funnel**: Visual funnel showing value at each stage (Draft -> Sent -> Won)
- **Win Rates**: Stage conversion analysis table (expected vs actual)
- **Sales Team**: Rep performance metrics
- **At-Risk Quotes**: Quotes that may be slipping
- Time period filter: Last 90 days with Refresh

### Templates
- Save a quote configuration as a template for reuse
- Load templates when creating new quotes
- Templates store: items, discount, notes, terms

### Promo Codes
- Enter a promo code in the builder
- System validates and applies the discount (percentage or fixed amount)
- Shows applied promo details and max discount cap

### What to Verify
- [ ] Stats bar shows correct totals, value, and win rate
- [ ] + New Quote opens the builder with customer search and product search
- [ ] Products can be searched, added, and have editable quantity/price
- [ ] Service items (delivery, installation, haul away) can be added
- [ ] Discount %, notes, terms, and expiry date fields work
- [ ] Save as Draft creates a quote in Draft status
- [ ] List view displays all columns with correct status badges
- [ ] Status filter tabs (All, Draft, Sent, Won, Lost) filter correctly
- [ ] Pipeline/Kanban view shows columns with quote cards
- [ ] Drag-and-drop in kanban changes quote status
- [ ] View quote shows full details with items and totals
- [ ] Edit loads the quote back into the builder
- [ ] Send Email generates and sends a PDF
- [ ] Clone creates a duplicate
- [ ] Delete removes with confirmation
- [ ] Approval workflow: Request -> Pending -> Approve/Reject
- [ ] Bulk actions work on selected quotes
- [ ] Analytics shows win rate, product popularity, monthly trends
- [ ] Pipeline Analytics page loads with funnel and conversion data
- [ ] Margin calculation shows in builder (revenue - cost / revenue)
- [ ] Expiry badges show on quotes nearing expiration

---

## Quick Reference: Status Flows

### Lead Lifecycle
```
New -> Contacted -> Qualified -> Quote Created -> Converted
                                                -> Lost (with reason)
```

### Quote Lifecycle
```
Draft -> Sent -> Viewed -> Won
                        -> Lost
     -> Pending Approval -> Approved -> Sent
                         -> Rejected
```

### Customer Sources
Customers can be created from:
- Customers page (manual entry)
- Lead conversion (auto-creates from lead data)
- Quote builder (inline customer creation)
- POS checkout (from POS app)
