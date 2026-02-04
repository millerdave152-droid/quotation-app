/**
 * Seed AI Evaluation Cases
 * Populates the ai_eval_cases table with golden set test cases
 *
 * Usage: node scripts/seed-eval-cases.js
 */

require('dotenv').config();
const db = require('../config/database');

// ============================================================
// EVALUATION CASES - Golden Set
// Categories: customer_lookup, product_search, quote_status,
//             email_draft, policy, cross_sell, general
// ============================================================

const EVAL_CASES = [
  // ============================================================
  // CUSTOMER LOOKUP (15 cases)
  // ============================================================
  {
    case_id: 'CUST-001',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Find customer John Smith',
    expected_answer: 'customer search results, contact info',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Basic name search'
  },
  {
    case_id: 'CUST-002',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Look up customer with phone 416-555-1234',
    expected_answer: 'customer details, phone match',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Phone number lookup'
  },
  {
    case_id: 'CUST-003',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Who is customer #42?',
    expected_answer: 'customer profile by ID',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'ID-based lookup'
  },
  {
    case_id: 'CUST-004',
    category: 'customer_lookup',
    difficulty: 'medium',
    prompt: 'Find the customer who ordered a Samsung refrigerator last month',
    expected_answer: 'customer with recent Samsung fridge order',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Purchase history search'
  },
  {
    case_id: 'CUST-005',
    category: 'customer_lookup',
    difficulty: 'medium',
    prompt: 'Show me VIP customers in Toronto',
    expected_answer: 'list of high-value customers in Toronto area',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Filtered customer list'
  },
  {
    case_id: 'CUST-006',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Customer email: jsmith@example.com',
    expected_answer: 'customer lookup by email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Email lookup'
  },
  {
    case_id: 'CUST-007',
    category: 'customer_lookup',
    difficulty: 'hard',
    prompt: 'Find customers who bought appliances over $2000 but have no pending quotes',
    expected_answer: 'filtered customer list with purchase and quote criteria',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Complex filter query'
  },
  {
    case_id: 'CUST-008',
    category: 'customer_lookup',
    difficulty: 'medium',
    prompt: 'Which customers are due for follow-up this week?',
    expected_answer: 'customers with pending follow-ups',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Task-based lookup'
  },
  {
    case_id: 'CUST-009',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Find Maria Garcia',
    expected_answer: 'customer search results',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Name search variant'
  },
  {
    case_id: 'CUST-010',
    category: 'customer_lookup',
    difficulty: 'medium',
    prompt: 'Show customer history for account 12345',
    expected_answer: 'customer transaction and interaction history',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'History request'
  },
  {
    case_id: 'CUST-011',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Look up 905-123-4567',
    expected_answer: 'customer by phone',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Phone only query'
  },
  {
    case_id: 'CUST-012',
    category: 'customer_lookup',
    difficulty: 'medium',
    prompt: 'Find customers with open complaints',
    expected_answer: 'customers with unresolved issues',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Status-based filter'
  },
  {
    case_id: 'CUST-013',
    category: 'customer_lookup',
    difficulty: 'hard',
    prompt: 'List our top 10 customers by lifetime value',
    expected_answer: 'ranked customer list by CLV',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Analytics query'
  },
  {
    case_id: 'CUST-014',
    category: 'customer_lookup',
    difficulty: 'medium',
    prompt: 'Find customer Robert Chen on Bloor Street',
    expected_answer: 'customer with name and address match',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Multi-field search'
  },
  {
    case_id: 'CUST-015',
    category: 'customer_lookup',
    difficulty: 'easy',
    prompt: 'Customer details for ID 789',
    expected_answer: 'customer profile',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Direct ID lookup'
  },

  // ============================================================
  // PRODUCT SEARCH (20 cases)
  // ============================================================
  {
    case_id: 'PROD-001',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'Show me Samsung refrigerators',
    expected_answer: 'Samsung fridge product listings',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Brand + category search'
  },
  {
    case_id: 'PROD-002',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'What washers do we have in stock?',
    expected_answer: 'available washer inventory',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Category + availability'
  },
  {
    case_id: 'PROD-003',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'Price for model WF45R6100AW',
    expected_answer: 'product price by model number',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Model number lookup'
  },
  {
    case_id: 'PROD-004',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Find dishwashers under $800',
    expected_answer: 'dishwashers filtered by price',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Price filter'
  },
  {
    case_id: 'PROD-005',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Compare LG and Samsung front-load washers',
    expected_answer: 'comparison of brand washers',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Product comparison'
  },
  {
    case_id: 'PROD-006',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'Do we have any GE ranges?',
    expected_answer: 'GE range inventory check',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Brand availability'
  },
  {
    case_id: 'PROD-007',
    category: 'product_search',
    difficulty: 'hard',
    prompt: 'What are our best-selling appliances this month?',
    expected_answer: 'top selling products list',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Sales analytics'
  },
  {
    case_id: 'PROD-008',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Show me stainless steel refrigerators with ice maker',
    expected_answer: 'filtered fridge results',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Feature filter'
  },
  {
    case_id: 'PROD-009',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'Specs for Whirlpool WRS325SDHZ',
    expected_answer: 'product specifications',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Spec lookup'
  },
  {
    case_id: 'PROD-010',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Find energy efficient dryers',
    expected_answer: 'Energy Star or efficient dryers',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Feature search'
  },
  {
    case_id: 'PROD-011',
    category: 'product_search',
    difficulty: 'hard',
    prompt: 'What products have the highest margin?',
    expected_answer: 'products sorted by profit margin',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Business analytics'
  },
  {
    case_id: 'PROD-012',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Show refrigerators between 20 and 25 cubic feet',
    expected_answer: 'fridges by capacity',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Size filter'
  },
  {
    case_id: 'PROD-013',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'List all Bosch products',
    expected_answer: 'Bosch product catalog',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Brand listing'
  },
  {
    case_id: 'PROD-014',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'What microwaves are on sale?',
    expected_answer: 'discounted microwaves',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Promo filter'
  },
  {
    case_id: 'PROD-015',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'Check stock for SKU APP-12345',
    expected_answer: 'inventory level for SKU',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'SKU lookup'
  },
  {
    case_id: 'PROD-016',
    category: 'product_search',
    difficulty: 'hard',
    prompt: 'Which products are frequently bought together with washer model XYZ?',
    expected_answer: 'bundle/attachment recommendations',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Association analysis'
  },
  {
    case_id: 'PROD-017',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Find black stainless kitchen appliance sets',
    expected_answer: 'matching appliance packages',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Package search'
  },
  {
    case_id: 'PROD-018',
    category: 'product_search',
    difficulty: 'easy',
    prompt: 'What is the warranty on Samsung fridges?',
    expected_answer: 'Samsung warranty info',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: true,
    source: 'manual',
    notes: 'Warranty lookup'
  },
  {
    case_id: 'PROD-019',
    category: 'product_search',
    difficulty: 'medium',
    prompt: 'Show me compact washers for small spaces',
    expected_answer: 'compact/apartment washers',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Use case search'
  },
  {
    case_id: 'PROD-020',
    category: 'product_search',
    difficulty: 'hard',
    prompt: 'What products have been discontinued but still have stock?',
    expected_answer: 'discontinued items with inventory',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Status + inventory query'
  },

  // ============================================================
  // QUOTE STATUS (10 cases)
  // ============================================================
  {
    case_id: 'QUOTE-001',
    category: 'quote_status',
    difficulty: 'easy',
    prompt: 'Status of quote Q-2024-001234',
    expected_answer: 'quote status and details',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Quote ID lookup'
  },
  {
    case_id: 'QUOTE-002',
    category: 'quote_status',
    difficulty: 'medium',
    prompt: 'Show quotes for customer #42',
    expected_answer: 'customer quote history',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Customer quotes'
  },
  {
    case_id: 'QUOTE-003',
    category: 'quote_status',
    difficulty: 'medium',
    prompt: 'What quotes are expiring this week?',
    expected_answer: 'quotes with upcoming expiry',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Expiry filter'
  },
  {
    case_id: 'QUOTE-004',
    category: 'quote_status',
    difficulty: 'easy',
    prompt: 'Find quote for John Smith',
    expected_answer: 'quotes matching customer name',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Quote by customer name'
  },
  {
    case_id: 'QUOTE-005',
    category: 'quote_status',
    difficulty: 'hard',
    prompt: 'Show me all pending quotes over $5000 from last month',
    expected_answer: 'filtered high-value pending quotes',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Complex filter'
  },
  {
    case_id: 'QUOTE-006',
    category: 'quote_status',
    difficulty: 'medium',
    prompt: 'What is the total value of open quotes?',
    expected_answer: 'aggregate quote value',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Analytics query'
  },
  {
    case_id: 'QUOTE-007',
    category: 'quote_status',
    difficulty: 'easy',
    prompt: 'Has quote Q-2024-005678 been accepted?',
    expected_answer: 'quote acceptance status',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Status check'
  },
  {
    case_id: 'QUOTE-008',
    category: 'quote_status',
    difficulty: 'medium',
    prompt: 'Show quotes I created today',
    expected_answer: 'user quotes from today',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'User + date filter'
  },
  {
    case_id: 'QUOTE-009',
    category: 'quote_status',
    difficulty: 'hard',
    prompt: 'What is our quote conversion rate this month?',
    expected_answer: 'quote to order conversion metrics',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Conversion analytics'
  },
  {
    case_id: 'QUOTE-010',
    category: 'quote_status',
    difficulty: 'medium',
    prompt: 'Find quotes that need manager approval',
    expected_answer: 'quotes pending approval',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Approval workflow'
  },

  // ============================================================
  // EMAIL DRAFT (10 cases)
  // ============================================================
  {
    case_id: 'EMAIL-001',
    category: 'email_draft',
    difficulty: 'medium',
    prompt: 'Draft a follow-up email for customer John Smith about his pending quote',
    expected_answer: 'professional follow-up email draft',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Quote follow-up'
  },
  {
    case_id: 'EMAIL-002',
    category: 'email_draft',
    difficulty: 'medium',
    prompt: 'Write an email to customer #123 about their delivery tomorrow',
    expected_answer: 'delivery reminder email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Delivery notification'
  },
  {
    case_id: 'EMAIL-003',
    category: 'email_draft',
    difficulty: 'hard',
    prompt: 'Compose an apology email for the delayed delivery to Maria Garcia',
    expected_answer: 'apologetic, professional email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Complaint resolution'
  },
  {
    case_id: 'EMAIL-004',
    category: 'email_draft',
    difficulty: 'medium',
    prompt: 'Send quote Q-2024-001234 to the customer via email',
    expected_answer: 'quote delivery email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Quote email'
  },
  {
    case_id: 'EMAIL-005',
    category: 'email_draft',
    difficulty: 'easy',
    prompt: 'Write a thank you email after purchase for customer #456',
    expected_answer: 'post-purchase thank you email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Thank you email'
  },
  {
    case_id: 'EMAIL-006',
    category: 'email_draft',
    difficulty: 'hard',
    prompt: 'Draft an email explaining our return policy to an unhappy customer',
    expected_answer: 'policy explanation email with empathy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Policy communication'
  },
  {
    case_id: 'EMAIL-007',
    category: 'email_draft',
    difficulty: 'medium',
    prompt: 'Create an email to notify customer about product back in stock',
    expected_answer: 'back in stock notification',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Stock notification'
  },
  {
    case_id: 'EMAIL-008',
    category: 'email_draft',
    difficulty: 'medium',
    prompt: 'Write email to schedule installation for customer Chen',
    expected_answer: 'installation scheduling email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Service scheduling'
  },
  {
    case_id: 'EMAIL-009',
    category: 'email_draft',
    difficulty: 'hard',
    prompt: 'Draft a win-back email for customer who has not purchased in 6 months',
    expected_answer: 're-engagement email with offer',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Win-back campaign'
  },
  {
    case_id: 'EMAIL-010',
    category: 'email_draft',
    difficulty: 'medium',
    prompt: 'Compose an email offering extended warranty to recent buyer',
    expected_answer: 'warranty upsell email',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Warranty upsell'
  },

  // ============================================================
  // POLICY (15 cases)
  // ============================================================
  {
    case_id: 'POLICY-001',
    category: 'policy',
    difficulty: 'easy',
    prompt: 'What is our return policy?',
    expected_answer: 'return policy details',
    expected_policy_reference: 'return_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Basic policy query'
  },
  {
    case_id: 'POLICY-002',
    category: 'policy',
    difficulty: 'easy',
    prompt: 'How long is the warranty on appliances?',
    expected_answer: 'warranty duration info',
    expected_policy_reference: 'warranty_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Warranty query'
  },
  {
    case_id: 'POLICY-003',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'Can a customer return an opened appliance?',
    expected_answer: 'opened item return policy',
    expected_policy_reference: 'return_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Policy edge case'
  },
  {
    case_id: 'POLICY-004',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'What discounts can I offer a customer?',
    expected_answer: 'discount authorization levels',
    expected_policy_reference: 'pricing_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Pricing policy'
  },
  {
    case_id: 'POLICY-005',
    category: 'policy',
    difficulty: 'easy',
    prompt: 'Do we offer price matching?',
    expected_answer: 'price match policy',
    expected_policy_reference: 'price_match_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Price match query'
  },
  {
    case_id: 'POLICY-006',
    category: 'policy',
    difficulty: 'hard',
    prompt: 'Customer wants to return a fridge after 45 days, what are the options?',
    expected_answer: 'late return handling options',
    expected_policy_reference: 'return_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Policy exception'
  },
  {
    case_id: 'POLICY-007',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'What is included in our delivery service?',
    expected_answer: 'delivery service details',
    expected_policy_reference: 'delivery_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Delivery policy'
  },
  {
    case_id: 'POLICY-008',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'How do we handle damaged deliveries?',
    expected_answer: 'damage claim process',
    expected_policy_reference: 'delivery_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Damage policy'
  },
  {
    case_id: 'POLICY-009',
    category: 'policy',
    difficulty: 'easy',
    prompt: 'What payment methods do we accept?',
    expected_answer: 'accepted payment types',
    expected_policy_reference: 'payment_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Payment policy'
  },
  {
    case_id: 'POLICY-010',
    category: 'policy',
    difficulty: 'hard',
    prompt: 'Customer claims product was defective on arrival, what is the process?',
    expected_answer: 'DOA claim process',
    expected_policy_reference: 'warranty_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'DOA handling'
  },
  {
    case_id: 'POLICY-011',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'Do we offer financing options?',
    expected_answer: 'financing program details',
    expected_policy_reference: 'financing_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Financing query'
  },
  {
    case_id: 'POLICY-012',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'What is our installation policy?',
    expected_answer: 'installation service terms',
    expected_policy_reference: 'installation_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Installation policy'
  },
  {
    case_id: 'POLICY-013',
    category: 'policy',
    difficulty: 'hard',
    prompt: 'How do I escalate a customer complaint?',
    expected_answer: 'escalation procedure',
    expected_policy_reference: 'escalation_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Escalation process'
  },
  {
    case_id: 'POLICY-014',
    category: 'policy',
    difficulty: 'easy',
    prompt: 'What are our store hours?',
    expected_answer: 'business hours',
    expected_policy_reference: 'store_info',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Store info'
  },
  {
    case_id: 'POLICY-015',
    category: 'policy',
    difficulty: 'medium',
    prompt: 'Can we offer free delivery for orders over $1000?',
    expected_answer: 'free delivery threshold policy',
    expected_policy_reference: 'delivery_policy',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Delivery threshold'
  },

  // ============================================================
  // CROSS-SELL (10 cases)
  // ============================================================
  {
    case_id: 'CROSS-001',
    category: 'cross_sell',
    difficulty: 'medium',
    prompt: 'What accessories go with this washer?',
    expected_answer: 'washer accessories/add-ons',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Accessory recommendation'
  },
  {
    case_id: 'CROSS-002',
    category: 'cross_sell',
    difficulty: 'medium',
    prompt: 'Suggest add-ons for customer #42s cart',
    expected_answer: 'personalized add-on suggestions',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Cart upsell'
  },
  {
    case_id: 'CROSS-003',
    category: 'cross_sell',
    difficulty: 'medium',
    prompt: 'What goes well with a French door refrigerator?',
    expected_answer: 'complementary products',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Complement suggestion'
  },
  {
    case_id: 'CROSS-004',
    category: 'cross_sell',
    difficulty: 'hard',
    prompt: 'Based on this customers history, what should I recommend?',
    expected_answer: 'personalized recommendations',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'History-based rec'
  },
  {
    case_id: 'CROSS-005',
    category: 'cross_sell',
    difficulty: 'easy',
    prompt: 'Do we have matching dryers for this washer?',
    expected_answer: 'matching pair products',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Pair matching'
  },
  {
    case_id: 'CROSS-006',
    category: 'cross_sell',
    difficulty: 'medium',
    prompt: 'What extended warranty options can I offer?',
    expected_answer: 'warranty upsell options',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Warranty upsell'
  },
  {
    case_id: 'CROSS-007',
    category: 'cross_sell',
    difficulty: 'hard',
    prompt: 'Customer is buying a kitchen set, what else might they need?',
    expected_answer: 'kitchen accessory recommendations',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Bundle expansion'
  },
  {
    case_id: 'CROSS-008',
    category: 'cross_sell',
    difficulty: 'medium',
    prompt: 'Recommend installation services for this purchase',
    expected_answer: 'installation service options',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Service upsell'
  },
  {
    case_id: 'CROSS-009',
    category: 'cross_sell',
    difficulty: 'medium',
    prompt: 'What water filters work with Samsung fridges?',
    expected_answer: 'compatible filter products',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Consumable rec'
  },
  {
    case_id: 'CROSS-010',
    category: 'cross_sell',
    difficulty: 'hard',
    prompt: 'Create a complete laundry room package for this customer',
    expected_answer: 'full package recommendation',
    has_answer_check: true,
    has_product_check: true,
    has_policy_check: false,
    source: 'manual',
    notes: 'Package builder'
  },

  // ============================================================
  // GENERAL (10 cases)
  // ============================================================
  {
    case_id: 'GEN-001',
    category: 'general',
    difficulty: 'easy',
    prompt: 'Hello',
    expected_answer: 'greeting response',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Greeting handling'
  },
  {
    case_id: 'GEN-002',
    category: 'general',
    difficulty: 'easy',
    prompt: 'What can you help me with?',
    expected_answer: 'capability explanation',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Capability query'
  },
  {
    case_id: 'GEN-003',
    category: 'general',
    difficulty: 'medium',
    prompt: 'I need to help a frustrated customer',
    expected_answer: 'customer handling guidance',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Soft skills query'
  },
  {
    case_id: 'GEN-004',
    category: 'general',
    difficulty: 'hard',
    prompt: 'Summarize my sales performance this week',
    expected_answer: 'sales summary',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Performance query'
  },
  {
    case_id: 'GEN-005',
    category: 'general',
    difficulty: 'easy',
    prompt: 'Thanks for the help',
    expected_answer: 'polite closing',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Thank you handling'
  },
  {
    case_id: 'GEN-006',
    category: 'general',
    difficulty: 'medium',
    prompt: 'What should I do first thing when a customer walks in?',
    expected_answer: 'customer greeting best practices',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Best practices'
  },
  {
    case_id: 'GEN-007',
    category: 'general',
    difficulty: 'hard',
    prompt: 'How do I handle a price objection?',
    expected_answer: 'sales objection handling tips',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: true,
    source: 'manual',
    notes: 'Sales training'
  },
  {
    case_id: 'GEN-008',
    category: 'general',
    difficulty: 'easy',
    prompt: 'Who do I contact for IT support?',
    expected_answer: 'IT contact info',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Internal support'
  },
  {
    case_id: 'GEN-009',
    category: 'general',
    difficulty: 'medium',
    prompt: 'What are the most common customer questions?',
    expected_answer: 'FAQ summary',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'FAQ query'
  },
  {
    case_id: 'GEN-010',
    category: 'general',
    difficulty: 'hard',
    prompt: 'Generate a report of todays activities',
    expected_answer: 'activity report',
    has_answer_check: true,
    has_product_check: false,
    has_policy_check: false,
    source: 'manual',
    notes: 'Report generation'
  }
];

