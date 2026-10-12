import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluationCases } from './ai-evolution/dataset';
import {
  compareReports,
  digest,
  evaluateCase,
  runBaseline,
  parseEvaluationReport,
} from './ai-evolution/evaluator';
import { saveReport } from './ai-evolution/report';

afterEach(() => vi.unstubAllGlobals());

describe('EVO-01 fixed offline baseline', () => {
  it.each(evaluationCases)('$id detects $expected without external API calls', async (item) => {
    const external = vi.fn(() => {
      throw new Error('network forbidden');
    });
    vi.stubGlobal('fetch', external);
    const before = digest(item);
    const result = await evaluateCase(item);
    expect(result.observed).toBe(item.expected);
    expect(result.testResult).toBe('PASS');
    expect(digest(item)).toBe(before);
    expect(external).not.toHaveBeenCalled();
  });

  it('records provenance and optional append-only artifacts; comparison never approves a model', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('network forbidden');
    });
    const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const root = path.resolve(import.meta.dirname, '../../..');
    const files = [
      'apps/web/test/ai-evolution-baseline.test.ts',
      'apps/web/test/ai-evolution/dataset.ts',
      'apps/web/test/ai-evolution/evaluator.ts',
      'apps/web/test/ai-evolution/report.ts',
      'apps/web/src/providers/openai-daily-mission-planner.ts',
      'apps/web/src/providers/openai-weekly-planner.ts',
      'apps/web/src/providers/openai-training-answer-evaluator.ts',
      'apps/web/src/services/daily-mission-content-quality.ts',
      'packages/capability-social/src/weekly-plan.ts',
      'packages/capability-training/src/skill-evaluation.ts',
      'packages/capability-training/src/guided-practice.ts',
    ];
    const report = await runBaseline({
      evaluationId: `evo01-${randomUUID()}`,
      codeCommit,
      workingTreeDirty:
        execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
      sourceDigest: digest(
        files.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
      ),
      evaluatedAt: new Date().toISOString(),
    });
    expect(report.summary.testFailures).toBe(0);
    expect(report.summary.cases).toBe(evaluationCases.length);
    expect(report.externalCalls).toBe(0);
    expect(report.humanReview.status).toBe('PENDING');
    expect(report.releaseVerdict).toBe('UNKNOWN');
    expect(report.unmeasured).toContain('API_COST');
    expect(compareReports(report, report)).toMatchObject({
      status: 'COMPARABLE',
      changes: [],
      qualityAndCostConclusion: 'UNKNOWN',
    });
    const output = process.env['AI_BASELINE_OUTPUT_DIR'];
    const compareWith = process.env['AI_BASELINE_COMPARE_WITH'];
    const comparison = compareWith
      ? compareReports(
          parseEvaluationReport(
            JSON.parse(readFileSync(path.resolve(root, compareWith), 'utf8')) as unknown,
          ),
          report,
        )
      : undefined;
    if (comparison) console.info(`Baseline comparison: ${comparison.status}`);
    if (output) {
      const directory = await saveReport(path.resolve(root, output), report, comparison);
      console.info(`Offline baseline saved: ${path.relative(root, directory)}`);
    }
  });
});
