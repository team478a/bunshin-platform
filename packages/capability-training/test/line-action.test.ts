import { describe, expect, it } from 'vitest';
import { buildAiTrainingActionLineMessage } from '../src/line-action';
import type { AiTrainingActionDisplaySnapshot } from '../src/runtime';

const display: AiTrainingActionDisplaySnapshot = {
  schemaVersion: 1,
  actionKey: 'SALES_EMAIL',
  mode: 'WORK',
  reasonCode: 'ROLE_SALES_NEXT_PRACTICE',
  title: '営業メールを作る',
  reason: '営業職の実務に合う課題です。',
  task: '営業メールを作る指示を書いてください。',
  instructions: ['課題を確認する'],
  estimatedMinutes: 10,
  renderer: 'TRAINING_FIXED_V1',
};

describe('AI training LINE action', () => {
  it('builds a concise message with the participant deep link', () => {
    expect(
      buildAiTrainingActionLineMessage({
        serviceName: '研修サービス',
        display,
        actionUrl: 'https://example.com/s/training/programs/enrollment',
      }),
    ).toBe(
      [
        '研修サービスからのお知らせです。',
        '',
        '今日のAIトレーニングです。',
        'テーマ：営業メールを作る',
        '営業職の実務に合う課題です。',
        '目安：10分',
        '',
        '今日のトレーニングを始める',
        'https://example.com/s/training/programs/enrollment',
      ].join('\n'),
    );
  });

  it('does not claim that work is due while the participant is waiting', () => {
    expect(
      buildAiTrainingActionLineMessage({
        serviceName: '研修サービス',
        display: { ...display, actionKey: 'WAIT', mode: 'WAIT' },
        actionUrl: 'http://localhost:3000/s/training/programs/enrollment',
      }),
    ).toContain('今日は新しい研修課題はありません。');
  });
});
