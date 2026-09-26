# Escalation Procedures — Multi-Tenant Integration Cutover

## Overview

This document defines the escalation contacts, decision criteria, and response protocols for the Multi-Tenant Integration Cutover. These procedures apply during:
- Phase 1: Route Handler Migration
- Phase 2: RLS Activation
- Phase 3: Validation & Performance Testing
- Post-Cutover Monitoring Period (30 days)

**Document Version:** 1.0  
**Last Updated:** <!-- Auto-update on cutover start -->  
**Owner:** Engineering Lead  

---

## Escalation Contact List

### Primary Contacts (By Role)

| Role | Responsibility | Escalation Trigger | Response Time SLA |
|------|----------------|-------------------|-------------------|
| **Primary On-Call Engineer** | First responder for all incidents | Any alert or anomaly detected | < 5 minutes |
| **Engineering Lead** | Technical decision authority | P1/P2 incidents, rollback decisions | < 15 minutes |
| **Security Lead** | Security incident assessment | Cross-tenant access, auth failures | < 15 minutes |
| **Database Administrator (DBA)** | RLS/database issues | RLS policy failures, migration issues | < 15 minutes |
| **QA Lead** | Test failure investigation | E2E test failures, regression detection | < 30 minutes |
| **Platform Operations Manager** | Business impact assessment | P1 incidents affecting users | < 30 minutes |
| **Product Owner** | Business decision authority | Feature rollback, user communication | < 1 hour |

### Escalation Hierarchy

```
Level 1: Primary On-Call Engineer
    ↓ (if P2+ or unresolved in 15 min)
Level 2: Engineering Lead + Relevant Domain Lead (Security/DBA)
    ↓ (if P1 or unresolved in 30 min)
Level 3: Platform Operations Manager + Product Owner
    ↓ (if critical business impact)
Level 4: Executive Stakeholders (VP Engineering / CTO)
```

---

## Severity Levels

### P1 — Critical (Service Down / Data Breach Risk)

**Definition:** Complete service outage, cross-tenant data exposure, or security breach.

**Examples:**
- Cross-tenant data access detected (RLS bypass)
- Authentication system completely failing
- Database connection pool exhausted
- All API routes returning 500 errors

**Response Time:** 
- Acknowledge: < 5 minutes
- Engage: < 15 minutes
- Resolution/Rollback: < 1 hour

**Actions:**
1. Immediately engage Engineering Lead + Security Lead
2. Initiate emergency rollback procedure
3. Isolate affected systems if data breach suspected
4. Begin incident bridge call
5. Notify affected stakeholders within 30 minutes

---

### P2 — High (Significant Degradation / Security Concern)

**Definition:** Major functionality impaired, elevated security risk, or significant user impact.

**Examples:**
- Error rate > 5% on critical paths
- Authorization latency > 500ms p95
- Safety-critical routes (emergency/panic) failing
- Shadow mode mismatch rate > 1%
- RLS policies blocking legitimate access

**Response Time:**
- Acknowledge: < 15 minutes
- Engage: < 30 minutes
- Resolution/Rollback: < 4 hours

**Actions:**
1. Primary on-call assesses and engages relevant leads
2. Determine if rollback is needed
3. Implement mitigation or partial rollback
4. Root cause analysis within 24 hours

---

### P3 — Medium (Moderate Impact / Non-Critical Failures)

**Definition:** Non-critical functionality affected, performance degradation within acceptable limits.

**Examples:**
- Error rate 1-5% on non-critical paths
- Authorization latency 200-500ms p95
- Shadow mode mismatch rate 0.1-1%
- Non-safety route permission denials above baseline

**Response Time:**
- Acknowledge: < 1 hour
- Engage: < 4 hours
- Resolution: < 24 hours

**Actions:**
1. On-call monitors and investigates
2. Create incident ticket
3. Fix in next deployment window if non-urgent

---

### P4 — Low (Minor Issues / Monitoring Alerts)

**Definition:** Minor issues with no significant user impact.

**Examples:**
- Single route intermittent errors
- Performance slightly above target (< 20% over SLA)
- Documentation discrepancies discovered

**Response Time:**
- Acknowledge: < 4 hours
- Resolution: < 1 week

**Actions:**
1. Log issue for tracking
2. Address in regular sprint work

---

## Rollback Decision Criteria

### Automatic Rollback Triggers (No Human Decision Required)

The system MUST automatically rollback or halt when:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| RLS migration partial failure | Any failure | Halt + Alert + Manual intervention |
| Cross-tenant access detected | 1 occurrence | Immediate RLS disable + P1 escalation |
| Auth system complete failure | 100% error rate > 1 minute | Disable cutover flags |
| Database connection exhaustion | Pool at 95% > 5 minutes | Circuit breaker activation |

