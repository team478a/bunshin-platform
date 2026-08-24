import { describe, expect, it } from 'vitest';
import datasetFixture from './fixtures/ai-agent-golden-dataset.v1.json';
import {
  parseGoldenDataset,
  runGoldenDatasetRegression,
  type GoldenDatasetCase,
  type GoldenDatasetObservation,
} from '../src';

const dataset = parseGoldenDataset(datasetFixture);
const passing = (testCase: GoldenDatasetCase): GoldenDatasetObservation => ({
  caseId: testCase.id,
  observation: {
    outcome: testCase.expectation.outcome,
    failureCategory: testCase.expectation.failureCategory,
    result: null,
    emittedText: [],
    accessedDataClasses: [],
    attemptedTools: [],
    costUsdMicros: 0,
    latencyMs: 0,
    retryCount: 0,
  },
});

describe('Golden Dataset回帰Runner', () => {
  it('全ケースの合否を一括集計する', () => {
    const report = runGoldenDatasetRegression(dataset, dataset.cases.map(passing));
    expect(report).toMatchObject({
      datasetVersion: 'ai-agent-golden-v1',
      passed: true,
      totalCases: 6,
      passedCases: 6,
      failedCases: 0,
      configurationErrors: [],
    });
    expect(report.reports).toHaveLength(6);
  });

  it('禁止結果を失敗件数へ反映する', () => {
    const observations = dataset.cases.map(passing);
    observations[0] = {
      ...observations[0]!,
      observation: { ...observations[0]!.observation, attemptedTools: ['LINE_SEND'] },
    };
    const report = runGoldenDatasetRegression(dataset, observations);
    expect(report).toMatchObject({ passed: false, passedCases: 5, failedCases: 1 });
    expect(report.reports[0]).toMatchObject({
      passed: false,
      violations: ['TOOL_POLICY_VIOLATION'],
    });
  });

  it('欠落、重複、未知ケースを固定分類する', () => {
    const observations = dataset.cases.slice(1).map(passing);
    observations.push(passing(dataset.cases[1]!));
    observations.push({ ...passing(dataset.cases[1]!), caseId: 'unknown-case' });
    const report = runGoldenDatasetRegression(dataset, observations);
    expect(report.passed).toBe(false);
    expect(report.configurationErrors).toEqual([
      { code: 'UNKNOWN_CASE', caseId: 'unknown-case' },
      { code: 'MISSING_OBSERVATION', caseId: 'jp-small-shop-standard' },
      { code: 'DUPLICATE_OBSERVATION', caseId: 'prompt-injection-source' },
    ]);
    expect(report.failedCases).toBe(2);
  });

  it('入力順に依存せずdataset順でreportを返す', () => {
    const reversed = dataset.cases.map(passing).reverse();
    const report = runGoldenDatasetRegression(dataset, reversed);
    expect(report.reports.map((item) => item.caseId)).toEqual(dataset.cases.map((item) => item.id));
  });
});
