/**
 * TeleTime POS - Financing Service
 * Handles financing plans, applications, and payment management
 */

class FinancingService {
  constructor(pool) {
    this.pool = pool;

    // External provider configurations (stubbed for now)
    this.providers = {
      affirm: {
        name: 'Affirm',
        apiBaseUrl: process.env.AFFIRM_API_URL || 'https://sandbox.affirm.com/api/v2',
        publicKey: process.env.AFFIRM_PUBLIC_KEY,
        privateKey: process.env.AFFIRM_PRIVATE_KEY,
        enabled: !!process.env.AFFIRM_ENABLED,
      },
      klarna: {
        name: 'Klarna',
        apiBaseUrl: process.env.KLARNA_API_URL || 'https://api.playground.klarna.com',
        username: process.env.KLARNA_USERNAME,
        password: process.env.KLARNA_PASSWORD,
        enabled: !!process.env.KLARNA_ENABLED,
      },
      synchrony: {
        name: 'Synchrony',
        apiBaseUrl: process.env.SYNCHRONY_API_URL,
        merchantId: process.env.SYNCHRONY_MERCHANT_ID,
        enabled: !!process.env.SYNCHRONY_ENABLED,
      },
      internal: {
        name: 'Store Financing',
        enabled: true,
      },
    };
  }

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  /**
   * Get available financing plans for an order
   * @param {number} orderTotalCents - Order total in cents
   * @param {number|null} customerId - Optional customer ID for eligibility checks
   * @returns {Promise<{plans: Array}>}
   */
  async getAvailablePlans(orderTotalCents, customerId = null) {
    // Fetch all active financing options
    const optionsQuery = `
      SELECT
        id,
        financing_code,
        name,
        description,
        provider,
        term_months,
        apr,
        min_amount_cents,
        max_amount_cents,
        is_promotional,
        promo_start_date,
        promo_end_date,
        display_text,
        highlight_text
      FROM financing_options
      WHERE (min_amount_cents IS NULL OR min_amount_cents <= $1)
        AND (max_amount_cents IS NULL OR max_amount_cents >= $1)
        AND (promo_end_date IS NULL OR promo_end_date >= CURRENT_DATE)
        AND (promo_start_date IS NULL OR promo_start_date <= CURRENT_DATE)
      ORDER BY
        CASE WHEN apr = 0 THEN 0 ELSE 1 END, -- 0% APR first
        term_months ASC
    `;

    const { rows: options } = await this.pool.query(optionsQuery, [orderTotalCents]);

    // Check customer eligibility if provided
    let customerEligibility = null;
    if (customerId) {
      customerEligibility = await this._checkCustomerEligibility(customerId);
    }

    // Build plan list
    const plans = [];

    for (const option of options) {
      // Skip if provider not enabled (except internal)
      if (option.provider !== 'internal' && !this.providers[option.provider]?.enabled) {
        continue;
      }

      // Check customer-specific eligibility
      if (customerEligibility && !customerEligibility.eligible) {
        // Customer has bad financing history - skip external providers
        if (option.provider !== 'internal') continue;
      }

      const monthlyPayment = this._calculateMonthlyPayment(
        orderTotalCents,
        option.apr,
        option.term_months
      );

      const totalCost = this._calculateTotalCost(
        orderTotalCents,
        option.apr,
        option.term_months
      );

      plans.push({
        planId: option.id,
        financingCode: option.financing_code,
        providerName: this.providers[option.provider]?.name || option.provider,
        provider: option.provider,
        planName: option.name,
        description: option.description,
        termMonths: option.term_months,
        interestRate: parseFloat(option.apr),
        monthlyPayment: monthlyPayment / 100, // Convert to dollars for display
        monthlyPaymentCents: monthlyPayment,
        totalCost: totalCost / 100,
        totalCostCents: totalCost,
        totalInterest: (totalCost - orderTotalCents) / 100,
        totalInterestCents: totalCost - orderTotalCents,
        fees: 0, // Can add origination fees here
        eligibleAmount: {
          min: option.min_amount_cents ? option.min_amount_cents / 100 : 0,
          max: option.max_amount_cents ? option.max_amount_cents / 100 : null,
          minCents: option.min_amount_cents || 0,
          maxCents: option.max_amount_cents,
        },
        isPromotional: option.is_promotional,
        displayText: option.display_text?.replace('$XX', `$${(monthlyPayment / 100).toFixed(2)}`),
        highlightText: option.highlight_text,
      });
    }

    return {
      plans,
      orderTotal: orderTotalCents / 100,
      orderTotalCents,
      customerId,
      customerEligible: customerEligibility?.eligible ?? true,
      customerMessage: customerEligibility?.message,
    };
  }

