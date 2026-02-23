const { ApiError } = require('../middleware/errorHandler');

class CustomerAccountService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async openAccount(customerId, creditLimitCents, paymentTermsDays, userId) {
    const existing = await this.pool.query(
      `SELECT id FROM customer_accounts WHERE customer_id = $1`, [customerId]
    );
    if (existing.rows.length) throw new ApiError(409, 'Customer already has an account');

    const { rows: [account] } = await this.pool.query(
      `INSERT INTO customer_accounts (customer_id, credit_limit_cents, payment_terms_days, opened_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [customerId, creditLimitCents, paymentTermsDays || 30, userId]
    );
    return account;
  }

  async getAccount(accountIdOrCustomerId, byCustomer = false) {
    const col = byCustomer ? 'ca.customer_id' : 'ca.id';
    const { rows: [account] } = await this.pool.query(
      `SELECT ca.*, c.name as customer_name, c.email as customer_email
       FROM customer_accounts ca JOIN customers c ON c.id = ca.customer_id
       WHERE ${col} = $1`, [accountIdOrCustomerId]
    );
    if (!account) throw new ApiError(404, 'Account not found');
    return account;
  }

  async charge(accountId, amountCents, referenceType, referenceId, description, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [account] } = await client.query(
        `SELECT * FROM customer_accounts WHERE id = $1 FOR UPDATE`, [accountId]
      );
      if (!account) throw new ApiError(404, 'Account not found');
      if (account.status !== 'active') throw new ApiError(400, 'Account is not active');

      const newBalance = account.balance_cents + amountCents;
      if (newBalance > account.credit_limit_cents) {
        throw new ApiError(400, 'Charge exceeds credit limit');
      }

      await client.query(
        `UPDATE customer_accounts SET balance_cents = $2, last_charge_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [accountId, newBalance]
      );

      const { rows: [txn] } = await client.query(
        `INSERT INTO customer_account_transactions (account_id, type, amount_cents, balance_after_cents, reference_type, reference_id, description, created_by)
         VALUES ($1, 'charge', $2, $3, $4, $5, $6, $7) RETURNING *`,
        [accountId, amountCents, newBalance, referenceType, referenceId, description, userId]
      );

      await client.query('COMMIT');
      return txn;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async payment(accountId, amountCents, referenceType, referenceId, description, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [account] } = await client.query(
        `SELECT * FROM customer_accounts WHERE id = $1 FOR UPDATE`, [accountId]
      );
      if (!account) throw new ApiError(404, 'Account not found');

      const newBalance = account.balance_cents - amountCents;

      await client.query(
        `UPDATE customer_accounts SET balance_cents = $2, last_payment_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [accountId, newBalance]
      );

      const { rows: [txn] } = await client.query(
        `INSERT INTO customer_account_transactions (account_id, type, amount_cents, balance_after_cents, reference_type, reference_id, description, created_by)
         VALUES ($1, 'payment', $2, $3, $4, $5, $6, $7) RETURNING *`,
        [accountId, amountCents, newBalance, referenceType, referenceId, description, userId]
      );

      await client.query('COMMIT');
      return txn;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getStatement(accountId, { startDate, endDate, limit = 100, offset = 0 } = {}) {
    const conditions = ['cat.account_id = $1'];
    const params = [accountId];
    let pi = 2;
    if (startDate) { conditions.push(`cat.created_at >= $${pi++}`); params.push(startDate); }
    if (endDate) { conditions.push(`cat.created_at <= $${pi++}`); params.push(endDate); }

    const { rows } = await this.pool.query(
      `SELECT cat.* FROM customer_account_transactions cat
       WHERE ${conditions.join(' AND ')} ORDER BY cat.created_at DESC LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const account = await this.getAccount(accountId);
    return { account, transactions: rows };
  }

  async listAccounts({ status, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let pi = 1;
    if (status) { conditions.push(`ca.status = $${pi++}`); params.push(status); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await this.pool.query(
      `SELECT ca.*, c.name as customer_name, c.email as customer_email
       FROM customer_accounts ca JOIN customers c ON c.id = ca.customer_id
       ${where} ORDER BY ca.created_at DESC LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    const { rows: [{ total }] } = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM customer_accounts ca ${where}`, params
    );
    return { accounts: rows, total };
  }

  async updateAccount(accountId, data, userId) {
    const fields = [];
    const params = [];
    let pi = 1;
    if (data.creditLimitCents !== undefined) { fields.push(`credit_limit_cents = $${pi++}`); params.push(data.creditLimitCents); }
    if (data.paymentTermsDays !== undefined) { fields.push(`payment_terms_days = $${pi++}`); params.push(data.paymentTermsDays); }
    if (data.status) { fields.push(`status = $${pi++}`); params.push(data.status); }
    if (data.notes !== undefined) { fields.push(`notes = $${pi++}`); params.push(data.notes); }

    if (!fields.length) throw new ApiError(400, 'No valid fields');
    fields.push('updated_at = NOW()');
    params.push(accountId);

    const { rows: [account] } = await this.pool.query(
      `UPDATE customer_accounts SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`, params
    );
    if (!account) throw new ApiError(404, 'Account not found');
    return account;
  }

  async checkCreditHold(customerId) {
    const { rows: [account] } = await this.pool.query(
      `SELECT * FROM customer_accounts WHERE customer_id = $1`, [customerId]
    );
    if (!account) return { hasAccount: false, canCharge: false };
    return {
      hasAccount: true,
      canCharge: account.status === 'active' && account.balance_cents < account.credit_limit_cents,
      availableCredit: account.credit_limit_cents - account.balance_cents,
      status: account.status
    };
  }
}

module.exports = CustomerAccountService;
