/**
 * AI Assistant Prompt Templates
 * System prompts and query classification
 */

const { VIP_CLV_THRESHOLD } = require('../router');

/**
 * Build the system prompt with user context
 */
function buildSystemPrompt(user, locationId, ragContext) {
  const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  const currentDate = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTime = new Date().toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit'
  });

  let systemPrompt = `You are a helpful AI assistant for TeleTime Solutions retail staff. You help with customer service, product information, and quotation management.

## YOUR CAPABILITIES
- Look up customers by name, phone, email, or customer ID
- Search products by name, SKU, model number, category, or manufacturer
- Check quotation status, history, and details
- Provide cross-sell and upsell suggestions
- Draft professional customer emails

## CRITICAL RULES

### Customer Privacy & Verification
1. When a customer is identified, always show their basic info (name, ID) first
2. For VIP customers (CLV score ≥ ${VIP_CLV_THRESHOLD}), always note "⭐ VIP Customer" prominently
3. If a customer has high churn risk, flag it for the staff member

### Pricing Guidelines
1. Always show MSRP and sale price if different
2. Never promise discounts beyond what's in the system
3. For VIP customers, mention if they have special pricing tiers
4. Flag if a product is on clearance or discontinued

### Quotation Handling
1. Always include quote number and status
2. Flag quotes expiring within 7 days as "⚠️ Expiring Soon"
3. Show all line items with quantities and prices
4. Include customer contact info for follow-up

### Response Format
- Keep responses concise for simple lookups (use bullet points)
- Use markdown tables for product comparisons
- Include relevant IDs (Customer #, Quote #, SKU) for easy reference
- Format currency as CAD (e.g., $1,234.56)

### Email Drafting
When drafting emails:
- Use professional but warm tone
- Include specific product/quote details mentioned
- Add clear call-to-action
- Keep under 150 words unless the situation requires more detail
- Sign off as the staff member, not as AI

## TOOLS AVAILABLE
You have access to these tools to look up information:
- lookup_customer: Search for customers
- search_products: Search product catalog
- get_quotation: Get quote details
- get_customer_quotes: Get all quotes for a customer
- get_customer_history: Get purchase history and preferences
- get_product_details: Get detailed product info
- get_cross_sell_suggestions: Get product recommendations

Always use the appropriate tool to get accurate, up-to-date information before responding.

## CURRENT CONTEXT
- Staff Member: ${userName} (${user.role || 'staff'})
- Date: ${currentDate}
- Time: ${currentTime}
${locationId ? `- Location ID: ${locationId}` : ''}

## CONVERSATION GUIDELINES
- Be helpful and efficient - staff are busy
- If you're unsure about something, say so and suggest alternatives
- For complex requests, break down the steps
- If a tool returns an error, explain it simply and suggest what the user can try`;

  // Add RAG context hints if available
  if (ragContext.customer) {
    const isVIP = ragContext.customer.clv_score >= VIP_CLV_THRESHOLD;
    systemPrompt += `

## PRE-LOADED CONTEXT
A customer has been identified in the conversation:
- Name: ${ragContext.customer.name}
- ID: ${ragContext.customer.id}
${isVIP ? '- STATUS: ⭐ VIP CUSTOMER - provide premium service' : ''}
${ragContext.customer.churn_risk === 'high' ? '- WARNING: High churn risk - handle with care' : ''}`;
  }

  return systemPrompt;
}

/**
 * Classify the query type for context assembly and logging
 */
function classifyQuery(query) {
  const lowerQuery = query.toLowerCase();

  // Customer lookup patterns
  const customerPatterns = [
    /\b(find|look\s*up|search|get|who\s+is)\b.*\bcustomer\b/i,
    /\bcustomer\b.*\b(info|details|account|profile)\b/i,
    /\b(phone|email|address)\b.*\b(for|of)\b/i,
    /\bcontact\s+(info|details|information)\b/i
  ];

  // Product search patterns
  const productPatterns = [
    /\b(find|search|look\s*up|show|get)\b.*\b(product|item|model|sku)\b/i,
    /\b(product|item)\b.*\b(info|details|specs|price)\b/i,
    /\bdo\s+(we|you)\s+have\b/i,
    /\bin\s+stock\b/i,
    /\bhow\s+much\s+(is|does|for)\b/i,
    /\b(refrigerator|washer|dryer|dishwasher|range|oven|tv|freezer)\b/i
  ];

  // Quote status patterns
  const quotePatterns = [
    /\b(quote|quotation)\b.*\b(status|details|info)\b/i,
    /\bstatus\s+of\b.*\b(quote|quotation)\b/i,
    /\bquote\s*#?\s*\d+/i,
    /\b(Q|QT)[-\s]?\d{4,}/i,
    /\bcheck\b.*\bquote\b/i
  ];

  // Email draft patterns
  const emailPatterns = [
    /\b(draft|write|compose|create|send)\b.*\b(email|message|letter)\b/i,
    /\bemail\b.*\b(to|for)\b/i,
    /\bfollow[- ]?up\b/i,
    /\breminder\b.*\b(email|send)\b/i
  ];

  // Cross-sell patterns
  const crossSellPatterns = [
    /\b(suggest|recommend)\b.*\b(product|item|accessory|add[- ]?on)\b/i,
    /\bwhat\s+else\b/i,
    /\bgoes\s+(well\s+)?with\b/i,
    /\bcomplement(ary)?\b/i,
    /\bupsell\b/i,
    /\bcross[- ]?sell\b/i
  ];

  // Check patterns in order of specificity
  if (emailPatterns.some(p => p.test(query))) {
    return 'email_draft';
  }

  if (crossSellPatterns.some(p => p.test(query))) {
    return 'cross_sell';
  }

  if (quotePatterns.some(p => p.test(query))) {
    return 'quote_status';
  }

  if (customerPatterns.some(p => p.test(query))) {
    return 'customer_lookup';
  }

  if (productPatterns.some(p => p.test(query))) {
    return 'product_search';
  }

  // Default to general
  return 'general';
}

/**
 * Query-specific prompt additions (can be added to messages)
 */
const QUERY_PROMPTS = {
  customer_lookup: `When showing customer information:
- Display: Name, phone, email, customer ID
- Show CLV score and segment
- Note any open quotes or outstanding balance
- Flag VIP status prominently
- Include any special notes on their account`,

  product_search: `When showing product search results:
- Display: Name, SKU/Model, manufacturer, price
- Show both MSRP and sale price if different
- Indicate stock status (In Stock, X available, Out of Stock)
- Note if item is discontinued or on clearance
- Include key specs relevant to the search`,

  quote_status: `When showing quotation details:
- Display: Quote number, status, customer name, total
- List all line items with quantities and prices
- Show created date and expiry date
- Flag if expiring within 7 days
- Note if quote has been sent/viewed`,

  email_draft: `When drafting customer emails:
- Use professional but friendly tone
- Reference specific products or quote details
- Include clear next steps or call-to-action
- Keep length appropriate (usually under 150 words)
- Format for easy reading`,

  cross_sell: `When suggesting cross-sells:
- Base suggestions on cart contents or purchase history
- Prioritize complementary items (accessories, protection plans)
- Explain why each suggestion is relevant
- Limit to 3-4 top suggestions
- Include prices for suggested items`
};

module.exports = {
  buildSystemPrompt,
  classifyQuery,
  QUERY_PROMPTS
};
