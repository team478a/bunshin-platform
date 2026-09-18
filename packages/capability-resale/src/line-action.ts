import type { AiResaleActionDisplaySnapshot } from './runtime';

export function buildAiResaleActionLineMessage(input: {
  serviceName: string;
  display: AiResaleActionDisplaySnapshot;
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
      '今日は何もしなくてOKです。',
      input.display.reason,
      '',
      '現在の状況を見る',
      actionUrl.toString(),
    ].join('\n');
  }

  const heading =
    input.display.actionKey === 'RECOVERY'
      ? '今日からまた始められます。'
      : '今日やることがあります。';
  return [
    `${serviceName}からのお知らせです。`,
    '',
    heading,
    input.display.title,
    input.display.reason,
    ...(input.display.estimatedMinutes === null
      ? []
      : [`目安：${input.display.estimatedMinutes}分`]),
    '',
    '今日の一歩を開く',
    actionUrl.toString(),
  ].join('\n');
}
