import { aiResaleOfferMessage, type AiResaleOfferKind } from './offer';
import type { DaySevenClassification } from './index';

function secureUrl(value: string) {
  const url = new URL(value);
  const developmentLocal =
    url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !developmentLocal) {
    throw new Error('offerUrl must use HTTPS');
  }
  return url.toString();
}

export function buildAiResaleOfferLineMessage(input: {
  serviceName: string;
  classification: DaySevenClassification;
  offerKind: AiResaleOfferKind;
  amountYen: number;
  durationDays: number;
  offerUrl: string;
}) {
  const serviceName = input.serviceName.replace(/\s+/g, ' ').trim();
  if (!serviceName) throw new Error('serviceName is required');
  if (!Number.isInteger(input.amountYen) || input.amountYen <= 0) {
    throw new Error('amountYen must be a positive integer');
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
    throw new Error('durationDays must be a positive integer');
  }
  const copy = aiResaleOfferMessage(input.classification);
  const label = input.offerKind === 'STANDARD' ? '90日プログラム' : '90日モニタープラン';
  return [
    `${serviceName}からのお知らせです。`,
    '',
    '7日間のAI副業体験が完了しました。',
    copy.title,
    copy.description,
    '',
    `${label}：${new Intl.NumberFormat('ja-JP').format(input.amountYen)}円（一括）`,
    `利用期間：${input.durationDays}日間`,
    '',
    '結果と次のプログラムを見る',
    secureUrl(input.offerUrl),
  ].join('\n');
}