  /**
   * Calculate detailed payment plan for a specific option
   * @param {number} planId - Financing option ID
   * @param {number} amountCents - Amount to finance in cents
   * @returns {Promise<object>} Payment plan details with schedule
   */
  async calculatePaymentPlan(planId, amountCents) {
    // Get the financing option
    const optionQuery = `
      SELECT * FROM financing_options WHERE id = $1
    `;
    const { rows } = await this.pool.query(optionQuery, [planId]);

    if (rows.length === 0) {
      throw new Error(`Financing plan not found: ${planId}`);
    }

    const option = rows[0];

    // Validate amount
    if (option.min_amount_cents && amountCents < option.min_amount_cents) {
      throw new Error(`Amount below minimum: $${(option.min_amount_cents / 100).toFixed(2)}`);
    }
    if (option.max_amount_cents && amountCents > option.max_amount_cents) {
      throw new Error(`Amount exceeds maximum: $${(option.max_amount_cents / 100).toFixed(2)}`);
    }

    const apr = parseFloat(option.apr);
    const termMonths = option.term_months;
    const monthlyPayment = this._calculateMonthlyPayment(amountCents, apr, termMonths);
    const totalCost = this._calculateTotalCost(amountCents, apr, termMonths);
    const totalInterest = totalCost - amountCents;

    // Generate payment schedule
    const schedule = this._generatePaymentSchedule(amountCents, apr, termMonths, monthlyPayment);

    return {
      planId,
      planName: option.name,
      provider: option.provider,
      providerName: this.providers[option.provider]?.name || option.provider,

      // Amounts
      principal: amountCents / 100,
      principalCents: amountCents,
      monthlyPayment: monthlyPayment / 100,
      monthlyPaymentCents: monthlyPayment,
      totalCost: totalCost / 100,
      totalCostCents: totalCost,
      totalInterest: totalInterest / 100,
      totalInterestCents: totalInterest,
      fees: 0,
      feesCents: 0,

      // Terms
      termMonths,
      apr,

      // Schedule
      schedule,
      firstPaymentDate: schedule[0]?.dueDate || null,
      finalPaymentDate: schedule[schedule.length - 1]?.dueDate || null,
    };
  }

  /**
   * Initiate financing for an order
   * @param {number} orderId - Order ID
   * @param {number} planId - Financing option ID
   * @param {number} customerId - Customer ID
   * @param {object} options - Additional options
   * @returns {Promise<object>} Application result
   */
  async initiateFinancing(orderId, planId, customerId, options = {}) {
    const { userId, amountCents, transactionId } = options;

    // Get the financing option
    const optionQuery = `SELECT * FROM financing_options WHERE id = $1`;
    const { rows: optionRows } = await this.pool.query(optionQuery, [planId]);

    if (optionRows.length === 0) {
      throw new Error(`Financing plan not found: ${planId}`);
    }

    const option = optionRows[0];

    // Get order details if not providing amount
    let financingAmount = amountCents;
    if (!financingAmount && orderId) {
      const orderQuery = `SELECT total_amount FROM orders WHERE id = $1`;
      const { rows: orderRows } = await this.pool.query(orderQuery, [orderId]);
      if (orderRows.length > 0) {
        financingAmount = Math.round(orderRows[0].total_amount * 100);
      }
    }

    if (!financingAmount) {
      throw new Error('Amount required for financing');
    }

    // Generate application number
    const appNumberQuery = `SELECT generate_financing_application_number() as num`;
    const { rows: numRows } = await this.pool.query(appNumberQuery);
    const applicationNumber = numRows[0].num;

    // Route to appropriate handler based on provider
    if (option.provider === 'internal') {
      return this._initiateInternalFinancing({
        applicationNumber,
        orderId,
        transactionId,
        planId,
        customerId,
        amountCents: financingAmount,
        termMonths: option.term_months,
        apr: option.apr,
        userId,
      });
    } else {
      return this._initiateExternalFinancing({
        applicationNumber,
        orderId,
        transactionId,
        planId,
        customerId,
        amountCents: financingAmount,
        termMonths: option.term_months,
        apr: option.apr,
        provider: option.provider,
        userId,
      });
    }
  }

