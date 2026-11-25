import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  browserEvidenceTargetSchema,
  type BrowserPlan,
  type BrowserStepEvidence,
} from '@bunshin/capability-browser';
import { BrowserRunError } from './browser';
import { evidenceGeometryVersion } from './evidence';
import { materialImages } from './material-images';

type ProofStep = Pick<
  BrowserStepEvidence,
  'stepId' | 'action' | 'beforePng' | 'afterPng' | 'target'
>;

const practiceNoteMaterial = {
  title: '練習用メモをプレビューする',
  goal: 'メモのタイトルを入力し、表示結果を確認できる。',
  preparation: '操作練習ページを開く。入力には練習用の文字を使用する。',
  practice: '「今日の振り返り」など別のタイトルを入力して、プレビューの表示を確かめる。',
  checkpoint: '入力したタイトルは、どこに表示されましたか？',
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function readMaterialProof(
  directory: string,
  plan: BrowserPlan,
  verifiedAt: Date,
  signal: AbortSignal,
  useCurrentGeometry = false,
): Promise<ProofStep[] | null> {
  try {
    const manifest = object(
      JSON.parse(await readFile(join(directory, 'evidence.json'), { encoding: 'utf8', signal })),
    );
    const steps = manifest?.['steps'];
    const date = manifest?.['verifiedAt'];
    if (
      typeof date !== 'string' ||
      Date.parse(date) !== verifiedAt.getTime() ||
      manifest?.['device'] !== plan.device ||
      !Array.isArray(steps) ||
      steps.length !== plan.steps.length
    )
      throw new BrowserRunError('INVALID_PLAN');
    if (useCurrentGeometry && manifest?.['geometryVersion'] !== evidenceGeometryVersion)
      return null;

    const proof: ProofStep[] = [];
    for (const [index, step] of plan.steps.entries()) {
      const metadata = object(steps[index]);
      if (step.id !== metadata?.['stepId'] || step.action !== metadata['action']) {
        throw new BrowserRunError('INVALID_PLAN');
      }
      const target = browserEvidenceTargetSchema.safeParse(metadata['target']);
      const beforePng = await readFile(join(directory, `${step.id}-before.png`), { signal });
      const afterPng = await readFile(join(directory, `${step.id}-after.png`), { signal });
      proof.push({
        stepId: step.id,
        action: step.action,
        beforePng,
        afterPng,
        ...(target.success ? { target: target.data } : {}),
      });
    }
    return proof;
  } catch (error) {
    if (object(error)?.['code'] === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new BrowserRunError('INVALID_PLAN');
    throw error;
  }
}

export async function composeFixtureMaterial(
  plan: BrowserPlan,
  proof: ProofStep[],
  signal: AbortSignal,
  content = practiceNoteMaterial,
) {
  if (proof.length !== plan.steps.length) throw new BrowserRunError('INVALID_PLAN');
  const steps = [];
  for (const [index, step] of plan.steps.entries()) {
    signal.throwIfAborted();
    const evidence = proof[index];
    if (evidence?.stepId !== step.id || evidence.action !== step.action)
      throw new BrowserRunError('INVALID_PLAN');
    steps.push({
      ordinal: index + 1,
      stepId: step.id,
      instruction: describeStep(step),
      ...(await materialImages(evidence)),
    });
  }
  return { ...content, steps };
}

function describeStep(step: BrowserPlan['steps'][number]) {
  if (step.action === 'navigate') return `「${step.page}」ページを開く。`;
  const label = step.target.by === 'role' ? step.target.name : step.target.text;
  if (step.action === 'click') return `「${label}」を押す。`;
  if (step.action === 'fill') return `「${label}」に練習用の文字を入力する。`;
  return `「${label}」が見えるまでスクロールする。`;
}