async function seedEvalCases() {
  console.log('🌱 Seeding AI Evaluation Cases...\n');

  try {
    // Check if cases already exist
    const existingCount = await db.query('SELECT COUNT(*) FROM ai_eval_cases');
    if (parseInt(existingCount.rows[0].count) > 0) {
      console.log(`⚠️  Found ${existingCount.rows[0].count} existing cases.`);
      console.log('   Use --force to replace existing cases.\n');

      if (!process.argv.includes('--force')) {
        process.exit(0);
      }

      console.log('   --force flag detected. Clearing existing cases...');
      await db.query('DELETE FROM ai_eval_results');
      await db.query('DELETE FROM ai_eval_cases');
    }

    // Insert cases
    let inserted = 0;
    for (const evalCase of EVAL_CASES) {
      await db.query(
        `INSERT INTO ai_eval_cases
         (case_id, category, difficulty, prompt, expected_answer, expected_product_ids,
          expected_policy_reference, has_answer_check, has_product_check, has_policy_check,
          source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          evalCase.case_id,
          evalCase.category,
          evalCase.difficulty,
          evalCase.prompt,
          evalCase.expected_answer,
          evalCase.expected_product_ids || null,
          evalCase.expected_policy_reference || null,
          evalCase.has_answer_check,
          evalCase.has_product_check,
          evalCase.has_policy_check,
          evalCase.source,
          evalCase.notes
        ]
      );
      inserted++;
    }

    // Print summary
    const summary = await db.query(`
      SELECT category, COUNT(*) as count
      FROM ai_eval_cases
      GROUP BY category
      ORDER BY category
    `);

    console.log('\n✅ Seeding complete!\n');
    console.log('📊 Cases by category:');
    console.log('─'.repeat(35));
    for (const row of summary.rows) {
      console.log(`   ${row.category.padEnd(20)} ${row.count}`);
    }
    console.log('─'.repeat(35));
    console.log(`   ${'TOTAL'.padEnd(20)} ${inserted}`);
    console.log();

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedEvalCases();
