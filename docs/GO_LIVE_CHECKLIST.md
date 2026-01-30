# Go-Live Checklist & User Guide

## Week 4.5 - Quotation System Deployment

---

## Pre-Launch Checklist

### Database & Backend

- [ ] Run CLV storage migration: `node backend/migrations/add-clv-storage.js`
- [ ] Run email jobs migration: `node backend/migrations/add-email-jobs.js`
- [ ] Verify database indexes exist (36 indexes on quotations table)
- [ ] Confirm RDS automated backups enabled (7-day retention)
- [ ] Verify environment variables are set:
  - `JWT_SECRET` - Secure secret for tokens
  - `JWT_ACCESS_EXPIRY` - Default: 30 minutes
  - `JWT_REFRESH_EXPIRY` - Default: 7 days
  - `DB_POOL_MAX` - Default: 20
  - `CLV_PLATINUM_THRESHOLD` - Default: 50000
  - `CLV_GOLD_THRESHOLD` - Default: 20000
  - `CLV_SILVER_THRESHOLD` - Default: 5000

### Jobs & Schedulers

- [ ] CLV Calculation Job running (2 AM daily)
- [ ] Email queue processor active
- [ ] Notification scheduler configured

### Security

- [ ] JWT access token expiry: 30 minutes (verified)
- [ ] Rate limiting: 50 requests/15 min on auth routes
- [ ] CORS whitelist configured
- [ ] Helmet security headers enabled

---

## User Acceptance Test Plan

### Test Scenario (Each of 8 users completes 2-3 quotes)

#### Quote Creation Flow

1. **Create Draft Quote**
   - Navigate to Quote Builder
   - Add customer (new or existing)
   - Add 3-5 products
   - Apply discount (test both < 15% and > 15%)
   - Save as draft

2. **Submit for Approval (if triggered)**
   - Verify approval required when:
     - Discount > 15%
     - Total > $10,000
     - Margin < user's threshold
   - Request approval
   - Verify notification sent to manager

3. **Manager Approval**
   - Manager receives notification
   - Manager opens approval queue
   - Manager approves/rejects with reason
   - Verify status updates correctly

4. **Send Quote to Customer**
   - Generate PDF preview
   - Verify PDF contains all items, prices, terms
   - Send email to customer
   - Verify email delivered (check email jobs)
   - Verify status changes to SENT

5. **Close Quote**
   - Mark as WON or LOST
   - Verify timestamps recorded
   - Verify CLV updates on customer profile

### Validation Checks

| Step | Expected Result | Pass/Fail |
|------|-----------------|-----------|
| Create quote | Quote saved, number generated | |
| Add products | Products appear with pricing | |
| Apply discount | Approval triggered if > 15% | |
| Manager approve | Status changes to APPROVED | |
| Send quote | PDF generated, email sent | |
| Mark WON | won_at timestamp set | |
| View customer | CLV and churn risk visible | |

---

## Quick Reference Guide

### Quote Statuses

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| DRAFT | In progress, not submitted | Edit, Delete, Submit |
| PENDING_APPROVAL | Waiting for manager | Cancel, View |
| APPROVED | Ready to send | Edit, Send, Clone |
| REJECTED | Declined by manager | Edit, Resubmit |
| SENT | Delivered to customer | Track, Follow-up |
| WON | Customer accepted | Clone, Invoice |
| LOST | Customer declined | Clone, Archive |
| EXPIRED | Past expiry date | Clone, Archive |

### Approval Thresholds

| Rule | Threshold | Requires |
|------|-----------|----------|
| Discount | > 15% | Manager approval |
| Total Value | > $10,000 | Manager approval |
| Margin | < User's threshold | Manager approval |

### Customer Segments (CLV)

| Segment | Lifetime Value | Color |
|---------|----------------|-------|
| Platinum | $50,000+ | Purple |
| Gold | $20,000 - $49,999 | Gold |
| Silver | $5,000 - $19,999 | Silver |
| Bronze | < $5,000 | Bronze |

### Churn Risk Levels

| Risk | Indicators | Action |
|------|------------|--------|
| High | No activity 90+ days, declining trend | Immediate outreach |
| Medium | No activity 30-90 days | Schedule follow-up |
| Low | Regular activity | Maintain relationship |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | New Quote |
| `Ctrl + S` | Save Draft |
| `Ctrl + P` | Preview PDF |
| `Escape` | Close Modal |

---

## Common Issues & Solutions

### Issue: Quote not sending email

1. Check email jobs queue: `GET /api/admin/email-jobs?status=failed`
2. Verify SMTP settings in environment
3. Check customer email is valid
4. Retry failed job: `POST /api/admin/email-jobs/:id/retry`

### Issue: PDF generation fails

1. Check PdfService error codes:
   - `PDF_DATA_ERROR` - Invalid quote data
   - `PDF_GENERATION_ERROR` - Template issue
   - `PDF_TEMPLATE_ERROR` - Missing template
2. Verify quote has required fields (customer, items)

### Issue: Approval not triggered

1. Verify user has approval thresholds set
2. Check discount percentage calculation
3. Verify ApprovalRulesService is loaded

### Issue: CLV not showing

1. Check if CLV calculation job ran
2. Manual trigger: `POST /api/customers/:id/recalculate-clv`
3. Verify customer has quote history

---

## Support Contacts

- Technical Issues: [dev-team@company.com]
- User Training: [training@company.com]
- Emergency: [on-call@company.com]

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Week 4 | Initial go-live |

---

*Last updated: Sprint Week 4*
