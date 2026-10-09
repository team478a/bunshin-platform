import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runBaseline,
  compareReports,
  digest,
  parseEvaluationReport,
} from './ai-evolution/evaluator';
import { appendHumanReview, renderMarkdown, saveReport } from './ai-evolution/report';

const provenance = {
  evaluationId: 'test-run',
  codeCommit: 'a'.repeat(40),
  sourceDigest: 'b'.repeat(64),
  workingTreeDirty: false,
  evaluatedAt: '2026-10-09T01:00:00.000Z',
};

describe('EVO-01 report and comparison', () => {
  it('is deterministic given fixed provenance and canned outputs', async () => {
    expect(await runBaseline(provenance)).toEqual(await runBaseline(provenance));
  });
  it.each(['datasetVersion', 'datasetDigest', 'evaluationRuleVersion'] as const)(
    'rejects incompatible %s',
    async (key) => {
      const original = await runBaseline(provenance);
      const changed = { ...original, [key]: 'different' };
      expect(compareReports(original, changed).status).toBe('INCOMPARABLE');
    },
  );
  it('detects lost cases, changed domain rules and changed check evidence', async () => {
    const original = await runBaseline(provenance);
    expect(compareReports(original, { ...original, cases: original.cases.slice(1) }).status).toBe(
      'INCOMPARABLE',
    );
    expect(
      compareReports(original, { ...original, domainRuleVersions: { training: 'changed' } }).status,
    ).toBe('INCOMPARABLE');
    const changed = structuredClone(original);
    changed.cases[0]!.checks[0]!.result = 'FAIL';
    expect(compareReports(original, changed)).toMatchObject({
      status: 'COMPARABLE',
      changes: [{ caseId: changed.cases[0]!.caseId }],
    });
  });
  it('reports model/prompt variants but does not imply measured quality or cost', async () => {
    const original = await runBaseline(provenance);
    const candidate = {
      ...original,
      modelId: 'future-model-label',
      promptVersions: { ...original.promptVersions, DAILY_MISSION: 'candidate-prompt' },
    };
    expect(compareReports(original, candidate)).toMatchObject({
      status: 'COMPARABLE',
      variants: { modelChanged: true, promptChanged: true },
      qualityAndCostConclusion: 'UNKNOWN',
    });
  });
  it('reports expected negative violations separately and does not copy inputs/outputs', async () => {
    const report = await runBaseline(provenance);
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('NO_FOREIGN_OR_UNVERIFIED_FACTS');
    expect(markdown).toContain('MOCK ONLY');
    expect(markdown).toContain('RUNTIME_AUTHORIZATION_CONTRACT_PILOT');
    expect(JSON.stringify(report)).not.toContain('SYNTHETIC_LEARNER_A_ONLY');
    expect(JSON.stringify(report)).not.toContain('offline-not-a-credential');
    expect(report.summary.FAIL).toBeGreaterThan(0);
    expect(report.summary.UNKNOWN).toBeGreaterThan(0);
  });
  it('preserves reports and records review as a separate append-only entry', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bunshin-evo01-'));
    const report = await runBaseline(provenance);
    const directory = await saveReport(root, report);
    const before = await readFile(path.join(directory, 'report.json'), 'utf8');
    await expect(saveReport(root, report)).rejects.toThrow();
    const review = await appendHumanReview(directory, {
      reviewer: 'synthetic-reviewer-test',
      reviewedAt: provenance.evaluatedAt,
      result: 'REVISION_REQUIRED',
      scope: 'SYNTHETIC_BASELINE_ONLY',
    });
    expect(await readFile(path.join(directory, 'report.json'), 'utf8')).toBe(before);
    expect(await readFile(review, 'utf8')).toContain('REVISION_REQUIRED');
    expect(digest(JSON.parse(before) as unknown)).toBe(digest(report));
  });
  it('rejects invalid provenance and path traversal IDs', async () => {
    await expect(runBaseline({ ...provenance, codeCommit: 'not-a-sha' })).rejects.toThrow();
    const report = await runBaseline(provenance);
    await expect(saveReport(os.tmpdir(), { ...report, evaluationId: '../escape' })).rejects.toThrow(
      'invalid evaluation ID',
    );
  });
  it('validates saved JSON and rejects tampered counts or falsely approved results', async () => {
    const report = await runBaseline(provenance);
    expect(parseEvaluationReport(JSON.parse(JSON.stringify(report)) as unknown)).toEqual(report);
    expect(() =>
      parseEvaluationReport({ ...report, summary: { ...report.summary, PASS: 999 } }),
    ).toThrow('inconsistent report');
    expect(() => parseEvaluationReport({ ...report, releaseVerdict: 'PASS' })).toThrow();
  });
});
