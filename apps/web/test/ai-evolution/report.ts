import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  digest,
  parseEvaluationReport,
  type EvaluationReport,
  type compareReports,
} from './evaluator';

export function renderMarkdown(report: EvaluationReport): string {
  return [
    '# EVO-01 Offline Synthetic Evaluation',
    '',
    '**Not a real model quality or release approval. Runtime gates require separate regression evidence.**',
    '',
    `Evaluation: ${report.evaluationId}`,
    `Commit: ${report.codeCommit} (dirty: ${report.workingTreeDirty})`,
    `Source digest: ${report.sourceDigest}`,
    `Model label: ${report.modelId} (MOCK ONLY)`,
    `Dataset: ${report.datasetVersion} / ${report.datasetDigest}`,
    `Rules: ${report.evaluationRuleVersion} / ${report.domainRuleVersions.training}`,
    `Prompts: ${JSON.stringify(report.promptVersions)}`,
    `Executed at: ${report.evaluatedAt}`,
    '',
    `Cases: ${report.summary.cases}; observed PASS/FAIL/UNKNOWN: ${report.summary.PASS}/${report.summary.FAIL}/${report.summary.UNKNOWN}; unexpected test failures: ${report.summary.testFailures}.`,
    'Expected negative fixture failures remain FAIL below; detecting them is a passing test, not safe output.',
    '',
    '<!-- prettier-ignore -->',
    '| Case | Task | Observed | Expected | Test | Mandatory violations |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.cases.map(
      (c) =>
        `| ${c.caseId} | ${c.task} | ${c.observed} | ${c.expected} | ${c.testResult} | ${
          c.checks
            .filter((v) => v.category === 'MANDATORY' && v.result === 'FAIL')
            .map((v) => v.rule)
            .join(', ') || '-'
        } |`,
    ),
    '',
    `Unmeasured: ${report.unmeasured.join(', ')}`,
    `Human review: ${report.humanReview.status}. Release verdict: ${report.releaseVerdict}.`,
    '',
    'Human review required: synthetic oracle adequacy, subjective specificity/personalization, actual model quality, runtime authorization/contract/Pilot regression and production readiness. No automatic merge/deploy.',
    '',
  ].join('\n');
}

/** Exclusive directory creation prevents replacing a previous run. No customer text is included. */
export async function saveReport(
  root: string,
  report: EvaluationReport,
  comparison?: ReturnType<typeof compareReports>,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(report.evaluationId)) throw new Error('invalid evaluation ID');
  parseEvaluationReport(report);
  await mkdir(root, { recursive: true });
  const directory = path.join(root, report.evaluationId);
  await mkdir(directory); // EEXIST is intentionally fatal.
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  await writeFile(path.join(directory, 'report.md'), renderMarkdown(report), { flag: 'wx' });
  if (comparison)
    await writeFile(
      path.join(directory, 'comparison.json'),
      JSON.stringify(comparison, null, 2) + '\n',
      { flag: 'wx' },
    );
  return directory;
}

export type HumanReview = {
  reviewer: string;
  reviewedAt: string;
  result: 'ACCEPTED' | 'REJECTED' | 'REVISION_REQUIRED';
  scope: 'SYNTHETIC_BASELINE_ONLY';
};
export async function appendHumanReview(directory: string, review: HumanReview): Promise<string> {
  if (
    !review.reviewer.trim() ||
    !Number.isFinite(Date.parse(review.reviewedAt)) ||
    !['ACCEPTED', 'REJECTED', 'REVISION_REQUIRED'].includes(review.result) ||
    review.scope !== 'SYNTHETIC_BASELINE_ONLY'
  )
    throw new Error('invalid review');
  const report = parseEvaluationReport(
    JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8')) as unknown,
  );
  const file = path.join(directory, `review-${randomUUID()}.json`);
  await writeFile(
    file,
    JSON.stringify(
      { ...review, evaluationId: report.evaluationId, reportDigest: digest(report) },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  return file;
}
