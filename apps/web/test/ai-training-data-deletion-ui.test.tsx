import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiTrainingDataDeletionCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-data-deletion-card';
describe('training deletion UX and lifecycle', () => {
  it('starts with preview only and explains export, irreversible deletion and retained records', () => {
    const html = renderToStaticMarkup(
      <AiTrainingDataDeletionCard serviceSlug="training" programEnrollmentId="enrollment" />,
    );
    for (const label of [
      '削除対象を確認',
      '取り消せません',
      'ダウンロード',
      '参加状態は変わりません',
      'バックアップ',
      '決済',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('確認した対象を削除する');
    expect(html).not.toContain('checked=""');
  });
  it('binds confirmation to preview revision and resets after change/failure without storing contents', () => {
    const source = readFileSync(
      new URL(
        '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-data-deletion-card.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain('revision: preview!.revision');
    expect(source).toContain('disabled={!confirmed || busy}');
    expect(source).toContain('response.status === 409');
    expect(source).toContain('setPreview(null)');
    expect(source).toContain("confirmation: 'DELETE_TRAINING_DATA'");
    expect(source).not.toMatch(/localStorage|console\.|answer\.answer/);
  });
  it('locks evaluation completion before the pending-answer CAS and locks queue submission', () => {
    const handler = readFileSync(
      new URL('../src/jobs/training-answer-evaluation-job-handler.ts', import.meta.url),
      'utf8',
    );
    const queue = readFileSync(
      new URL('../src/services/ai-training-evaluation-queue.ts', import.meta.url),
      'utf8',
    );
    expect(handler.indexOf('lockTrainingEnrollmentData')).toBeLessThan(
      handler.indexOf('tx.trainingMissionAnswer.updateMany'),
    );
    expect(handler).toContain('if (updated.count !== 1) return');
    expect(queue).toContain('new db.PrismaJobRepository(tx)');
    expect(queue).toContain('if (!answer) throw new ApplicationError');
  });
});
