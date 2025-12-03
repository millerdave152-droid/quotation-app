# Best Buy Marketplace Integration Guide

## 📋 Overview

This integration connects your TeleTime quotation system with Best Buy Marketplace through the Mirakl API platform. It enables:

- ✅ Automatic order syncing from Best Buy
- ✅ Product/offer management
- ✅ Inventory synchronization
- ✅ Order fulfillment & tracking
- ✅ Webhook support for real-time updates

## 🚀 Phase 1 Setup (COMPLETED)

### Files Created

**Database:**
- `backend/migrations/add-marketplace-tables.js` - Database schema migration

**Services:**
- `backend/services/miraklService.js` - Core Mirakl API integration
- `backend/services/marketplaceSyncScheduler.js` - Automated sync scheduler

**Routes:**
- `backend/routes/marketplace.js` - API endpoints for marketplace operations

**Configuration:**
- `backend/.env.marketplace` - Environment variable template

---

## 📦 Installation Steps

### Step 1: Install Dependencies

```bash
cd backend
npm install axios
```

### Step 2: Configure Environment Variables

Add these to your `backend/.env` file:

```bash
# Mirakl API Configuration
MIRAKL_API_URL=https://bestbuy-mirakl.mirakl.net/api
MIRAKL_API_KEY=your_api_key_here
MIRAKL_SHOP_ID=your_shop_id_here

# Auto-Sync Settings
MARKETPLACE_AUTO_SYNC=false
MARKETPLACE_ORDER_SYNC_INTERVAL=15
MARKETPLACE_PRODUCT_SYNC_INTERVAL=60
MARKETPLACE_INVENTORY_SYNC_INTERVAL=30
```

### Step 3: Run Database Migration

```bash
node backend/migrations/add-marketplace-tables.js
```

This creates 7 new tables:
- `products` table enhanced with: `mirakl_sku`, `mirakl_offer_id`, `bestbuy_category_id`, `last_synced_at`
- `marketplace_orders` - Order tracking
- `marketplace_order_items` - Order line items
- `marketplace_shipments` - Shipping & tracking
- `marketplace_sync_log` - Sync history
- `marketplace_credentials` - API credentials storage
- `marketplace_webhook_events` - Webhook event log

### Step 4: Add Routes to server.js

Add this to your `backend/server.js`:

```javascript
// Marketplace Routes
const marketplaceRoutes = require('./routes/marketplace');
app.use('/api/marketplace', marketplaceRoutes);
```

### Step 5: Initialize Sync Scheduler (Optional)

Add this to `backend/server.js` to enable automatic syncing:

```javascript
const MarketplaceSyncScheduler = require('./services/marketplaceSyncScheduler');

// Initialize marketplace sync scheduler
const marketplaceSyncScheduler = new MarketplaceSyncScheduler();

// Start scheduler after server starts
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Start marketplace sync (if enabled in .env)
  await marketplaceSyncScheduler.start();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await marketplaceSyncScheduler.stop();
  process.exit(0);
});
```

---

## 🔑 Getting Mirakl API Credentials

1. Log into your **Best Buy Seller Portal**
2. Navigate to **Settings** → **Integration**
3. Click **Generate API Key**
4. Copy your:
   - API Key
   - Shop ID
   - API URL (usually `https://bestbuy-mirakl.mirakl.net/api`)

---

