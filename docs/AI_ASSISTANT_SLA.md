# AI Assistant Service Level Agreement

**Document Version:** 1.0
**Effective Date:** [Insert Date]
**Pilot Period:** 4 Weeks

---

## 1. Overview

This addendum defines the service level targets for the AI-Powered Customer Support Assistant ("AI Assistant") deployed as part of the TeleTime Solutions QuotationApp platform. This document applies during the pilot evaluation period and establishes expectations for performance, availability, and limitations.

**Important:** The AI Assistant is provided on a "best effort" basis during the pilot period. The targets defined herein are goals, not guarantees, and are subject to refinement based on pilot learnings.

---

## 2. Service Level Targets

### 2.1 Availability Target

| Metric | Target | Measurement |
|--------|--------|-------------|
| Service Availability | 99.0% | Monthly uptime during business hours (Mon-Fri, 8 AM - 8 PM ET) |

**Caveats:**
- Excludes scheduled maintenance windows (communicated 24 hours in advance)
- Excludes third-party API outages (Anthropic Claude API)
- Excludes force majeure events
- Availability is measured at the API endpoint level, not individual request success

### 2.2 Response Time Targets

| Metric | Target | Conditions |
|--------|--------|------------|
| p95 Response Time | < 3,000 ms | Standard queries under normal load |
| p99 Response Time | < 5,000 ms | Complex queries or peak periods |

**Caveats:**
- Response times measured from API request receipt to response delivery
- Excludes network latency between client and server
- Complex queries (email drafting, multi-step reasoning) may exceed targets
- Targets assume system operating within capacity limits

### 2.3 Accuracy Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Answer Relevance | 85% | Response addresses the user's query |
| Information Accuracy | Best Effort | Factual correctness of retrieved data |
| Policy Compliance | Best Effort | Alignment with company policies |

**Important Limitations:**
- Accuracy targets are **aspirational goals**, not guarantees
- AI responses should be verified by staff for critical decisions
- The AI Assistant is a **support tool**, not a replacement for human judgment
- Accuracy is measured via periodic evaluation against a golden test set

---

## 3. Pilot Period Limitations

During the 4-week pilot period, the following limitations apply:

### 3.1 Scope Limitations
- AI Assistant is available to authorized pilot users only
- Feature set is limited to: customer lookup, product search, quote status, email drafting, and policy Q&A
- Advanced features (automated actions, external integrations) are not included

### 3.2 Capacity Limitations
- Maximum concurrent users: 10
- Maximum requests per user per hour: 50
- System may be throttled during unexpected load spikes

### 3.3 Data Limitations
- AI responses are based on data available at query time
- Real-time inventory and pricing accuracy depends on source system sync frequency
- Historical data queries limited to 12 months

---

## 4. Exclusions and Disclaimers

### 4.1 No Warranty
The AI Assistant is provided "AS IS" during the pilot period. TeleTime Solutions makes no warranties, express or implied, regarding:
- Accuracy or completeness of AI-generated responses
- Fitness for any particular purpose
- Uninterrupted or error-free operation

### 4.2 Limitation of Liability
- AI responses are advisory and require human verification for consequential decisions
- The organization assumes no liability for decisions made based solely on AI output
- Users are responsible for validating information before acting on it

### 4.3 Not Covered
This SLA does not apply to:
- Issues caused by user error or misuse
- Unsupported browsers or client configurations
- Custom integrations or modifications
- Test or development environments

---

## 5. Opt-Out and Advanced Features

### 5.1 Pilot Opt-Out
Users may opt out of the AI Assistant pilot at any time by:
- Contacting their system administrator
- Using the "Disable AI Assistant" option in user preferences (if available)

Opting out will disable AI features without affecting other QuotationApp functionality.

### 5.2 Advanced Features (Future)
The following features are **not included** in the current pilot and will require separate evaluation:
- Automated quote generation
- Direct customer communication (email sending)
- Inventory reservations or modifications
- Payment processing assistance
- External CRM/ERP integrations

Enabling advanced features will require:
- Successful completion of pilot evaluation
- Updated risk assessment and approval
- Separate SLA addendum (if applicable)

---

## 6. Support and Escalation

### 6.1 Support Channels
- **Primary:** In-app feedback button (thumbs up/down)
- **Issues:** Report via internal IT helpdesk
- **Urgent:** Contact system administrator directly

### 6.2 Response Times for Issues
| Severity | Description | Target Response |
|----------|-------------|-----------------|
| Critical | Service completely unavailable | 1 hour |
| High | Major feature degraded | 4 hours |
| Medium | Minor feature issues | 1 business day |
| Low | Enhancement requests | Pilot review cycle |

---

## 7. Review and Amendments

This SLA will be reviewed at the conclusion of the pilot period. Amendments may be made based on:
- Pilot performance data and user feedback
- Technical learnings and capacity planning
- Business requirements and risk assessment

**Contact:** [Insert contact email for SLA inquiries]

---

*This document is for internal use during the AI Assistant pilot program. It does not constitute a legally binding contract unless explicitly incorporated into a formal agreement.*
