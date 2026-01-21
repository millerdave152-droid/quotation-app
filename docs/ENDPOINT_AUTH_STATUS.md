# Endpoint Authentication Status

Generated: 2026-01-09

This document lists all API endpoints and their authentication status.

## Summary

- **Total Protected Endpoints**: ~491
- **Public Endpoints**: 4 (by design)
- **Authentication Middleware**: `authenticate` from `../middleware/auth`

---

## Public Endpoints (Intentionally Unauthenticated)

These endpoints must remain public for specific technical reasons:

| Endpoint | File | Reason |
|----------|------|--------|
| `POST /api/auth/login` | auth.js | Users need to login before having a token |
| `POST /api/auth/register` | auth.js | New users need to register before having a token |
| `POST /api/stripe/webhook` | stripe.js | Stripe calls this endpoint directly; uses signature verification |
| `GET /api/push/vapid-public-key` | pushNotifications.js | Client needs public key to set up push subscriptions |

---

## Protected Endpoints by Route File

All endpoints below require JWT authentication via the `authenticate` middleware.

### auth.js (2 protected)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### users.js (5 protected)
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### quotes.js (47 protected)
All quote endpoints including:
- Quote CRUD operations
- Quote items management
- Quote financing, warranties, delivery, rebates, trade-ins
- Quote stats, history, versions
- Quote email and PDF operations

### customers.js (8 protected)
- `GET /api/customers` - List customers
- `GET /api/customers/stats/overview` - Customer stats
- `GET /api/customers/lifetime-value` - CLV summary
- `GET /api/customers/:id` - Get customer
- `GET /api/customers/:id/lifetime-value` - Customer CLV
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### products.js (21 protected)
- Product CRUD operations
- Product search and filtering
- CSV import/export
- Product stats and metrics

### categories.js (7 protected)
- Category CRUD operations
- Category hierarchy management

### analytics.js (2 protected)
- `GET /api/analytics/revenue-features` - Revenue analytics
- `GET /api/analytics/top-features` - Top features analytics

### orders.js (8 protected)
- Order CRUD operations
- Order status management

### invoices.js (10 protected)
- Invoice CRUD operations
- Invoice PDF generation
- Payment tracking

### inventory.js (12 protected)
- Inventory management
- Stock tracking
- Inventory alerts

### delivery.js (14 protected)
- Delivery scheduling
- Driver management
- Route optimization

### pricing.js (11 protected)
- Pricing rules management
- Discount tiers
- Special pricing

### packageBuilder.js (15 protected)
- Package creation
- Bundle management
- Package templates

### packageBuilderV2.js (5 protected)
- Enhanced package building features

### features2026.js (35 protected)
- 2026 feature set endpoints

### marketplace.js (119 protected)
- Product marketplace operations
- Category browsing
- Wishlist management
- Cart operations

### activities.js (11 protected)
- Activity logging
- Activity feeds
- User activity tracking

### importTemplates.js (17 protected)
- Import template management
- Field mapping
- Import operations

### product-metrics.js (7 protected)
- Product performance metrics
- Sales analytics

### advancedPricing.js (18 protected)
- Advanced pricing rules
- Volume discounts
- Time-based pricing

### vendorProducts.js (14 protected)
- Vendor product management
- Vendor inventory

### churnAlerts.js (7 protected)
- Churn risk detection
- Alert management

### aiPersonalization.js (14 protected)
- AI-powered recommendations
- Personalization settings

### product3d.js (17 protected)
- 3D model management
- Visualization settings

### stripe.js (7 protected + 1 public webhook)
- Payment intent creation
- Subscription management
- Customer portal

### payments.js (7 protected)
- Payment processing
- Payment history

### followUp.js (10 protected)
- Follow-up scheduling
- Reminder management

### notifications.js (5 protected)
- Notification preferences
- Notification history

### counterOffers.js (6 protected)
- Counter-offer creation
- Negotiation tracking

### quoteProtection.js (11 protected)
- Email templates
- Quote tracking
- Quote expiration
- Protection settings

### pushNotifications.js (5 protected + 1 public)
- `POST /api/push/subscribe` - Subscribe to push
- `POST /api/push/unsubscribe` - Unsubscribe
- `POST /api/push/send` - Send notifications
- `GET /api/push/stats` - Get stats
- `POST /api/push/test` - Test notification

### apiKeys.js (5 protected)
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create API key
- `PUT /api/api-keys/:id` - Update API key
- `DELETE /api/api-keys/:id` - Delete API key
- `POST /api/api-keys/:id/regenerate` - Regenerate secret

---

## Authentication Pattern

All protected routes use the following pattern:

```javascript
const { authenticate } = require('../middleware/auth');

router.get('/endpoint', authenticate, async (req, res) => {
  // Route handler - req.user is available
});
```

The `authenticate` middleware:
1. Checks for JWT token in Authorization header
2. Verifies token validity
3. Attaches user info to `req.user`
4. Returns 401 if token is missing/invalid

---

## Security Notes

1. **Stripe Webhook**: Uses Stripe signature verification instead of JWT
2. **VAPID Public Key**: Safe to expose - it's a public key for push encryption
3. **Login/Register**: These are entry points; no token exists yet
4. **API Keys**: Consider adding role-based access (admin only) in future
