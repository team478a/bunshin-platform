export type ServiceCreditLedgerDisplayEntry = {
  type: 'GRANT' | 'CONSUME' | 'REFUND' | 'EXPIRE' | 'ADJUST';
  sourceType: 'REFERRAL' | 'CAMPAIGN' | 'PURCHASE' | 'ADMIN' | 'SYSTEM';
  amount: number;
  expiresAt: Date | null;
};

const sourceLabel: Record<ServiceCreditLedgerDisplayEntry['sourceType'], string> = {
  REFERRAL: '紹介特典',
  CAMPAIGN: 'キャンペーン特典',
  PURCHASE: '購入分',
  ADMIN: '運営からの調整',
  SYSTEM: 'システムによる調整',
};

export function serviceCreditLedgerSummary(entry: ServiceCreditLedgerDisplayEntry) {
  if (entry.type === 'CONSUME') return '画像作成に使いました';
  if (entry.type === 'EXPIRE') return '使える期限が過ぎました';
  if (entry.type === 'REFUND') return '画像作成回数が戻りました';
  if (entry.type === 'ADJUST') return '画像作成回数を調整しました';
  return sourceLabel[entry.sourceType];
}

export function serviceCreditAmountLabel(
  entry: Pick<ServiceCreditLedgerDisplayEntry, 'type' | 'amount'>,
) {
  const sign = entry.amount > 0 ? '+' : '';
  return `${sign}${entry.amount}回`;
}
