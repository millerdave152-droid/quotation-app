/**
 * TeleTime POS - Offline Cache Service
 * Pre-fills Dexie with products/customers and provides offline query functions
 */

import db from '../db/offlineDb';
import api from '../api/axios';

const CACHE_TIMESTAMP_KEY = 'pos_cache_last_sync';
const PAGE_SIZE = 500;

/**
 * Paginated fetch of all products → bulkPut into Dexie
 */
export async function prefillProductCache() {
  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await api.get(`/products?page=${page}&limit=${PAGE_SIZE}&requirePrice=true`);
      const products = Array.isArray(response) ? response : (response.data || []);

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      // Normalize products for Dexie
      const normalized = products.map(p => ({
        id: p.id,
        name: p.name || '',
        sku: p.model || p.sku || '',
        barcode: p.barcode || p.upc || '',
        manufacturer: p.manufacturer || '',
        description: p.description || '',
        categoryId: p.category_id || null,
        price: p.msrp_cents ? p.msrp_cents / 100 : (p.price || 0),
        cost: p.cost_cents ? p.cost_cents / 100 : (p.cost || 0),
        stockQty: p.stock_quantity || p.qty_on_hand || 0,
      }));

      await db.products.bulkPut(normalized);

      if (products.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());
  } catch (err) {
    console.warn('[OfflineCache] Product prefill failed:', err.message);
  }
}

/**
 * Paginated fetch of all customers → bulkPut into Dexie
 */
export async function prefillCustomerCache() {
  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await api.get(`/customers?page=${page}&limit=${PAGE_SIZE}`);
      const customers = response.customers || response.data || [];

      if (!Array.isArray(customers) || customers.length === 0) {
        hasMore = false;
        break;
      }

      const normalized = customers.map(c => ({
        id: c.id,
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || '',
        company: c.company || '',
      }));

      await db.customers.bulkPut(normalized);

      if (customers.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());
  } catch (err) {
    console.warn('[OfflineCache] Customer prefill failed:', err.message);
  }
}

/**
 * Refresh both caches (used on reconnect)
 */
export async function refreshCache() {
  await Promise.all([prefillProductCache(), prefillCustomerCache()]);
}

/**
 * Search products offline by name, SKU, or barcode
 */
export async function searchProductsOffline(query) {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const results = await db.products
    .filter(p =>
      (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
      (p.sku && p.sku.toLowerCase().includes(lowerQuery)) ||
      (p.barcode && p.barcode.includes(query))
    )
    .limit(20)
    .toArray();

  return results;
}

/**
 * Get product by barcode from offline cache
 */
export async function getProductByBarcodeOffline(barcode) {
  if (!barcode) return null;
  return db.products.where('barcode').equals(barcode).first() || null;
}

/**
 * Search customers offline by name, phone, or email
 */
export async function searchCustomersOffline(query) {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const results = await db.customers
    .filter(c =>
      (c.name && c.name.toLowerCase().includes(lowerQuery)) ||
      (c.phone && c.phone.includes(query)) ||
      (c.email && c.email.toLowerCase().includes(lowerQuery))
    )
    .limit(20)
    .toArray();

  return results;
}

/**
 * Get the last sync timestamp
 */
export function getLastSyncTime() {
  return localStorage.getItem(CACHE_TIMESTAMP_KEY);
}
