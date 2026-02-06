-- ============================================================================
-- Migration 032b: Create Performance Indexes
--
-- This file creates indexes for query performance optimization.
-- Must be run OUTSIDE a transaction because CONCURRENTLY cannot be used
-- inside a transaction block.
--
-- Run this AFTER 032_database_integrity_fixes.sql
--
-- Generated: 2026-01-28
-- ============================================================================

-- Transaction indexes (critical for POS performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_customer_id
  ON transactions(customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_shift_id
  ON transactions(shift_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status
  ON transactions(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_created_at
  ON transactions(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_register_id
  ON transactions(register_id);

-- Transaction items indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_items_transaction_id
  ON transaction_items(transaction_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_items_product_id
  ON transaction_items(product_id);

-- Payments indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_transaction_id
  ON payments(transaction_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_payment_method
  ON payments(payment_method);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_created_at
  ON payments(created_at);

-- Quotation indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_customer_id
  ON quotations(customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_status
  ON quotations(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_created_at
  ON quotations(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_quote_number
  ON quotations(quote_number);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_expires_at
  ON quotations(expires_at) WHERE expires_at IS NOT NULL;

-- Quotation items indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotation_items_quotation_id
  ON quotation_items(quotation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotation_items_product_id
  ON quotation_items(product_id);

-- Product indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_sku
  ON products(sku);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand
  ON products(brand);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_id
  ON products(category_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_is_active
  ON products(is_active) WHERE is_active = true;

-- Customer indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email
  ON customers(email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone
  ON customers(phone);

-- Register shifts indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_register_shifts_user_id
  ON register_shifts(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_register_shifts_register_id
  ON register_shifts(register_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_register_shifts_status
  ON register_shifts(status);

-- Lead indexes (for CRM features)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status
  ON leads(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_to
  ON leads(assigned_to);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_created_at
  ON leads(created_at);

-- Audit log indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_created_at
  ON audit_log(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_id
  ON audit_log(user_id);

-- Price changes indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_changes_product_id
  ON price_changes(product_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_changes_created_at
  ON price_changes(created_at);