## 🛠️ API Endpoints

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/orders` | List all marketplace orders |
| GET | `/api/marketplace/orders/:id` | Get order details with items & shipments |
| POST | `/api/marketplace/orders/sync` | Manually sync orders from Mirakl |
| POST | `/api/marketplace/orders/:id/accept` | Accept an order |
| POST | `/api/marketplace/orders/:id/refuse` | Refuse an order |

### Shipments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/marketplace/orders/:id/shipments` | Create shipment with tracking |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/marketplace/products/:id/sync` | Sync single product to Mirakl |
| POST | `/api/marketplace/products/sync-bulk` | Bulk sync multiple products |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/sync-logs` | View sync history |
| GET | `/api/marketplace/sync-stats` | View sync statistics |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/marketplace/webhooks/mirakl` | Receive Mirakl webhook events |

---

## 📊 Automated Syncing

When `MARKETPLACE_AUTO_SYNC=true`, the scheduler automatically:

**Every 15 minutes (configurable):**
- 📥 Syncs new orders from Mirakl
- 📋 Updates existing order statuses

**Every 60 minutes (configurable):**
- 📤 Pushes updated products to Mirakl as offers
- 🔄 Syncs products modified since last sync

**Every 30 minutes (configurable):**
- 📊 Updates inventory quantities on Mirakl

---

## 🔄 Manual Operations

### Sync All Orders
```bash
POST /api/marketplace/orders/sync
Body: {
  "start_date": "2024-01-01T00:00:00Z",
  "order_state_codes": "WAITING_ACCEPTANCE,SHIPPING,SHIPPED"
}
```

### Sync Single Product
```bash
POST /api/marketplace/products/123/sync
```

### Bulk Sync Products
```bash
POST /api/marketplace/products/sync-bulk
Body: {
  "product_ids": [1, 2, 3, 4, 5]
}
```

### Accept an Order
```bash
POST /api/marketplace/orders/456/accept
```

### Create Shipment
```bash
POST /api/marketplace/orders/456/shipments
Body: {
  "tracking_number": "1Z999AA10123456784",
  "carrier_code": "UPS",
  "carrier_name": "UPS",
  "shipped_items": [
    { "order_line_id": "12345", "quantity": 1 }
  ]
}
```

---

## 🎯 Typical Workflow

### 1. Product Setup
- Create/update products in your system
- Products need: `sku`, `model`, `msrp_cents`, `stock_quantity`

### 2. Sync Products to Mirakl
```bash
POST /api/marketplace/products/sync-bulk
Body: { "product_ids": [1, 2, 3] }
```

### 3. Receive Orders
- Orders automatically sync every 15 minutes
- Or manually trigger: `POST /api/marketplace/orders/sync`

### 4. Accept Orders
```bash
POST /api/marketplace/orders/:id/accept
```

### 5. Ship Orders
```bash
POST /api/marketplace/orders/:id/shipments
Body: {
  "tracking_number": "...",
  "carrier_code": "UPS",
  "shipped_items": [...]
}
```

---

## 🐛 Troubleshooting

### Orders Not Syncing?
1. Check `MARKETPLACE_AUTO_SYNC=true` in `.env`
2. Verify API credentials are correct
3. Check sync logs: `GET /api/marketplace/sync-logs`
4. Look for errors in server console

### Products Not Appearing on Mirakl?
1. Ensure product has `active = true`
2. Verify `msrp_cents` is set
3. Check sync logs for errors
4. Products need valid `sku` or `model`

### Sync Logs Show Errors?
```bash
GET /api/marketplace/sync-logs?status=FAILED
```

Check `error_message` and `error_details` fields for details.

---

## 📈 Monitoring & Analytics

### View Sync Statistics
```bash
GET /api/marketplace/sync-stats
```

Response:
```json
[
  {
    "sync_type": "order_sync",
    "total_syncs": 48,
    "successful_syncs": 47,
    "failed_syncs": 1,
    "total_records": 156,
    "avg_duration_ms": 2341.5
  }
]
```

### Check Scheduler Status

Add endpoint to check scheduler status:
```javascript
// Add to server.js or marketplace routes
app.get('/api/marketplace/scheduler/status', (req, res) => {
  res.json(marketplaceSyncScheduler.getStatus());
});
```

---

## 🔐 Security Best Practices

1. **Never commit `.env` file** - API keys should stay private
2. **Use environment-specific credentials** - Separate keys for dev/prod
3. **Rotate API keys periodically** - Update credentials every 90 days
4. **Monitor webhook signatures** - Validate incoming webhook authenticity
5. **Limit API rate** - Respect Mirakl's rate limits

---

## 📞 Support

For issues or questions:
1. Check Mirakl API documentation: https://docs.mirakl.net/
2. Review sync logs: `GET /api/marketplace/sync-logs`
3. Check server console for detailed error messages
4. Contact Best Buy Seller Support for API issues

---

## ✅ Next Steps (Phase 2+)

Future enhancements could include:
- [ ] Frontend UI for marketplace management
- [ ] Advanced order filters and search
- [ ] Automated pricing rules
- [ ] Returns management
- [ ] Performance analytics dashboard
- [ ] Automated responses to common order scenarios
- [ ] Multi-marketplace support (Amazon, Walmart, etc.)

---

**Integration Version:** 1.0
**Last Updated:** 2024
**Mirakl API Version:** Compatible with Mirakl 3.0+
