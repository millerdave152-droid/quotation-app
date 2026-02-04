# AI Assistant Pilot Gates & Phase 2 Roadmap

**Document Version:** 1.0
**Last Updated:** [Insert Date]

---

## 1. Pilot Success Criteria

The following metrics must be achieved during the 4-week pilot to proceed to Phase 2.

### 1.1 Go/No-Go Metrics

| Metric | Target | Minimum | Measurement |
|--------|--------|---------|-------------|
| **Accuracy Rate** | >= 85% | >= 75% | Weekly golden set evaluation |
| **User Satisfaction** | >= 80% helpful | >= 70% | Feedback ratings (helpful/not helpful) |
| **Error Rate** | < 2% | < 5% | Failed API requests / total requests |
| **p95 Latency** | < 3,000ms | < 5,000ms | Response time percentile |
| **Adoption Rate** | >= 50% of users | >= 30% | Active users / total pilot users |
| **Cost per Query** | < $0.05 | < $0.10 | Total API cost / total queries |

### 1.2 Qualitative Criteria

- [ ] No critical security incidents reported
- [ ] No significant data accuracy issues affecting business decisions
- [ ] Positive feedback from majority of pilot users
- [ ] No unresolved escalations at pilot end
- [ ] Kill switch successfully tested and documented

---

## 2. Pilot Review Checklist

Complete this checklist at the end of the pilot period.

### 2.1 Metrics Review

| Item | Status | Notes |
|------|--------|-------|
| Run final accuracy evaluation | [ ] | `node scripts/run-ai-eval.js` |
| Export analytics dashboard | [ ] | `/api/ai/analytics/pilot` |
| Calculate total pilot cost | [ ] | Sum of `estimated_cost_usd` |
| Review error logs | [ ] | `/api/ai/analytics/errors` |
| Compile user feedback summary | [ ] | `/api/ai/analytics/feedback` |
| Document latency percentiles | [ ] | `/api/ai/analytics/latency` |

### 2.2 Operational Review

| Item | Status | Notes |
|------|--------|-------|
| Kill switch tested and working | [ ] | POST `/api/ai/admin/kill-switch` |
| Rollback procedure documented | [ ] | See Section 4 |
| On-call escalation path defined | [ ] | |
| Monitoring alerts configured | [ ] | Error rate, latency thresholds |
| Backup/recovery tested | [ ] | Database, configuration |

### 2.3 Stakeholder Sign-Off

| Stakeholder | Approved | Date | Notes |
|-------------|----------|------|-------|
| Product Owner | [ ] | | |
| Engineering Lead | [ ] | | |
| Operations/IT | [ ] | | |
| Security/Compliance | [ ] | | |

---

## 3. Phase 2 Feature Gating

Phase 2 features are **blocked** until pilot gates are passed.

### 3.1 Phase 2 Feature Candidates

| Feature | Prerequisite | Risk Level |
|---------|--------------|------------|
| Streaming responses | Pilot success | Low |
| Semantic search (embeddings) | Pilot success + accuracy > 85% | Medium |
| Automated email sending | Pilot success + manual review | High |
| Quote auto-generation | Pilot success + approval workflow | High |
| Multi-location support | Pilot success | Medium |
| External CRM integration | Phase 2a complete | High |

### 3.2 Phase 2 Unlock Checklist

Before enabling ANY Phase 2 feature:

- [ ] **Pilot Success**: All go/no-go metrics achieved (Section 1.1)
- [ ] **Kill Switch Ready**: Verified working, documented procedure
- [ ] **Rollback Plan**: Documented and tested (Section 4)
- [ ] **Monitoring Active**: Alerts for error rate and latency
- [ ] **Stakeholder Approval**: Sign-off from all stakeholders (Section 2.3)
- [ ] **Updated SLA**: SLA reviewed and updated if needed
- [ ] **User Communication**: Pilot users notified of changes

### 3.3 High-Risk Feature Requirements

Features marked "High Risk" require additional gates:

- [ ] Security review completed
- [ ] Data privacy impact assessment
- [ ] Manager approval workflow implemented
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] Separate kill switch for feature

---

## 4. Kill Switch & Rollback Procedures

### 4.1 Kill Switch Activation

**When to activate:**
- Error rate exceeds 10% for > 5 minutes
- Critical security incident detected
- Data accuracy issue affecting customers
- Stakeholder request

**How to activate:**
```bash
# Immediate shutdown (admin only)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Describe reason here"}' \
  https://api.example.com/api/ai/admin/kill-switch
```

**Verification:**
```bash
# Confirm disabled
curl https://api.example.com/api/ai/health
# Should show: "aiEnabled": false
```

### 4.2 Rollback Procedure

**Level 1: Disable AI (no deployment)**
1. Activate kill switch (Section 4.1)
2. Notify users via in-app message
3. Monitor for 15 minutes
4. Investigate root cause

**Level 2: Revert to Previous Version**
1. Activate kill switch
2. Deploy previous backend version: `git revert HEAD && npm run deploy`
3. Run database rollback if needed: `npm run migrate:rollback`
4. Verify health endpoint
5. Re-enable AI: POST `/api/ai/admin/toggle` with `{"enabled": true}`

**Level 3: Full Feature Removal**
1. Activate kill switch
2. Remove AI routes from server.js
3. Deploy without AI features
4. Communicate to stakeholders
5. Schedule post-mortem

### 4.3 Post-Incident Requirements

After any kill switch activation:

- [ ] Incident documented within 24 hours
- [ ] Root cause identified
- [ ] Fix implemented and tested
- [ ] Stakeholder notification sent
- [ ] Post-mortem scheduled (if Level 2+)

---

## 5. Decision Log

Record all go/no-go decisions here.

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| | | | |
| | | | |
| | | | |

---

## 6. Appendix: Quick Reference

### Metrics Endpoints
```
GET /api/ai/analytics/pilot      # Dashboard summary
GET /api/ai/analytics/realtime   # Last hour + today
GET /api/ai/analytics/feedback   # Feedback breakdown
GET /api/ai/analytics/latency    # Latency percentiles
GET /api/ai/analytics/errors     # Recent errors
```

### Admin Endpoints
```
GET  /api/ai/admin/status        # Feature flag status
POST /api/ai/admin/toggle        # Enable/disable
POST /api/ai/admin/kill-switch   # Emergency shutoff
POST /api/ai/admin/clear-override # Clear runtime override
```

### Evaluation Script
```bash
cd backend
node scripts/run-ai-eval.js              # Full evaluation
node scripts/run-ai-eval.js --verbose    # Detailed output
node scripts/run-ai-eval.js --category policy  # Single category
```

---

*This document should be reviewed and updated at the end of each pilot/phase cycle.*
