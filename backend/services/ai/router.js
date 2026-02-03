/**
 * AI Model Router
 * Determines which model to use based on query characteristics
 *
 * Routing Strategy:
 * - Haiku (85%): Simple lookups, basic queries
 * - Sonnet (15%): VIP customers, email drafts, complex reasoning
 */

// Model identifiers
const MODELS = {
  HAIKU: 'claude-3-5-haiku-20241022',
  SONNET: 'claude-3-5-sonnet-20241022'
};

// VIP threshold (clv_score >= 80)
const VIP_CLV_THRESHOLD = 80;

/**
 * Routing rules for when to use Sonnet (more expensive, better reasoning)
 */
const SONNET_TRIGGERS = {
  /**
   * VIP customers get premium model for better service
   */
  vipCustomer: (context) => {
    if (!context.customer) return false;
    return context.customer.clv_score >= VIP_CLV_THRESHOLD;
  },

  /**
   * Email drafting requires more nuanced writing
   */
  emailDraft: (query) => {
    const emailPatterns = [
      /\b(draft|write|compose|create)\b.*\b(email|message|letter)\b/i,
      /\b(email|message)\b.*\b(to|for)\b.*\b(customer|client)\b/i,
      /\bfollow[- ]?up\b.*\b(email|message)\b/i,
      /\bsend\b.*\b(quote|quotation|proposal)\b/i
    ];
    return emailPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Complex reasoning or analysis requests
   */
  complexQuery: (query) => {
    const complexPatterns = [
      /\bcompare\b.*\bproducts?\b/i,
      /\banalyz(e|is|ing)\b/i,
      /\brecommend\b.*\bbased on\b/i,
      /\bwhy\s+(did|should|would|is)\b/i,
      /\bexplain\b.*\bdifference\b/i,
      /\bwhat\s+(are|is)\s+the\s+best\b/i,
      /\bhelp\s+(me\s+)?(decide|choose)\b/i,
      /\bpros?\s+(and|&)\s+cons?\b/i
    ];
    return complexPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Pricing discussions or negotiations
   */
  pricingDiscussion: (query) => {
    const pricingPatterns = [
      /\bdiscount\b/i,
      /\bnegotiat(e|ion)\b/i,
      /\bprice\s+match\b/i,
      /\bbetter\s+(price|deal)\b/i,
      /\bbudget\b.*\b(fit|within|under)\b/i,
      /\bflexib(le|ility)\b.*\bpric(e|ing)\b/i
    ];
    return pricingPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Long conversations need better context handling
   */
  longConversation: (history) => {
    return history && history.length > 8;
  },

  /**
   * Cross-sell/upsell suggestions need understanding of customer
   */
  crossSellRequest: (query) => {
    const crossSellPatterns = [
      /\bwhat\s+else\b.*\b(need|want|buy)\b/i,
      /\bsuggest\b.*\b(accessories?|add[- ]?ons?)\b/i,
      /\bcomplement(ary)?\b.*\bproducts?\b/i,
      /\bgoes?\s+(well\s+)?with\b/i,
      /\bupsell\b/i,
      /\bcross[- ]?sell\b/i
    ];
    return crossSellPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Sensitive customer situations
   */
  sensitiveContext: (query, context) => {
    // Customer with complaint or issue
    if (context.customer?.churn_risk === 'high') return true;

    // Query mentions complaint, problem, issue
    const sensitivePatterns = [
      /\b(complaint|complain|unhappy|upset|angry)\b/i,
      /\b(problem|issue|wrong)\b.*\b(order|delivery|product)\b/i,
      /\b(refund|return|exchange)\b/i,
      /\bnot\s+(happy|satisfied)\b/i
    ];
    return sensitivePatterns.some(pattern => pattern.test(query));
  }
};

/**
 * Select the appropriate model for a query
 * @param {string} query - The user's query text
 * @param {object} context - RAG context with customer/product info
 * @param {array} history - Conversation history
 * @returns {object} { model: string, reasons: string[] }
 */
function selectModel(query, context, history) {
  const reasons = [];

  // Check each Sonnet trigger
  if (SONNET_TRIGGERS.vipCustomer(context)) {
    reasons.push('vip_customer');
  }

  if (SONNET_TRIGGERS.emailDraft(query)) {
    reasons.push('email_draft');
  }

  if (SONNET_TRIGGERS.complexQuery(query)) {
    reasons.push('complex_reasoning');
  }

  if (SONNET_TRIGGERS.pricingDiscussion(query)) {
    reasons.push('pricing_discussion');
  }

  if (SONNET_TRIGGERS.longConversation(history)) {
    reasons.push('long_conversation');
  }

  if (SONNET_TRIGGERS.crossSellRequest(query)) {
    reasons.push('cross_sell_request');
  }

  if (SONNET_TRIGGERS.sensitiveContext(query, context)) {
    reasons.push('sensitive_context');
  }

  // Use Sonnet if any trigger matched
  const useSonnet = reasons.length > 0;

  return {
    model: useSonnet ? MODELS.SONNET : MODELS.HAIKU,
    reasons: reasons.length > 0 ? reasons : ['simple_lookup']
  };
}

/**
 * Get estimated cost for a model
 * @param {string} model - Model identifier
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} outputTokens - Estimated output tokens
 * @returns {number} Estimated cost in USD
 */
function estimateCost(model, inputTokens, outputTokens) {
  const pricing = {
    [MODELS.HAIKU]: { input: 1.00, output: 5.00 },
    [MODELS.SONNET]: { input: 3.00, output: 15.00 }
  };

  const rates = pricing[model] || pricing[MODELS.HAIKU];
  return (inputTokens / 1_000_000) * rates.input +
         (outputTokens / 1_000_000) * rates.output;
}

module.exports = {
  MODELS,
  VIP_CLV_THRESHOLD,
  selectModel,
  estimateCost
};
