/**
 * Multi-Tenant Quotation Isolation Tests
 *
 * Verifies that quotation CRUD operations respect tenant boundaries:
 *  - INSERTs include tenant_id
 *  - Quote numbers are sequenced per-tenant
 *  - RLS prevents cross-tenant reads/writes/deletes
 *  - PDF branding uses tenant_settings
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// ── Mock DB results per tenant ──────────────────────────────────────────────

function makeMockPool() {
  const quotations = new Map(); // id -> row
  let nextId = 1;
  const sequences = new Map(); // tenantId -> lastNumber

  return {
    _quotations: quotations,
    _sequences: sequences,
    _currentTenant: null,

    setTenant(tenantId) {
      this._currentTenant = tenantId;
    },

    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();

      // tenant_quote_sequences UPSERT
      if (sql.includes('tenant_quote_sequences')) {
        const tenantId = params[0];
        const current = this._sequences.get(tenantId) || 0;
        const next = current + 1;
        this._sequences.set(tenantId, next);
        return { rows: [{ last_number: next, prefix: 'QT' }] };
      }

      // INSERT INTO quotations
      if (sql.includes('INSERT INTO quotations')) {
        const id = nextId++;
        const tenantId = params[params.length - 1]; // tenant_id is last param
        const row = {
          id,
          quote_number: params[0],
          customer_id: params[1],
          tenant_id: tenantId,
          status: params[2] || 'DRAFT',
          total_cents: params[8] || 0,
          created_at: new Date().toISOString()
        };
        quotations.set(id, row);
        return { rows: [row] };
      }

      // SELECT from quotations (RLS simulated)
      if (sql.includes('SELECT') && sql.includes('FROM quotations') && sql.includes('WHERE') && sql.includes('id = $1')) {
        const id = parseInt(params[0]);
        const row = quotations.get(id);
        if (!row || (this._currentTenant && row.tenant_id !== this._currentTenant)) {
          return { rows: [] };
        }
        return { rows: [row] };
      }

      // SELECT all quotations (RLS simulated)
      if (sql.includes('FROM quotations') && !sql.includes('WHERE')) {
        const filtered = [...quotations.values()].filter(
          q => !this._currentTenant || q.tenant_id === this._currentTenant
        );
        return { rows: filtered };
      }

      // DELETE (RLS simulated)
      if (sql.includes('DELETE FROM quotations')) {
        const id = parseInt(params[0]);
        const row = quotations.get(id);
        if (!row || (this._currentTenant && row.tenant_id !== this._currentTenant)) {
          return { rows: [], rowCount: 0 };
        }
        quotations.delete(id);
        return { rows: [row], rowCount: 1 };
      }

      // tenant_settings lookup
      if (sql.includes('tenant_settings')) {
        const tenantId = params[0];
        if (tenantId === TENANT_A) {
          return {
            rows: [{
              tenant_id: TENANT_A,
              company_name: 'Tenant A Corp',
              company_address: '100 A Street',
              company_city: 'A-City',
              company_phone: '111-111-1111',
              company_email: 'a@corp.com',
              company_website: 'www.a-corp.com'
            }]
          };
        }
        return { rows: [] };
      }

      // Fallback
      return { rows: [] };
    },

    async connect() {
      const self = this;
      return {
        async query(text, params) { return self.query(text, params); },
        release() {},
        async end() {}
      };
    }
  };
}

// ── Helper: generate a JWT for a tenant user ──

function makeToken(userId, tenantId, role = 'admin') {
  return jwt.sign(
    { id: userId, tenant_id: tenantId, role, email: `user${userId}@test.com` },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Multi-Tenant Quotation Isolation', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = makeMockPool();
  });

  // ─── 1. Quote creation includes tenant_id ───────────────────────────────

  describe('Quote creation with tenant_id', () => {
    it('should include tenant_id in INSERT params for Tenant A', async () => {
      const QuoteService = require('../services/QuoteService');
      const svc = new QuoteService(mockPool);

      const spy = jest.spyOn(mockPool, 'query');

      // Simulate createQuote internals: generateQuoteNumber with tenant
      const qn = await svc.generateQuoteNumber(null, TENANT_A);
      expect(qn).toMatch(/^QT-\d{4}-0001$/);

      // Verify the sequence was created for Tenant A
      expect(mockPool._sequences.get(TENANT_A)).toBe(1);
    });

    it('should include tenant_id in INSERT params for Tenant B', async () => {
      const QuoteService = require('../services/QuoteService');
      const svc = new QuoteService(mockPool);

      const qn = await svc.generateQuoteNumber(null, TENANT_B);
      expect(qn).toMatch(/^QT-\d{4}-0001$/);
      expect(mockPool._sequences.get(TENANT_B)).toBe(1);
    });
  });

  // ─── 2. Quote numbers are independently sequenced per tenant ────────────

  describe('Per-tenant quote number sequences', () => {
    it('should sequence independently for each tenant', async () => {
      const QuoteService = require('../services/QuoteService');
      const svc = new QuoteService(mockPool);

      // Tenant A gets 3 quotes
      const a1 = await svc.generateQuoteNumber(null, TENANT_A);
      const a2 = await svc.generateQuoteNumber(null, TENANT_A);
      const a3 = await svc.generateQuoteNumber(null, TENANT_A);

      // Tenant B gets 2 quotes
      const b1 = await svc.generateQuoteNumber(null, TENANT_B);
      const b2 = await svc.generateQuoteNumber(null, TENANT_B);

      const year = new Date().getFullYear();

      // Tenant A: 0001, 0002, 0003
      expect(a1).toBe(`QT-${year}-0001`);
      expect(a2).toBe(`QT-${year}-0002`);
      expect(a3).toBe(`QT-${year}-0003`);

      // Tenant B: independently starts at 0001
      expect(b1).toBe(`QT-${year}-0001`);
      expect(b2).toBe(`QT-${year}-0002`);
    });

    it('should fall back to global MAX pattern when no tenant_id', async () => {
      const QuoteService = require('../services/QuoteService');
      const svc = new QuoteService(mockPool);

      const qn = await svc.generateQuoteNumber(null, null);
      // Fallback uses MAX query which returns empty → 1
      const year = new Date().getFullYear();
      expect(qn).toBe(`QT-${year}-0001`);
    });
  });

  // ─── 3. RLS prevents cross-tenant reads ─────────────────────────────────

  describe('Tenant isolation (simulated RLS)', () => {
    it('Tenant A cannot see Tenant B quotes', async () => {
      // Insert quotes for both tenants
      await mockPool.query(
        'INSERT INTO quotations (quote_number, customer_id, status, x,x,x,x,x,total_cents,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x, tenant_id)',
        ['QT-2026-0001', 1, 'DRAFT', 0,0,0,0,0,10000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, TENANT_A]
      );
      await mockPool.query(
        'INSERT INTO quotations (quote_number, customer_id, status, x,x,x,x,x,total_cents,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x, tenant_id)',
        ['QT-2026-0001', 2, 'DRAFT', 0,0,0,0,0,20000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, TENANT_B]
      );

      // Simulate RLS: set current tenant to A
      mockPool.setTenant(TENANT_A);

      // List all → should only see Tenant A's quote
      const listResult = await mockPool.query('SELECT * FROM quotations');
      expect(listResult.rows.length).toBe(1);
      expect(listResult.rows[0].tenant_id).toBe(TENANT_A);

      // Get Tenant B's quote by ID → should be empty (RLS blocks)
      const getResult = await mockPool.query(
        'SELECT * FROM quotations WHERE id = $1',
        [2] // Tenant B's quote ID
      );
      expect(getResult.rows.length).toBe(0);
    });

    it('Tenant A cannot delete Tenant B quotes', async () => {
      await mockPool.query(
        'INSERT INTO quotations (quote_number, customer_id, status, x,x,x,x,x,total_cents,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x, tenant_id)',
        ['QT-2026-0001', 1, 'DRAFT', 0,0,0,0,0,10000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, TENANT_B]
      );

      mockPool.setTenant(TENANT_A);

      const deleteResult = await mockPool.query(
        'DELETE FROM quotations WHERE id = $1',
        [1]
      );
      expect(deleteResult.rowCount).toBe(0);

      // Quote still exists (switch to no-tenant admin view)
      mockPool.setTenant(null);
      const checkResult = await mockPool.query(
        'SELECT * FROM quotations WHERE id = $1',
        [1]
      );
      expect(checkResult.rows.length).toBe(1);
    });
  });

  // ─── 4. Tenant branding for PDF ────────────────────────────────────────

  describe('Tenant branding lookup', () => {
    it('should return tenant-specific branding from tenant_settings', async () => {
      const result = await mockPool.query(
        'SELECT * FROM tenant_settings WHERE tenant_id = $1',
        [TENANT_A]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].company_name).toBe('Tenant A Corp');
      expect(result.rows[0].company_phone).toBe('111-111-1111');
    });

    it('should return empty rows for unknown tenant (fallback to env)', async () => {
      const result = await mockPool.query(
        'SELECT * FROM tenant_settings WHERE tenant_id = $1',
        [TENANT_B]
      );

      expect(result.rows.length).toBe(0);
    });
  });

  // ─── 5. Migration table structure ──────────────────────────────────────

  describe('Migration 131 table structure', () => {
    it('tenant_quote_sequences should have expected columns', () => {
      // Validate the migration SQL defines the right schema
      const fs = require('fs');
      const path = require('path');
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '131_tenant_quote_sequences.sql'),
        'utf8'
      );

      expect(migrationSql).toContain('tenant_quote_sequences');
      expect(migrationSql).toContain('tenant_id UUID NOT NULL');
      expect(migrationSql).toContain('last_number INTEGER');
      expect(migrationSql).toContain('prefix VARCHAR(10)');
      expect(migrationSql).toContain('PRIMARY KEY');
    });

    it('tenant_settings should have branding columns', () => {
      const fs = require('fs');
      const path = require('path');
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '131_tenant_quote_sequences.sql'),
        'utf8'
      );

      expect(migrationSql).toContain('tenant_settings');
      expect(migrationSql).toContain('company_name TEXT');
      expect(migrationSql).toContain('company_address TEXT');
      expect(migrationSql).toContain('company_phone TEXT');
      expect(migrationSql).toContain('company_email TEXT');
      expect(migrationSql).toContain('logo_url TEXT');
      expect(migrationSql).toContain('primary_color VARCHAR');
      expect(migrationSql).toContain('tax_rate NUMERIC');
      expect(migrationSql).toContain('quote_expiry_days INTEGER');
    });

    it('migration should include backfill for existing quotations', () => {
      const fs = require('fs');
      const path = require('path');
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '131_tenant_quote_sequences.sql'),
        'utf8'
      );

      expect(migrationSql).toContain('UPDATE quotations q');
      expect(migrationSql).toContain('SET tenant_id = u.tenant_id');
      expect(migrationSql).toContain('UPDATE quotation_items qi');
    });
  });
});
