'use strict';

/**
 * Generate v2 test PDFs using the actual service classes
 * with mocked database queries. This ensures the PDFs
 * match exactly what the live services produce.
 */

const fs = require('fs');
const SalesOrderService = require('../services/SalesOrderService');
const DeliverySlipService = require('../services/DeliverySlipService');

const SO_OUTPUT = 'C:/Users/WD-PC1/OneDrive/Desktop/SalesOrder_v2_new.pdf';
const DS_OUTPUT = 'C:/Users/WD-PC1/OneDrive/Desktop/DeliverySlip_v2_new.pdf';

// ── Mock pool that returns canned data ──────────────────────────

function createMockPool(queryMap) {
  return {
    query(sql, params) {
      for (const [pattern, handler] of queryMap) {
        if (sql.includes(pattern)) {
          return Promise.resolve(handler(params));
        }
      }
      return Promise.resolve({ rows: [] });
    }
  };
}

// ── Sales Order mock data ───────────────────────────────────────

const soPool = createMockPool([
  ['FROM transactions t', () => ({ rows: [{
    transaction_id: 89,
    transaction_number: 'TXN-20260324-00089',
    created_at: '2026-03-24T14:30:00Z',
    total_amount: 4597.99,
    customer_name: 'John Smith',
    customer_email: 'john@email.com',
    customer_phone: '905-555-1234',
    company_name: null,
    customer_address: '456 Lakeshore Blvd West',
    customer_city: 'Mississauga',
    customer_province: 'ON',
    customer_postal: 'L5H 1G3',
    cashier_name: 'Sarah Jones',
    register_name: 'Register 1',
    shift_id: 42,
    order_number: 'SO-2026-00042',
    delivery_date: '2026-03-28',
    delivery_address: '456 Lakeshore Blvd West',
    delivery_city: 'Mississauga',
    delivery_province: 'ON',
    delivery_postal_code: 'L5H 1G3',
    delivery_notes: 'Buzz unit 204, elevator to 2nd floor'
  }] })],
  ['FROM transaction_items', () => ({ rows: [
    {
      product_name: 'Samsung 65" QLED 4K Smart TV',
      product_sku: 'SAM-65Q80C',
      quantity: 1,
      unit_price: 2499.99,
      discount_percent: 0,
      discount_amount: 0,
      tax_amount: 324.99,
      line_total: 2499.99,
      manufacturer: 'Samsung',
      model_number: 'QN65Q80C',
      serial_number: 'SN123456789'
    },
    {
      product_name: 'Samsung Soundbar HW-Q800C',
      product_sku: 'SAM-HWQ800C',
      quantity: 1,
      unit_price: 899.99,
      discount_percent: 0,
      discount_amount: 0,
      tax_amount: 117.00,
      line_total: 899.99,
      manufacturer: 'Samsung',
      model_number: 'HW-Q800C',
      serial_number: 'SN987654321'
    },
    {
      product_name: 'LG 30 Cu Ft French Door Refrigerator',
      product_sku: 'LG-LRMVS3006S',
      quantity: 1,
      unit_price: 3199.99,
      discount_percent: 5,
      discount_amount: 160.00,
      tax_amount: 395.20,
      line_total: 3039.99,
      manufacturer: 'LG',
      model_number: 'LRMVS3006S',
      serial_number: 'SN456789123'
    }
  ] })],
  ['FROM payments', () => ({ rows: [
    { payment_method: 'credit', amount: 4597.99, card_brand: 'VISA', card_last_four: '4242', processed_at: '2026-03-24T14:32:00Z', status: 'completed' }
  ] })],
  ['FROM transaction_commissions', () => ({ rows: [{ rep_name: 'Dave Miller' }] })],
]);

// ── Delivery Slip mock data ─────────────────────────────────────

const dsPool = createMockPool([
  ['FROM delivery_slips', () => ({ rows: [{
    id: 1,
    slip_number: 'DS-2026-00001',
    status: 'scheduled',
    delivery_date: '2026-03-28',
    delivery_address: '456 Lakeshore Blvd West',
    delivery_city: 'Mississauga',
    delivery_province: 'ON',
    delivery_postal_code: 'L5H 1G3',
    access_instructions: 'Buzz unit 204, elevator to 2nd floor, bring dolly',
    delivery_notes: 'Customer prefers morning delivery before 11 AM',
    customer_name: 'John Smith',
    customer_phone: '905-555-1234',
    customer_email: 'john@email.com',
    company_name: null,
    transaction_id: 89,
    transaction_number: 'TXN-20260324-00089',
    sales_order_number: 'SO-2026-00042',
    total_amount: 4597.99,
    cashier_id: 2,
    driver_name: null,
    vehicle_number: null
  }] })],
  ['FROM transaction_items', () => ({ rows: [
    { product_name: 'Samsung 65" QLED 4K Smart TV', product_sku: 'SAM-65Q80C', model_number: 'QN65Q80C', manufacturer: 'Samsung', serial_number: 'SN123456789', quantity: 1, model: null },
    { product_name: 'Samsung Soundbar HW-Q800C', product_sku: 'SAM-HWQ800C', model_number: 'HW-Q800C', manufacturer: 'Samsung', serial_number: 'SN987654321', quantity: 1, model: null },
    { product_name: 'LG 30 Cu Ft French Door Refrigerator', product_sku: 'LG-LRMVS3006S', model_number: 'LRMVS3006S', manufacturer: 'LG', serial_number: 'SN456789123', quantity: 1, model: null }
  ] })],
  ['FROM transaction_commissions', () => ({ rows: [{ rep_name: 'Dave Miller' }] })],
  ['FROM users u', () => ({ rows: [{ name: 'Sarah Jones' }] })],
]);

// ── Generate ────────────────────────────────────────────────────

async function main() {
  const config = {
    companyAddress: '1111 International Blvd',
    companyCity: 'Burlington, ON L7L 6W1',
    companyPhone: '(905) 273-5550',
    companyEmail: 'info@teletime.ca',
    companyWebsite: 'teletime.ca'
  };

  // Sales Order
  console.log('Generating Sales Order v2...');
  const soService = new SalesOrderService(soPool, null, config);
  const soPdf = await soService.generateSalesOrderPdf(89);
  fs.writeFileSync(SO_OUTPUT, soPdf);
  console.log(`  Saved: ${SO_OUTPUT} (${(soPdf.length / 1024).toFixed(1)} KB)`);

  // Delivery Slip
  console.log('Generating Delivery Slip v2...');
  const dsService = new DeliverySlipService(dsPool, null, config);
  const dsPdf = await dsService.generateDeliverySlipPdf(1);
  fs.writeFileSync(DS_OUTPUT, dsPdf);
  console.log(`  Saved: ${DS_OUTPUT} (${(dsPdf.length / 1024).toFixed(1)} KB)`);

  console.log('Done!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