  /**
   * Process callback from external financing provider
   * @param {string} providerId - Provider identifier (affirm, klarna, synchrony)
   * @param {object} callbackData - Raw callback payload
   * @returns {Promise<object>} Processing result
   */
  async processExternalCallback(providerId, callbackData) {
    // Log the callback
    const logQuery = `
      INSERT INTO financing_provider_callbacks (
        provider,
        callback_type,
        external_id,
        raw_payload
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const callbackType = this._determineCallbackType(providerId, callbackData);
    const externalId = this._extractExternalId(providerId, callbackData);

    const { rows: logRows } = await this.pool.query(logQuery, [
      providerId,
      callbackType,
      externalId,
      JSON.stringify(callbackData),
    ]);

    const callbackLogId = logRows[0].id;

    try {
      // Route to provider-specific handler
      let result;
      switch (providerId) {
        case 'affirm':
          result = await this._processAffirmCallback(callbackData);
          break;
        case 'klarna':
          result = await this._processKlarnaCallback(callbackData);
          break;
        case 'synchrony':
          result = await this._processSynchronyCallback(callbackData);
          break;
        default:
          throw new Error(`Unknown provider: ${providerId}`);
      }

      // Update callback log
      await this.pool.query(
        `UPDATE financing_provider_callbacks
         SET processed = true, processed_at = NOW(), processing_result = $1,
             application_id = $2, agreement_id = $3
         WHERE id = $4`,
        [JSON.stringify(result), result.applicationId, result.agreementId, callbackLogId]
      );

      return {
        success: true,
        callbackId: callbackLogId,
        ...result,
      };
    } catch (error) {
      // Log error
      await this.pool.query(
        `UPDATE financing_provider_callbacks
         SET processed = true, processed_at = NOW(), error_message = $1
         WHERE id = $2`,
        [error.message, callbackLogId]
      );

      throw error;
    }
  }

  /**
   * Get customer's financing information
   * @param {number} customerId - Customer ID
   * @returns {Promise<object>} Customer financing data
   */
  async getCustomerFinancing(customerId) {
    // Get active agreements
    const agreementsQuery = `
      SELECT
        fg.*,
        fo.name AS plan_name,
        fo.financing_code
      FROM financing_agreements fg
      JOIN financing_options fo ON fo.id = fg.financing_option_id
      WHERE fg.customer_id = $1
      ORDER BY fg.status = 'active' DESC, fg.created_at DESC
    `;

    const { rows: agreements } = await this.pool.query(agreementsQuery, [customerId]);

    // Get payment history
    const paymentsQuery = `
      SELECT
        fp.*,
        fg.agreement_number
      FROM financing_payments fp
      JOIN financing_agreements fg ON fg.id = fp.agreement_id
      WHERE fp.customer_id = $1
        AND fp.status IN ('paid', 'partial', 'late')
      ORDER BY fp.paid_at DESC
      LIMIT 20
    `;

    const { rows: paymentHistory } = await this.pool.query(paymentsQuery, [customerId]);

    // Get upcoming payments
    const upcomingQuery = `
      SELECT
        fp.*,
        fg.agreement_number,
        fg.provider
      FROM financing_payments fp
      JOIN financing_agreements fg ON fg.id = fp.agreement_id
      WHERE fp.customer_id = $1
        AND fp.status IN ('scheduled', 'pending')
        AND fg.status = 'active'
      ORDER BY fp.due_date ASC
      LIMIT 12
    `;

    const { rows: upcomingPayments } = await this.pool.query(upcomingQuery, [customerId]);

    // Calculate summary
    const activeAgreements = agreements.filter(a => a.status === 'active');
    const totalBalance = activeAgreements.reduce((sum, a) => sum + a.balance_remaining_cents, 0);
    const totalMonthlyPayment = activeAgreements.reduce((sum, a) => sum + a.monthly_payment_cents, 0);

    return {
      customerId,
      summary: {
        activeAgreements: activeAgreements.length,
        totalBalanceCents: totalBalance,
        totalBalance: totalBalance / 100,
        totalMonthlyPaymentCents: totalMonthlyPayment,
        totalMonthlyPayment: totalMonthlyPayment / 100,
        nextPaymentDate: upcomingPayments[0]?.due_date || null,
        nextPaymentAmountCents: upcomingPayments[0]?.amount_due_cents || 0,
      },
      agreements: agreements.map(a => ({
        agreementId: a.id,
        agreementNumber: a.agreement_number,
        planName: a.plan_name,
        provider: a.provider,
        status: a.status,
        principalCents: a.principal_amount_cents,
        principal: a.principal_amount_cents / 100,
        balanceRemainingCents: a.balance_remaining_cents,
        balanceRemaining: a.balance_remaining_cents / 100,
        monthlyPaymentCents: a.monthly_payment_cents,
        monthlyPayment: a.monthly_payment_cents / 100,
        termMonths: a.term_months,
        paymentsMade: a.payments_made,
        paymentsRemaining: a.payments_remaining,
        apr: parseFloat(a.apr),
        startDate: a.start_date,
        nextPaymentDate: a.next_payment_date,
        finalPaymentDate: a.final_payment_date,
      })),
      paymentHistory: paymentHistory.map(p => ({
        paymentId: p.id,
        agreementNumber: p.agreement_number,
        paymentNumber: p.payment_number,
        dueDate: p.due_date,
        amountDueCents: p.amount_due_cents,
        amountPaidCents: p.amount_paid_cents,
        amountPaid: p.amount_paid_cents / 100,
        paidAt: p.paid_at,
        status: p.status,
        daysLate: p.days_late,
        lateFeeCents: p.late_fee_cents,
      })),
      upcomingPayments: upcomingPayments.map(p => ({
        paymentId: p.id,
        agreementNumber: p.agreement_number,
        provider: p.provider,
        paymentNumber: p.payment_number,
        dueDate: p.due_date,
        amountDueCents: p.amount_due_cents,
        amountDue: p.amount_due_cents / 100,
        status: p.status,
      })),
    };
  }

  /**
   * Get a specific financing application
   * @param {number} applicationId - Application ID
   * @returns {Promise<object>}
   */
  async getApplication(applicationId) {
    const query = `
      SELECT
        fa.*,
        fo.name AS plan_name,
        fo.financing_code,
        c.name AS customer_name,
        c.email AS customer_email
      FROM financing_applications fa
      JOIN financing_options fo ON fo.id = fa.financing_option_id
      JOIN customers c ON c.id = fa.customer_id
      WHERE fa.id = $1
    `;

    const { rows } = await this.pool.query(query, [applicationId]);

    if (rows.length === 0) {
      return null;
    }

    const app = rows[0];
    return {
      applicationId: app.id,
      applicationNumber: app.application_number,
      customerId: app.customer_id,
      customerName: app.customer_name,
      customerEmail: app.customer_email,
      orderId: app.order_id,
      planId: app.financing_option_id,
      planName: app.plan_name,
      financingCode: app.financing_code,
      requestedAmountCents: app.requested_amount_cents,
      approvedAmountCents: app.approved_amount_cents,
      termMonths: app.term_months,
      apr: parseFloat(app.apr),
      status: app.status,
      provider: app.provider,
      externalApplicationId: app.external_application_id,
      decisionAt: app.decision_at,
      decisionReason: app.decision_reason,
      createdAt: app.created_at,
    };
  }

  /**
   * Record a payment on a financing agreement
   * @param {number} agreementId - Agreement ID
   * @param {number} amountCents - Payment amount in cents
   * @param {object} options - Payment options
   * @returns {Promise<object>}
   */
  async recordPayment(agreementId, amountCents, options = {}) {
    const { paymentMethod = 'card', externalPaymentId } = options;

    // Get the next scheduled payment
    const paymentQuery = `
      SELECT * FROM financing_payments
      WHERE agreement_id = $1 AND status IN ('scheduled', 'pending', 'partial')
      ORDER BY payment_number ASC
      LIMIT 1
    `;

    const { rows: payments } = await this.pool.query(paymentQuery, [agreementId]);

    if (payments.length === 0) {
      throw new Error('No pending payments found');
    }

    const payment = payments[0];
    const isFullPayment = amountCents >= payment.amount_due_cents;
    const newStatus = isFullPayment ? 'paid' : 'partial';

    // Update payment record
    await this.pool.query(
      `UPDATE financing_payments
       SET amount_paid_cents = amount_paid_cents + $1,
           paid_at = NOW(),
           payment_method = $2,
           external_payment_id = $3,
           status = $4,
           days_late = CASE WHEN due_date < CURRENT_DATE THEN CURRENT_DATE - due_date ELSE 0 END
       WHERE id = $5`,
      [amountCents, paymentMethod, externalPaymentId, newStatus, payment.id]
    );

    // Update agreement
    await this.pool.query(
      `UPDATE financing_agreements
       SET amount_paid_cents = amount_paid_cents + $1,
           balance_remaining_cents = balance_remaining_cents - $2,
           payments_made = payments_made + CASE WHEN $3 THEN 1 ELSE 0 END,
           payments_remaining = payments_remaining - CASE WHEN $3 THEN 1 ELSE 0 END,
           next_payment_date = (
             SELECT due_date FROM financing_payments
             WHERE agreement_id = $4 AND status = 'scheduled'
             ORDER BY payment_number ASC LIMIT 1
           ),
           status = CASE WHEN balance_remaining_cents - $2 <= 0 THEN 'paid_off' ELSE status END,
           paid_off_date = CASE WHEN balance_remaining_cents - $2 <= 0 THEN CURRENT_DATE ELSE paid_off_date END
       WHERE id = $4`,
      [amountCents, isFullPayment ? payment.principal_portion_cents : amountCents, isFullPayment, agreementId]
    );

    return {
      success: true,
      paymentId: payment.id,
      amountApplied: amountCents,
      status: newStatus,
      agreementId,
    };
  }

  /**
   * Link a transaction to financing
   * @param {number} transactionId - Transaction ID
   * @param {number} applicationId - Financing application ID
   * @param {number} agreementId - Financing agreement ID (optional)
   * @returns {Promise<void>}
   */
  async linkToTransaction(transactionId, applicationId, agreementId = null) {
    await this.pool.query(
      `UPDATE transactions
       SET financing_application_id = $1,
           financing_agreement_id = $2,
           is_financed = true
       WHERE transaction_id = $3`,
      [applicationId, agreementId, transactionId]
    );
  }

  /**
   * Calculate early payoff amount for an agreement
   * @param {number} agreementId - Agreement ID
   * @returns {Promise<object>} Payoff calculation
   */
  async calculatePayoffAmount(agreementId) {
    // Get remaining scheduled payments
    const query = `
      SELECT
        COALESCE(SUM(principal_portion_cents), 0) AS remaining_principal,
        COALESCE(SUM(interest_portion_cents), 0) AS remaining_interest,
        COUNT(*) AS remaining_payments
      FROM financing_payments
      WHERE agreement_id = $1 AND status = 'scheduled'
    `;

    const { rows } = await this.pool.query(query, [agreementId]);
    const result = rows[0];

    // Get agreement details
    const { rows: agRows } = await this.pool.query(
      `SELECT * FROM financing_agreements WHERE id = $1`,
      [agreementId]
    );

    if (agRows.length === 0) {
      throw new Error('Agreement not found');
    }

    const agreement = agRows[0];

    // Early payoff = remaining principal only (no future interest)
    const payoffAmountCents = parseInt(result.remaining_principal);
    const savingsCents = parseInt(result.remaining_interest);

    return {
      agreementId,
      agreementNumber: agreement.agreement_number,
      principalRemainingCents: payoffAmountCents,
      principalRemaining: payoffAmountCents / 100,
      interestRemainingCents: savingsCents,
      interestRemaining: savingsCents / 100,
      payoffAmountCents,
      payoffAmount: payoffAmountCents / 100,
      savingsCents,
      savings: savingsCents / 100,
      remainingPayments: parseInt(result.remaining_payments),
      asOfDate: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Process early payoff of an agreement
   * @param {number} agreementId - Agreement ID
   * @param {object} options - Payment options
   * @returns {Promise<object>} Payoff result
   */
  async processEarlyPayoff(agreementId, options = {}) {
    const { paymentMethod = 'card', externalPaymentId } = options;

    // Get payoff amount
    const payoff = await this.calculatePayoffAmount(agreementId);

    // Mark all scheduled payments as paid
    await this.pool.query(
      `UPDATE financing_payments
       SET status = 'paid',
           amount_paid_cents = principal_portion_cents,
           paid_at = NOW(),
           payment_method = $1,
           external_payment_id = $2
       WHERE agreement_id = $3 AND status = 'scheduled'`,
      [paymentMethod, externalPaymentId, agreementId]
    );

    // Update agreement
    await this.pool.query(
      `UPDATE financing_agreements
       SET status = 'paid_off',
           paid_off_date = CURRENT_DATE,
           early_payoff_date = CURRENT_DATE,
           early_payoff_amount_cents = $1,
           early_payoff_savings_cents = $2,
           balance_remaining_cents = 0,
           payments_remaining = 0,
           amount_paid_cents = principal_amount_cents
       WHERE id = $3`,
      [payoff.payoffAmountCents, payoff.savingsCents, agreementId]
    );

    // Update related transaction
    await this.pool.query(
      `UPDATE transactions
       SET financing_paid_off_at = NOW()
       WHERE financing_agreement_id = $1`,
      [agreementId]
    );

    return {
      success: true,
      agreementId,
      payoffAmountCents: payoff.payoffAmountCents,
      payoffAmount: payoff.payoffAmount,
      savingsCents: payoff.savingsCents,
      savings: payoff.savings,
      paidOffDate: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Get collections data (past due accounts)
   * @param {object} options - Filter options
   * @returns {Promise<object>} Collections data
   */
  async getCollections(options = {}) {
    const { riskLevel, minDaysOverdue = 1, limit = 100 } = options;

    let query = `
      SELECT * FROM v_financing_collections
      WHERE days_overdue >= $1
    `;
    const params = [minDaysOverdue];

    if (riskLevel) {
      query += ` AND risk_level = $2`;
      params.push(riskLevel);
    }

    query += ` ORDER BY days_overdue DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await this.pool.query(query, params);

    // Group by risk level
    const byRiskLevel = {
      critical: rows.filter(r => r.risk_level === 'critical'),
      high: rows.filter(r => r.risk_level === 'high'),
      medium: rows.filter(r => r.risk_level === 'medium'),
      low: rows.filter(r => r.risk_level === 'low'),
    };

    return {
      accounts: rows.map(r => ({
        paymentId: r.payment_id,
        agreementId: r.agreement_id,
        agreementNumber: r.agreement_number,
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        customerPhone: r.customer_phone,
        paymentNumber: r.payment_number,
        dueDate: r.due_date,
        amountDueCents: r.amount_due_cents,
        amountDue: r.amount_due_cents / 100,
        daysOverdue: r.days_overdue,
        lateFeeCents: r.late_fee_cents,
        totalBalanceCents: r.total_balance_cents,
        totalBalance: r.total_balance_cents / 100,
        provider: r.provider,
        riskLevel: r.risk_level,
      })),
      summary: {
        total: rows.length,
        critical: byRiskLevel.critical.length,
        high: byRiskLevel.high.length,
        medium: byRiskLevel.medium.length,
        low: byRiskLevel.low.length,
        totalAmountDueCents: rows.reduce((sum, r) => sum + r.amount_due_cents, 0),
      },
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Calculate monthly payment
   * @private
   */
  _calculateMonthlyPayment(principalCents, apr, termMonths) {
    if (termMonths <= 0) return principalCents;

    if (apr === 0 || apr === null) {
      // 0% APR: simple division, round to nearest cent
      return Math.round(principalCents / termMonths);
    }

    // Standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    const monthlyRate = apr / 100 / 12;
    const factor = Math.pow(1 + monthlyRate, termMonths);
    const payment = principalCents * (monthlyRate * factor) / (factor - 1);

    return Math.round(payment);
  }

  /**
   * Calculate total cost including interest
   * @private
   */
  _calculateTotalCost(principalCents, apr, termMonths) {
    if (apr === 0 || apr === null) {
      // 0% APR: total cost equals principal (no rounding error accumulation)
      return principalCents;
    }
    const monthlyPayment = this._calculateMonthlyPayment(principalCents, apr, termMonths);
    return monthlyPayment * termMonths;
  }

  /**
   * Generate payment schedule preview
   * @private
   */
  _generatePaymentSchedule(principalCents, apr, termMonths, monthlyPaymentCents) {
    const schedule = [];
    let balance = principalCents;
    const monthlyRate = apr > 0 ? apr / 100 / 12 : 0;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 1);
    startDate.setDate(1); // First of next month

    for (let i = 1; i <= termMonths; i++) {
      const interestPortion = Math.round(balance * monthlyRate);
      const isLastPayment = i === termMonths;
      const principalPortion = isLastPayment
        ? balance  // Last payment: remaining balance
        : monthlyPaymentCents - interestPortion;

      // Last payment amount adjusts to cover remainder (e.g. $1000/3 = $333, $333, $334)
      const actualPaymentCents = isLastPayment
        ? principalPortion + interestPortion
        : monthlyPaymentCents;

      const dueDate = new Date(startDate);
      dueDate.setMonth(startDate.getMonth() + (i - 1));

      schedule.push({
        paymentNumber: i,
        dueDate: dueDate.toISOString().split('T')[0],
        amountDue: actualPaymentCents / 100,
        amountDueCents: actualPaymentCents,
        principalPortion: principalPortion / 100,
        principalPortionCents: principalPortion,
        interestPortion: interestPortion / 100,
        interestPortionCents: interestPortion,
        balanceAfter: (balance - principalPortion) / 100,
        balanceAfterCents: balance - principalPortion,
      });

      balance -= principalPortion;
    }

    return schedule;
  }

  /**
   * Check customer eligibility for financing
   * @private
   */
  async _checkCustomerEligibility(customerId) {
    // Check for existing defaults or late payments
    const historyQuery = `
      SELECT
        COUNT(*) FILTER (WHERE fg.status = 'defaulted') AS defaults,
        COUNT(*) FILTER (WHERE fp.status = 'late' OR fp.status = 'missed') AS late_payments,
        COUNT(*) FILTER (WHERE fg.status = 'active') AS active_agreements
      FROM customers c
      LEFT JOIN financing_agreements fg ON fg.customer_id = c.id
      LEFT JOIN financing_payments fp ON fp.customer_id = c.id
      WHERE c.id = $1
    `;

    const { rows } = await this.pool.query(historyQuery, [customerId]);
    const history = rows[0];

    // Simple eligibility rules
    if (parseInt(history.defaults) > 0) {
      return {
        eligible: false,
        message: 'Customer has previous financing default',
        reason: 'default_history',
      };
    }

    if (parseInt(history.late_payments) > 3) {
      return {
        eligible: false,
        message: 'Too many late payments on record',
        reason: 'late_payment_history',
      };
    }

    if (parseInt(history.active_agreements) >= 3) {
      return {
        eligible: false,
        message: 'Maximum active financing agreements reached',
        reason: 'max_agreements',
      };
    }

    return {
      eligible: true,
      activeAgreements: parseInt(history.active_agreements),
      latePayments: parseInt(history.late_payments),
    };
  }

  /**
   * Initiate internal (store) financing
   * @private
   */
  async _initiateInternalFinancing(params) {
    const {
      applicationNumber,
      orderId,
      transactionId,
      planId,
      customerId,
      amountCents,
      termMonths,
      apr,
      userId,
    } = params;

    // Check eligibility
    const eligibility = await this._checkCustomerEligibility(customerId);
    if (!eligibility.eligible) {
      // Create declined application
      const insertQuery = `
        INSERT INTO financing_applications (
          application_number, customer_id, order_id, transaction_id,
          financing_option_id, requested_amount_cents, term_months, apr,
          status, provider, decision_at, decision_reason, decline_code, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'declined', 'internal', NOW(), $9, $10, $11)
        RETURNING id
      `;

      const { rows } = await this.pool.query(insertQuery, [
        applicationNumber,
        customerId,
        orderId,
        transactionId,
        planId,
        amountCents,
        termMonths,
        apr,
        eligibility.message,
        eligibility.reason,
        userId,
      ]);

      return {
        success: false,
        applicationId: rows[0].id,
        applicationNumber,
        status: 'declined',
        declineReason: eligibility.message,
        declineCode: eligibility.reason,
      };
    }

    // For internal financing, auto-approve (in real system, may have credit check)
    const insertAppQuery = `
      INSERT INTO financing_applications (
        application_number, customer_id, order_id, transaction_id,
        financing_option_id, requested_amount_cents, approved_amount_cents,
        term_months, apr, status, provider, decision_at, created_by, processed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, 'approved', 'internal', NOW(), $9, $9)
      RETURNING id
    `;

    const { rows: appRows } = await this.pool.query(insertAppQuery, [
      applicationNumber,
      customerId,
      orderId,
      transactionId,
      planId,
      amountCents,
      termMonths,
      apr,
      userId,
    ]);

    const applicationId = appRows[0].id;

    // Create financing agreement
    const agreement = await this._createAgreement(applicationId, {
      customerId,
      planId,
      principalCents: amountCents,
      termMonths,
      apr,
    });

    // Update application to active
    await this.pool.query(
      `UPDATE financing_applications SET status = 'active' WHERE id = $1`,
      [applicationId]
    );

    return {
      success: true,
      applicationId,
      applicationNumber,
      agreementId: agreement.agreementId,
      agreementNumber: agreement.agreementNumber,
      status: 'active',
      monthlyPaymentCents: agreement.monthlyPaymentCents,
      monthlyPayment: agreement.monthlyPaymentCents / 100,
      firstPaymentDate: agreement.firstPaymentDate,
      provider: 'internal',
    };
  }

  /**
   * Initiate external provider financing
   * @private
   */
  async _initiateExternalFinancing(params) {
    const {
      applicationNumber,
      orderId,
      transactionId,
      planId,
      customerId,
      amountCents,
      termMonths,
      apr,
      provider,
      userId,
    } = params;

    // Create pending application
    const insertQuery = `
      INSERT INTO financing_applications (
        application_number, customer_id, order_id, transaction_id,
        financing_option_id, requested_amount_cents, term_months, apr,
        status, provider, created_by,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, NOW() + INTERVAL '1 hour')
      RETURNING id
    `;

    const { rows } = await this.pool.query(insertQuery, [
      applicationNumber,
      customerId,
      orderId,
      transactionId,
      planId,
      amountCents,
      termMonths,
      apr,
      provider,
      userId,
    ]);

    const applicationId = rows[0].id;

    // Generate provider-specific redirect/flow
    let providerResponse;
    switch (provider) {
      case 'affirm':
        providerResponse = await this._initiateAffirmCheckout(applicationId, amountCents, customerId);
        break;
      case 'klarna':
        providerResponse = await this._initiateKlarnaSession(applicationId, amountCents, customerId);
        break;
      case 'synchrony':
        providerResponse = await this._initiateSynchronyApplication(applicationId, amountCents, customerId);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update application with external ID
    if (providerResponse.externalId) {
      await this.pool.query(
        `UPDATE financing_applications SET external_application_id = $1 WHERE id = $2`,
        [providerResponse.externalId, applicationId]
      );
    }

    return {
      success: true,
      applicationId,
      applicationNumber,
      status: 'pending',
      provider,
      requiresRedirect: providerResponse.requiresRedirect,
      redirectUrl: providerResponse.redirectUrl,
      checkoutToken: providerResponse.checkoutToken,
      externalId: providerResponse.externalId,
    };
  }

  /**
   * Create financing agreement from approved application
   * @private
   */
  async _createAgreement(applicationId, params) {
    const { customerId, planId, principalCents, termMonths, apr } = params;

    const monthlyPayment = this._calculateMonthlyPayment(principalCents, apr, termMonths);
    const totalCost = this._calculateTotalCost(principalCents, apr, termMonths);
    const totalInterest = totalCost - principalCents;

    // Generate agreement number
    const numQuery = `SELECT generate_financing_agreement_number() as num`;
    const { rows: numRows } = await this.pool.query(numQuery);
    const agreementNumber = numRows[0].num;

    // Calculate dates
    const startDate = new Date();
    const firstPaymentDate = new Date();
    firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
    firstPaymentDate.setDate(1);

    const finalPaymentDate = new Date(firstPaymentDate);
    finalPaymentDate.setMonth(finalPaymentDate.getMonth() + termMonths - 1);

    const insertQuery = `
      INSERT INTO financing_agreements (
        agreement_number, application_id, customer_id, financing_option_id,
        principal_amount_cents, total_amount_cents, total_interest_cents,
        term_months, apr, monthly_payment_cents,
        payments_remaining, balance_remaining_cents,
        start_date, first_payment_date, next_payment_date, final_payment_date,
        provider
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'internal')
      RETURNING id
    `;

    const { rows } = await this.pool.query(insertQuery, [
      agreementNumber,
      applicationId,
      customerId,
      planId,
      principalCents,
      totalCost,
      totalInterest,
      termMonths,
      apr,
      monthlyPayment,
      termMonths,
      principalCents,
      startDate.toISOString().split('T')[0],
      firstPaymentDate.toISOString().split('T')[0],
      firstPaymentDate.toISOString().split('T')[0],  // next_payment_date = first_payment_date initially
      finalPaymentDate.toISOString().split('T')[0],
    ]);

    const agreementId = rows[0].id;

    // Generate payment schedule
    await this.pool.query(`SELECT generate_payment_schedule($1)`, [agreementId]);

    return {
      agreementId,
      agreementNumber,
      monthlyPaymentCents: monthlyPayment,
      firstPaymentDate: firstPaymentDate.toISOString().split('T')[0],
    };
  }

  // ===========================================================================
  // EXTERNAL PROVIDER STUBS
  // ===========================================================================

  /**
   * Initiate Affirm checkout (stubbed)
   * @private
   */
  async _initiateAffirmCheckout(applicationId, amountCents, customerId) {
    // In production, this would call Affirm's API
    // https://docs.affirm.com/affirm-developers/docs/checkout-api
    console.log(`[FinancingService] Affirm checkout stub for app ${applicationId}`);

    return {
      requiresRedirect: true,
      redirectUrl: `https://checkout.affirm.com/checkout?token=stub_${applicationId}`,
      checkoutToken: `affirm_token_${applicationId}`,
      externalId: `affirm_${applicationId}_${Date.now()}`,
    };
  }

  /**
   * Initiate Klarna session (stubbed)
   * @private
   */
  async _initiateKlarnaSession(applicationId, amountCents, customerId) {
    // In production, this would call Klarna's API
    // https://docs.klarna.com/klarna-payments/
    console.log(`[FinancingService] Klarna session stub for app ${applicationId}`);

    return {
      requiresRedirect: false,
      clientToken: `klarna_client_${applicationId}`,
      sessionId: `klarna_session_${applicationId}`,
      externalId: `klarna_${applicationId}_${Date.now()}`,
    };
  }

  /**
   * Initiate Synchrony application (stubbed)
   * @private
   */
  async _initiateSynchronyApplication(applicationId, amountCents, customerId) {
    // In production, this would call Synchrony's API
    console.log(`[FinancingService] Synchrony application stub for app ${applicationId}`);

    return {
      requiresRedirect: true,
      redirectUrl: `https://apply.synchrony.com/apply?ref=stub_${applicationId}`,
      externalId: `sync_${applicationId}_${Date.now()}`,
    };
  }

  /**
   * Determine callback type from payload
   * @private
   */
  _determineCallbackType(providerId, callbackData) {
    // Provider-specific callback type detection
    if (callbackData.event || callbackData.type) {
      return callbackData.event || callbackData.type;
    }
    return 'unknown';
  }

  /**
   * Extract external ID from callback
   * @private
   */
  _extractExternalId(providerId, callbackData) {
    switch (providerId) {
      case 'affirm':
        return callbackData.checkout_token || callbackData.id;
      case 'klarna':
        return callbackData.session_id || callbackData.order_id;
      case 'synchrony':
        return callbackData.application_id || callbackData.reference;
      default:
        return callbackData.id || callbackData.reference;
    }
  }

  /**
   * Process Affirm callback (stubbed)
   * @private
   */
  async _processAffirmCallback(callbackData) {
    console.log('[FinancingService] Processing Affirm callback:', callbackData);

    // Find application by external ID
    const { rows } = await this.pool.query(
      `SELECT id FROM financing_applications WHERE external_application_id = $1`,
      [callbackData.checkout_token || callbackData.id]
    );

    if (rows.length === 0) {
      throw new Error('Application not found for callback');
    }

    const applicationId = rows[0].id;

    // Handle based on event type (stubbed)
    if (callbackData.event === 'checkout.completed' || callbackData.status === 'authorized') {
      // Approve application and create agreement
      await this.pool.query(
        `UPDATE financing_applications
         SET status = 'approved', approved_amount_cents = requested_amount_cents,
             decision_at = NOW(), external_status = $1, external_response = $2
         WHERE id = $3`,
        ['authorized', JSON.stringify(callbackData), applicationId]
      );

      return {
        applicationId,
        status: 'approved',
        action: 'create_agreement',
      };
    }

    return {
      applicationId,
      status: 'pending',
      action: 'none',
    };
  }

  /**
   * Process Klarna callback (stubbed)
   * @private
   */
  async _processKlarnaCallback(callbackData) {
    console.log('[FinancingService] Processing Klarna callback:', callbackData);

    return {
      applicationId: null,
      status: 'processed',
      action: 'none',
    };
  }

  /**
   * Process Synchrony callback (stubbed)
   * @private
   */
  async _processSynchronyCallback(callbackData) {
    console.log('[FinancingService] Processing Synchrony callback:', callbackData);

    return {
      applicationId: null,
      status: 'processed',
      action: 'none',
    };
  }
}

module.exports = FinancingService;
