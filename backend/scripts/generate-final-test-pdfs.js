'use strict';

/**
 * Generate final test PDFs using actual service classes with mocked DB queries.
 */

const fs = require('fs');
const SalesOrderService = require('../services/SalesOrderService');
const DeliverySlipService = require('../services/DeliverySlipService');
const DeliveryWaiverService = require('../services/DeliveryWaiverService');

const SO_OUT = 'C:/Users/WD-PC1/OneDrive/Desktop/SalesOrder_v5.pdf';
const DS_OUT = 'C:/Users/WD-PC1/OneDrive/Desktop/DeliverySlip_v5.pdf';
const DW_OUT = 'C:/Users/WD-PC1/OneDrive/Desktop/DeliveryWaiver_v5.pdf';

function mockPool(map) {
  return {
    query(sql, params) {
      for (const [pattern, handler] of map) {
        if (sql.includes(pattern)) return Promise.resolve(handler(params));
      }
      return Promise.resolve({ rows: [] });
    }
  };
}

const txn = {
  transaction_id: 89,
  transaction_number: 'TXN-20260324-00089',
  created_at: '2026-03-24T14:30:00Z',
  total_amount: 6439.97,
  subtotal_amount: 6439.97,
  discount_amount: 0,
  tax_amount: 837.20,
  customer_name: 'John Smith',
  customer_email: 'john@email.com',
  customer_phone: '905-555-1234',
  company_name: null,
  customer_address: '123 Main Street',
  customer_city: 'Mississauga',
  customer_province: 'ON',
  customer_postal: 'L5B 2C9',
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
};

const items = [
  { product_name: 'Samsung 65" QLED 4K Smart TV', product_sku: 'SAM-65Q80C', quantity: 1, unit_price: 2499.99, discount_percent: 0, discount_amount: 0, tax_amount: 324.99, line_total: 2499.99, manufacturer: 'Samsung', model_number: 'QN65Q80C', serial_number: 'SN123456789' },
  { product_name: 'Samsung Soundbar HW-Q800C', product_sku: 'SAM-HWQ800C', quantity: 1, unit_price: 899.99, discount_percent: 0, discount_amount: 0, tax_amount: 117.00, line_total: 899.99, manufacturer: 'Samsung', model_number: 'HW-Q800C', serial_number: 'SN987654321' },
  { product_name: 'LG 30 Cu Ft French Door Refrigerator', product_sku: 'LG-LRMVS3006S', quantity: 1, unit_price: 3039.99, discount_percent: 0, discount_amount: 0, tax_amount: 395.20, line_total: 3039.99, manufacturer: 'LG', model_number: 'LRMVS3006S', serial_number: 'SN456789123' },
];

const payments = [
  { payment_method: 'credit', amount: 6439.97, card_brand: 'VISA', card_last_four: '4242', processed_at: '2026-03-24T14:32:00Z', status: 'completed' }
];

const soPool = mockPool([
  ['FROM transactions t', () => ({ rows: [txn] })],
  ['FROM transaction_items', () => ({ rows: items })],
  ['FROM payments', () => ({ rows: payments })],
  ['FROM transaction_commissions', () => ({ rows: [{ rep_name: 'Dave Miller' }] })],
]);

const dsPool = mockPool([
  ['FROM delivery_slips', () => ({ rows: [{
    id: 1, slip_number: 'DS-2026-00001', status: 'scheduled',
    delivery_date: '2026-03-28',
    delivery_address: '456 Lakeshore Blvd West',
    delivery_city: 'Mississauga', delivery_province: 'ON', delivery_postal_code: 'L5H 1G3',
    access_instructions: 'Buzz unit 204, elevator to 2nd floor, bring dolly',
    delivery_notes: 'Customer prefers morning delivery before 11 AM',
    customer_name: 'John Smith', customer_phone: '905-555-1234', customer_email: 'john@email.com',
    company_name: null, transaction_id: 89, transaction_number: 'TXN-20260324-00089',
    sales_order_number: 'SO-2026-00042', total_amount: 6439.97, cashier_id: 2,
    driver_name: null, vehicle_number: null
  }] })],
  ['FROM transaction_items', () => ({ rows: items.map(i => ({ ...i, model: null })) })],
  ['FROM transaction_commissions', () => ({ rows: [{ rep_name: 'Dave Miller' }] })],
  ['FROM users u', () => ({ rows: [{ name: 'Sarah Jones' }] })],
]);

const config = {
  companyAddress: '3125 Wolfedale Road',
  companyCity: 'Mississauga, ON L5C 1V8',
  companyPhone: '(905) 273-5550',
  companyEmail: 'info@teletime.ca',
  companyWebsite: 'www.teletime.ca'
};

async function main() {
  console.log('Generating Sales Order Final...');
  const so = new SalesOrderService(soPool, null, config);
  const soPdf = await so.generateSalesOrderPdf(89);
  fs.writeFileSync(SO_OUT, soPdf);
  console.log(`  ${SO_OUT} (${(soPdf.length / 1024).toFixed(1)} KB)`);

  console.log('Generating Delivery Slip Final...');
  const ds = new DeliverySlipService(dsPool, null, config);
  const dsPdf = await ds.generateDeliverySlipPdf(1);
  fs.writeFileSync(DS_OUT, dsPdf);
  console.log(`  ${DS_OUT} (${(dsPdf.length / 1024).toFixed(1)} KB)`);

  console.log('Generating Delivery Waiver Final...');
  const dw = new DeliveryWaiverService(dsPool, null, config);
  const dwPdf = await dw.generateWaiverPdf(1);
  fs.writeFileSync(DW_OUT, dwPdf);
  console.log(`  ${DW_OUT} (${(dwPdf.length / 1024).toFixed(1)} KB)`);

  console.log('Done!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
