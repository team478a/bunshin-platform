import type { AiTrainingActionDisplaySnapshot } from './runtime';

export function buildAiTrainingActionLineMessage(input: {
  serviceName: string;
  display: AiTrainingActionDisplaySnapshot;
  actionUrl: string;
}) {
  const serviceName = input.serviceName.replace(/\s+/g, ' ').trim();
  if (!serviceName) throw new Error('serviceName is required');
  const actionUrl = new URL(input.actionUrl);
  const developmentLocal =
    actionUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(actionUrl.hostname);
  if (actionUrl.protocol !== 'https:' && !developmentLocal) {
    throw new Error('actionUrl must use HTTPS');
  }

  if (input.display.mode === 'WAIT') {
    return [
      `${serviceName}からのお知らせです。`,
      '',
      '今日は新しい研修課題はありません。',
      input.display.reason,
      '',
      '現在の研修状況を見る',
      actionUrl.toString(),
    ].join('\n');
  }

  const heading =
    input.display.actionKey === 'RECOVERY'
      ? '今日から研修を再開できます。'
      : '今日のAIトレーニングです。';
  return [
    `${serviceName}からのお知らせです。`,
    '',
    heading,
    `テーマ：${input.display.title}`,
    input.display.reason,
    ...(input.display.estimatedMinutes === null
      ? []
      : [`目安：${input.display.estimatedMinutes}分`]),
    '',
    '今日のトレーニングを始める',
    actionUrl.toString(),
  ].join('\n');
}
