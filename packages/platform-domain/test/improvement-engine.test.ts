import { describe, expect, it } from 'vitest';
import {
  canTransitionImprovementIssue,
  isImprovementInstructionEligible,
  validateImprovementCoverage,
  improvementMetricRate,
  validateImprovementMetricSnapshot,
  type ImprovementMetricSnapshot,
  type ImprovementScope,
} from '../src/index';

const scope: ImprovementScope = {
  tenantRef: 'tenant-a',
  workspaceId: 'workspace-a',
  serviceId: 'service-a',
  adapterKey: 'adapter-a',
  packageKey: 'package-a',
  environment: 'DEVELOPMENT',
};

describe('improvement engine approval and lifecycle', () => {
  it('retains unknown costs and withholds rates for unknown, partial or zero denominators', () => {
    const metric: ImprovementMetricSnapshot = {
      scope,
      metricKey: 'completed',
      definitionVersion: 'v1',
      fromInclusive: new Date('2026-10-01'),
      toExclusive: new Date('2026-10-02'),
      numerator: 2,
      denominator: 4,
      distinctSubjects: 3,
      coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
      cost: { estimatedUsdMicros: null, confirmedUsdMicros: 500, unresolvedCount: 1 },
    };
    expect(improvementMetricRate(metric)).toBe(0.5);
    expect(metric.cost).toEqual({
      estimatedUsdMicros: null,
      confirmedUsdMicros: 500,
      unresolvedCount: 1,
    });
    expect(improvementMetricRate({ ...metric, denominator: null })).toBeNull();
    expect(improvementMetricRate({ ...metric, numerator: 0, denominator: 0 })).toBeNull();
    expect(
      improvementMetricRate({
        ...metric,
        coverage: { completeness: 'PARTIAL', missingCount: null, truncated: true },
      }),
    ).toBeNull();
    expect(() =>
      validateImprovementMetricSnapshot({
        ...metric,
        cost: { ...metric.cost, confirmedUsdMicros: -1 },
      }),
    ).toThrow();
  });
  it('requires triage and verification before development and closure', () => {
    expect(canTransitionImprovementIssue('DETECTED', 'IN_DEVELOPMENT')).toBe(false);
    expect(canTransitionImprovementIssue('FIXED', 'CLOSED')).toBe(false);
    expect(canTransitionImprovementIssue('FIXED', 'VERIFYING')).toBe(true);
    expect(canTransitionImprovementIssue('VERIFYING', 'REOPENED')).toBe(true);
    expect(canTransitionImprovementIssue('CLOSED', 'REOPENED')).toBe(true);
    expect(canTransitionImprovementIssue('REOPENED', 'IN_DEVELOPMENT')).toBe(false);
  });

  it('requires approval for the exact scope and current candidate/evidence revisions', () => {
    const input = {
      scope,
      status: 'APPROVED' as const,
      candidateRevision: 'candidate-v1',
      evidenceRevision: 'evidence-v1',
      approval: {
        scope,
        actorUserId: 'admin-a',
        candidateRevision: 'candidate-v1',
        evidenceRevision: 'evidence-v1',
      },
    };
    expect(isImprovementInstructionEligible(input)).toBe(true);
    expect(isImprovementInstructionEligible({ ...input, approval: null })).toBe(false);
    expect(isImprovementInstructionEligible({ ...input, status: 'TRIAGED' })).toBe(false);
    expect(isImprovementInstructionEligible({ ...input, evidenceRevision: 'evidence-v2' })).toBe(
      false,
    );
    expect(isImprovementInstructionEligible({ ...input, candidateRevision: 'candidate-v2' })).toBe(
      false,
    );
    expect(
      isImprovementInstructionEligible({
        ...input,
        approval: { ...input.approval, scope: { ...scope, serviceId: 'service-b' } },
      }),
    ).toBe(false);
  });

  it('never treats unknown or truncated coverage as a complete zero sample', () => {
    expect(() =>
      validateImprovementCoverage({
        completeness: 'UNKNOWN',
        missingCount: null,
        truncated: false,
      }),
    ).not.toThrow();
    expect(() =>
      validateImprovementCoverage({ completeness: 'PARTIAL', missingCount: null, truncated: true }),
    ).not.toThrow();
    expect(() =>
      validateImprovementCoverage({
        completeness: 'COMPLETE',
        missingCount: null,
        truncated: false,
      }),
    ).toThrow();
    expect(() =>
      validateImprovementCoverage({ completeness: 'COMPLETE', missingCount: 0, truncated: true }),
    ).toThrow();
    expect(() =>
      validateImprovementCoverage({ completeness: 'COMPLETE', missingCount: 2, truncated: false }),
    ).toThrow();
  });
});
