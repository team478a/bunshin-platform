import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { runLearningModelEvaluation } from '../src/ai/learning-model-evaluation';

const enabled = process.env['LEARNING_EVAL_CONFIRM'] === 'RUN_SYNTHETIC_MODEL_EVALUATION';

describe('explicit synthetic learning-model evaluation batch', () => {
  it.skipIf(!enabled)(
    'evaluates the same synthetic proposal scenarios with blind criterion scores',
    async () => {
      vi.setConfig({ testTimeout: 60 * 60 * 1_000 });
      const result = await runLearningModelEvaluation();
      expect(result.entryCount).toBe(40);
      console.info(`Blind learning evaluation saved: ${result.outputDirectory}`);
    },
  );
});