---

### Human Decision Required Rollback Criteria

Engineering Lead MUST be engaged for rollback decision when:

#### Error Rate Thresholds

| Metric | Warning | Rollback Threshold | Measurement Window |
|--------|---------|-------------------|-------------------|
| **Overall API Error Rate** | > 2% | > 5% | 5-minute rolling |
| **Auth Endpoint Error Rate** | > 1% | > 3% | 5-minute rolling |
| **Safety-Critical Route Errors** | > 0.5% | > 1% | 5-minute rolling |
| **Permission Denial Rate (above baseline)** | > 2x baseline | > 5x baseline | 15-minute rolling |

#### Latency Thresholds

| Metric | Target | Warning | Rollback Threshold |
|--------|--------|---------|-------------------|
| **AuthorizationContextResolver p99** | < 100ms | > 150ms | > 500ms |
| **Permission Check p99** | < 10ms | > 20ms | > 100ms |
| **RLS Query Overhead** | < 20% | > 30% | > 50% |
| **End-to-End Auth Flow p95** | < 200ms | > 400ms | > 1000ms |

#### Auth Failure Pattern Thresholds

| Pattern | Warning | Rollback Threshold | Notes |
|---------|---------|-------------------|-------|
| **AUTH_TOKEN_INVALID spike** | > 2x baseline | > 5x baseline | May indicate JWT validation issue |
| **AUTH_NO_MEMBERSHIP spike** | > 3x baseline | > 10x baseline | May indicate resolver bug |
| **AUTH_MEMBERSHIP_INACTIVE unexpected** | > 1% active users | > 5% active users | May indicate migration data issue |
| **Token version mismatch rate** | > 0.5% | > 2% | May indicate cache sync issue |

#### Shadow Mode Specific Criteria

| Metric | Cutover Blocked | Cutover Rollback |
|--------|-----------------|------------------|
| **Mismatch Rate** | ≥ 0.1% | > 1% after cutover |
| **False Negative Rate** (new denies, legacy allows) | > 0.05% | > 0.5% |
| **False Positive Rate** (new allows, legacy denies) | > 0.1% | > 0.5% |

---

### Phase-Specific Rollback Criteria

#### Phase 1: Route Handler Migration

**Rollback from new to legacy authorization when:**
- Per-route error rate > 5% after flag switch
- Permission denial rate 5x above baseline for migrated route
- Any false negative (legitimate user blocked) confirmed

**Rollback Procedure:**
1. Disable route-specific cutover flag
2. Verify legacy authorization restored
3. Document issue for investigation

**Estimated Time:** < 5 minutes

---

#### Phase 2: RLS Activation

**Rollback RLS when:**
- Any cross-tenant data access detected
- Query latency increase > 50%
- Connection pool exhaustion
- RLS policy blocking legitimate access

**Rollback Procedure:**
1. Execute RLS rollback migration
2. Verify RLS policies disabled
3. Verify cross-tenant isolation via app layer
4. Full audit of potential data exposure

**Estimated Time:** < 15 minutes (flag-based disable < 2 minutes, full migration rollback < 15 minutes)

---

#### Phase 3: Validation & Performance

**Stop validation and investigate when:**
- Performance benchmarks miss target by > 20%
- Integration tests fail on previously passing scenarios
- Cross-tenant security tests show any vulnerability

**Action:** Not a rollback, but halt further cutover until investigation complete.

---

## Rollback Timeline Summary

| Scope | Target Time | Maximum Allowed |
|-------|-------------|-----------------|
| **Cutover flag disable (single route)** | < 1 minute | 5 minutes |
| **Cutover flag disable (all routes)** | < 2 minutes | 5 minutes |
| **RLS policy disable (flag-based)** | < 2 minutes | 5 minutes |
| **RLS migration rollback (full)** | < 10 minutes | 15 minutes |
| **Complete system rollback** | < 15 minutes | 30 minutes |

---

## Communication Protocols

### Internal Notification

| Severity | Channel | Audience | Template |
|----------|---------|----------|----------|
| P1 | Incident Bridge Call + Slack #incidents | All stakeholders | `P1_INCIDENT_TEMPLATE` |
| P2 | Slack #incidents + Email | Engineering + Ops | `P2_INCIDENT_TEMPLATE` |
| P3 | Slack #engineering | Engineering team | Informal notification |
| P4 | Jira/Ticket | Assigned engineer | Standard ticket |

