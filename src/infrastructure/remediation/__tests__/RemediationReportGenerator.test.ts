/**
 * Unit Tests: Remediation Report Generator
 *
 * Tests for Task 33: Evidence-Based Remediation Workflow
 *
 * @see Requirement 11 AC 5: Generate report with before/after state
 * @see Requirement 11 AC 6: Support dry-run mode report
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createRemediationReportGenerator,
  generateRemediationReport,
  formatReportAsJson,
  formatReportAsMarkdown,
} from '../RemediationReportGenerator';
import type {
  QuarantineVerificationResult,
  RemediationResult,
  RemediationSummary,
} from '../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const mockQuarantineVerification: QuarantineVerificationResult = {
  verified: true,
  expectedCount: 5,
  actualCount: 5,
  manifestVersion: '1.0.0',
  errorMessage: null,
};

const mockCreatedResult: RemediationResult = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'user1@example.com',
  disposition: 'created',
  membershipId: 'mem-111',
  beforeState: {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'user1@example.com',
    name: 'User One',
    legacyTenantId: 'tenant-001',
    legacyRole: 'Warga',
    hasMembership: false,
  },
  afterState: {
    userId: '11111111-1111-1111-1111-111111111111',
    membershipId: 'mem-111',
    tenantId: 'tenant-001',
    orgUnitId: 'org-001',
    role: 'RESIDENT',
    status: 'ACTIVE',
    hasMembership: true,
  },
  reason: 'Membership created successfully',
};

const mockSkippedQuarantineResult: RemediationResult = {
  userId: '00000000-0000-0000-0000-000000000021',
  email: 'pna01@example.com',
  disposition: 'skipped-quarantine',
  membershipId: null,
  beforeState: {
    userId: '00000000-0000-0000-0000-000000000021',
    email: 'pna01@example.com',
    name: 'PNA-01 User',
    legacyTenantId: 'platform',
    legacyRole: 'Ketua_RT',
    hasMembership: false,
  },
  afterState: null,
  reason: 'User is in quarantine manifest (PNA-01 through PNA-05)',
};

const mockSkippedMissingTenantResult: RemediationResult = {
  userId: '22222222-2222-2222-2222-222222222222',
  email: 'orphan@example.com',
  disposition: 'skipped-missing-tenant',
  membershipId: null,
  beforeState: {
    userId: '22222222-2222-2222-2222-222222222222',
    email: 'orphan@example.com',
    name: 'Orphan User',
    legacyTenantId: 'deleted-tenant',
    legacyRole: 'Warga',
    hasMembership: false,
  },
  afterState: null,
  reason: 'Tenant deleted-tenant does not exist',
};

const mockSkippedDryRunResult: RemediationResult = {
  userId: '33333333-3333-3333-3333-333333333333',
  email: 'dryrun@example.com',
  disposition: 'skipped-dry-run',
  membershipId: null,
  beforeState: {
    userId: '33333333-3333-3333-3333-333333333333',
    email: 'dryrun@example.com',
    name: 'Dry Run User',
    legacyTenantId: 'tenant-001',
    legacyRole: 'Warga',
    hasMembership: false,
  },
  afterState: null,
  reason: 'Dry-run mode - no changes made',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemediationReportGenerator', () => {
  describe('generateMetadata()', () => {
    const generator = createRemediationReportGenerator();

    it('should generate metadata with correct dryRun flag', () => {
      const metadata = generator.generateMetadata(true);
      expect(metadata.dryRun).toBe(true);

      const metadata2 = generator.generateMetadata(false);
      expect(metadata2.dryRun).toBe(false);
    });

    it('should generate ISO 8601 timestamp', () => {
      const metadata = generator.generateMetadata(true);
      expect(metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should use provided correlationId', () => {
      const metadata = generator.generateMetadata(true, 'custom-correlation-id');
      expect(metadata.correlationId).toBe('custom-correlation-id');
    });

    it('should generate correlationId if not provided', () => {
      const metadata = generator.generateMetadata(true);
      expect(metadata.correlationId).toBeDefined();
      expect(metadata.correlationId.length).toBeGreaterThan(0);
    });

    it('should include service version', () => {
      const metadata = generator.generateMetadata(true);
      expect(metadata.serviceVersion).toBeDefined();
    });
  });

  describe('generateSummary()', () => {
    const generator = createRemediationReportGenerator();

    it('should count total discovered correctly', () => {
      const results = [mockCreatedResult, mockSkippedQuarantineResult];
      const summary = generator.generateSummary(results);
      expect(summary.totalDiscovered).toBe(2);
    });

    it('should count created memberships correctly', () => {
      const results = [mockCreatedResult, mockCreatedResult];
      const summary = generator.generateSummary(results);
      expect(summary.created).toBe(2);
    });

    it('should count skipped quarantine correctly', () => {
      const results = [mockSkippedQuarantineResult, mockSkippedQuarantineResult];
      const summary = generator.generateSummary(results);
      expect(summary.skippedQuarantine).toBe(2);
      expect(summary.totalSkipped).toBe(2);
    });

    it('should count skipped missing tenant correctly', () => {
      const results = [mockSkippedMissingTenantResult];
      const summary = generator.generateSummary(results);
      expect(summary.skippedMissingTenant).toBe(1);
      expect(summary.totalSkipped).toBe(1);
    });

    it('should count skipped dry-run correctly', () => {
      const results = [mockSkippedDryRunResult, mockSkippedDryRunResult, mockSkippedDryRunResult];
      const summary = generator.generateSummary(results);
      expect(summary.skippedDryRun).toBe(3);
      expect(summary.totalSkipped).toBe(3);
    });

    it('should calculate totalSkipped as sum of all skip reasons', () => {
      const results = [
        mockSkippedQuarantineResult,
        mockSkippedMissingTenantResult,
        mockSkippedDryRunResult,
      ];
      const summary = generator.generateSummary(results);
      expect(summary.totalSkipped).toBe(3);
    });

    it('should handle empty results', () => {
      const summary = generator.generateSummary([]);
      expect(summary.totalDiscovered).toBe(0);
      expect(summary.created).toBe(0);
      expect(summary.totalSkipped).toBe(0);
    });
  });

  describe('extractSkippedUsers()', () => {
    const generator = createRemediationReportGenerator();

    it('should extract only skipped users', () => {
      const results = [mockCreatedResult, mockSkippedQuarantineResult];
      const skipped = generator.extractSkippedUsers(results);

      expect(skipped).toHaveLength(1);
      expect(skipped[0]?.userId).toBe(mockSkippedQuarantineResult.userId);
    });

    it('should include disposition and reason', () => {
      const skipped = generator.extractSkippedUsers([mockSkippedQuarantineResult]);

      expect(skipped[0]?.disposition).toBe('skipped-quarantine');
      expect(skipped[0]?.reason).toContain('quarantine');
    });

    it('should return empty array if no skipped users', () => {
      const skipped = generator.extractSkippedUsers([mockCreatedResult]);
      expect(skipped).toHaveLength(0);
    });
  });

  describe('extractCreatedMemberships()', () => {
    const generator = createRemediationReportGenerator();

    it('should extract only created memberships', () => {
      const results = [mockCreatedResult, mockSkippedQuarantineResult];
      const created = generator.extractCreatedMemberships(results);

      expect(created).toHaveLength(1);
      expect(created[0]?.userId).toBe(mockCreatedResult.userId);
    });

    it('should include membership details', () => {
      const created = generator.extractCreatedMemberships([mockCreatedResult]);

      expect(created[0]?.membershipId).toBe('mem-111');
      expect(created[0]?.role).toBe('RESIDENT');
      expect(created[0]?.legacyRole).toBe('Warga');
    });

    it('should return empty array if no created memberships', () => {
      const created = generator.extractCreatedMemberships([mockSkippedQuarantineResult]);
      expect(created).toHaveLength(0);
    });
  });

  describe('generate()', () => {
    const generator = createRemediationReportGenerator();

    it('should generate a complete report', () => {
      const report = generator.generate({
        dryRun: true,
        correlationId: 'test-correlation',
        quarantineVerification: mockQuarantineVerification,
        results: [mockCreatedResult, mockSkippedQuarantineResult],
      });

      expect(report.metadata.dryRun).toBe(true);
      expect(report.metadata.correlationId).toBe('test-correlation');
      expect(report.quarantineVerification.verified).toBe(true);
      expect(report.summary.totalDiscovered).toBe(2);
      expect(report.results).toHaveLength(2);
      expect(report.skippedUsers).toHaveLength(1);
      expect(report.createdMemberships).toHaveLength(1);
    });
  });

  describe('toJson()', () => {
    const generator = createRemediationReportGenerator();

    it('should generate valid JSON', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const json = generator.toJson(report);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should pretty-print by default', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const json = generator.toJson(report);
      expect(json).toContain('\n');
    });

    it('should support minified output', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const json = generator.toJson(report, false);
      expect(json).not.toContain('\n');
    });
  });

  describe('toMarkdown()', () => {
    const generator = createRemediationReportGenerator();

    it('should generate markdown with header', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const md = generator.toMarkdown(report);
      expect(md).toContain('# Legacy Data Remediation Report');
    });

    it('should include metadata section', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const md = generator.toMarkdown(report);
      expect(md).toContain('## Metadata');
      expect(md).toContain('Dry Run');
    });

    it('should include quarantine verification section', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const md = generator.toMarkdown(report);
      expect(md).toContain('## Quarantine Verification');
      expect(md).toContain('✅');
    });

    it('should include summary table', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [mockCreatedResult],
      });

      const md = generator.toMarkdown(report);
      expect(md).toContain('## Summary');
      expect(md).toContain('Total Discovered');
    });

    it('should include created memberships table when present', () => {
      const report = generator.generate({
        dryRun: false,
        quarantineVerification: mockQuarantineVerification,
        results: [mockCreatedResult],
      });

      const md = generator.toMarkdown(report);
      expect(md).toContain('## Created Memberships');
    });

    it('should include skipped users table when present', () => {
      const report = generator.generate({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [mockSkippedQuarantineResult],
      });

      const md = generator.toMarkdown(report);
      expect(md).toContain('## Skipped Users');
    });
  });
});

// ---------------------------------------------------------------------------
// Convenience Function Tests
// ---------------------------------------------------------------------------

describe('Convenience Functions', () => {
  describe('generateRemediationReport()', () => {
    it('should work like generator.generate()', () => {
      const report = generateRemediationReport({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      expect(report.metadata.dryRun).toBe(true);
    });
  });

  describe('formatReportAsJson()', () => {
    it('should work like generator.toJson()', () => {
      const report = generateRemediationReport({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const json = formatReportAsJson(report);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('formatReportAsMarkdown()', () => {
    it('should work like generator.toMarkdown()', () => {
      const report = generateRemediationReport({
        dryRun: true,
        quarantineVerification: mockQuarantineVerification,
        results: [],
      });

      const md = formatReportAsMarkdown(report);
      expect(md).toContain('# Legacy Data Remediation Report');
    });
  });
});

// ---------------------------------------------------------------------------
// Requirement 11 AC 5: Before/After State Verification
// ---------------------------------------------------------------------------

describe('Requirement 11 AC 5: Report with before/after state', () => {
  const generator = createRemediationReportGenerator();

  it('should include before state for all results', () => {
    const report = generator.generate({
      dryRun: false,
      quarantineVerification: mockQuarantineVerification,
      results: [mockCreatedResult, mockSkippedQuarantineResult],
    });

    for (const result of report.results) {
      expect(result.beforeState).toBeDefined();
      expect(result.beforeState.hasMembership).toBe(false);
    }
  });

  it('should include after state for created memberships', () => {
    const report = generator.generate({
      dryRun: false,
      quarantineVerification: mockQuarantineVerification,
      results: [mockCreatedResult],
    });

    const created = report.results.find((r) => r.disposition === 'created');
    expect(created?.afterState).toBeDefined();
    expect(created?.afterState?.hasMembership).toBe(true);
    expect(created?.afterState?.membershipId).toBeDefined();
  });

  it('should have null after state for skipped users', () => {
    const report = generator.generate({
      dryRun: true,
      quarantineVerification: mockQuarantineVerification,
      results: [mockSkippedQuarantineResult],
    });

    const skipped = report.results[0];
    expect(skipped?.afterState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Requirement 11 AC 6: Dry-Run Mode Verification
// ---------------------------------------------------------------------------

describe('Requirement 11 AC 6: Dry-run mode report', () => {
  const generator = createRemediationReportGenerator();

  it('should indicate dry-run in metadata', () => {
    const report = generator.generate({
      dryRun: true,
      quarantineVerification: mockQuarantineVerification,
      results: [mockSkippedDryRunResult],
    });

    expect(report.metadata.dryRun).toBe(true);
  });

  it('should count skipped-dry-run in summary', () => {
    const report = generator.generate({
      dryRun: true,
      quarantineVerification: mockQuarantineVerification,
      results: [mockSkippedDryRunResult, mockSkippedDryRunResult],
    });

    expect(report.summary.skippedDryRun).toBe(2);
  });

  it('should have no created memberships in dry-run', () => {
    const report = generator.generate({
      dryRun: true,
      quarantineVerification: mockQuarantineVerification,
      results: [mockSkippedDryRunResult],
    });

    expect(report.createdMemberships).toHaveLength(0);
  });
});