### External Communication (If User Impact)

| Severity | Action | Owner | Timeline |
|----------|--------|-------|----------|
| P1 | Status page update | Platform Ops | Within 30 minutes |
| P1 | User email (if data impact) | Product Owner | Within 4 hours |
| P2 | Status page update (if extended) | Platform Ops | If > 1 hour |

---

## Health Check Commands

### Verify Authorization System

```bash
# Check auth endpoint health
curl -X GET https://api.societ-rt.com/api/health/auth

# Check authorization resolution latency (via metrics endpoint)
curl -X GET https://metrics.societ-rt.com/auth/latency/p99

# Check cutover flag status
curl -X GET https://api.societ-rt.com/api/admin/cutover-flags
```

### Verify RLS Status

```bash
# Check RLS enabled status
psql -c "SELECT relname, relrowsecurity, relforcerowsecurity 
         FROM pg_class 
         WHERE relnamespace = 'public'::regnamespace 
         AND relkind = 'r';"

# Verify tenant isolation (should return empty if working)
psql -c "SET app.current_tenant_id = 'tenant-a-id'; 
         SELECT * FROM memberships 
         WHERE tenant_id != current_setting('app.current_tenant_id')::uuid;"
```

### Verify System Health After Rollback

```bash
# Full health check suite
./scripts/health-check-full.sh

# Verify legacy auth working
curl -X POST https://api.societ-rt.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"test": "health-check"}'

# Verify error rates returned to baseline
curl -X GET https://metrics.societ-rt.com/api/error-rate/5m
```

---

## Post-Incident Procedures

### Immediate (Within 24 hours)

1. **Incident Report Draft**
   - Timeline of events
   - Actions taken
   - Impact assessment

2. **Root Cause Analysis Started**
   - Identify contributing factors
   - Assign investigation owner

### Short-term (Within 1 week)

1. **Post-Incident Review Meeting**
   - All stakeholders present
   - Review timeline and decisions
   - Identify process improvements

2. **Documentation Updates**
   - Update runbooks if needed
   - Update escalation thresholds if needed
   - Update monitoring/alerting

### Follow-up (Within 2 weeks)

1. **Remediation Plan**
   - Specific fixes to prevent recurrence
   - Timeline and ownership

2. **Re-attempt Cutover (if rolled back)**
   - Address root cause
   - Additional validation steps
   - Stakeholder sign-off

---

## Appendix A: Escalation Decision Tree

```
[Alert/Issue Detected]
        │
        ▼
┌─────────────────────┐
│ Is it a P1 trigger? │
│ (data breach, total │
│  service outage)    │
└─────────────────────┘
        │
   Yes  │   No
        │    │
        ▼    ▼
┌───────────┐ ┌─────────────────────┐
│ IMMEDIATE │ │ Is error rate > 5%  │
│ ROLLBACK  │ │ OR latency > 500ms? │
│ + P1 ESC  │ └─────────────────────┘
└───────────┘         │
                 Yes  │   No
                      │    │
                      ▼    ▼
              ┌───────────┐ ┌─────────────────────┐
              │ P2 ESC    │ │ Is it affecting     │
              │ Eng Lead  │ │ safety routes OR    │
              │ decides   │ │ shadow mismatch?    │
              └───────────┘ └─────────────────────┘
                                    │
                               Yes  │   No
                                    │    │
                                    ▼    ▼
                            ┌───────────┐ ┌───────────┐
                            │ P2/P3     │ │ P3/P4     │
                            │ Monitor & │ │ Log &     │
                            │ Assess    │ │ Track     │
                            └───────────┘ └───────────┘
```

---

## Appendix B: Contact Information Template

> **Note:** Fill in actual contact details before cutover. Store securely and update regularly.

```
PRIMARY_ONCALL_ROTATION: [PagerDuty/OpsGenie rotation ID]
ENGINEERING_LEAD: [Name] - [Phone] - [Slack]
SECURITY_LEAD: [Name] - [Phone] - [Slack]
DBA_ONCALL: [Name] - [Phone] - [Slack]
QA_LEAD: [Name] - [Phone] - [Slack]
PLATFORM_OPS_MANAGER: [Name] - [Phone] - [Slack]
PRODUCT_OWNER: [Name] - [Phone] - [Slack]

INCIDENT_BRIDGE: [Zoom/Teams link]
SLACK_CHANNEL: #incidents
STATUS_PAGE: https://status.societ-rt.com
```

---

## Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| Security Lead | | | |
| QA Lead | | | |
| Platform Ops Manager | | | |

---

*This document must be reviewed and contacts verified before each cutover attempt.*
