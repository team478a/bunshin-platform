export type SupportAlertMode =
  'OPTIONAL_UPSELL' | 'INCLUDED_SUPPORT' | 'INTERNAL_ESCALATION' | 'DISABLED';

const modeContent: Record<
  SupportAlertMode,
  { label: string; description: string; acceptLabel: string; acceptReason: string }
> = {
  OPTIONAL_UPSELL: {
    label: '有料オプション候補',
    description: '契約に含まれない追加支援として、提案の要否を判断します。',
    acceptLabel: '追加提案を検討',
    acceptReason: '運営者が有料オプションの提案検討を開始',
  },
  INCLUDED_SUPPORT: {
    label: '契約内サポート',
    description: '現在の契約内容に含まれる支援として対応します。',
    acceptLabel: '契約内で対応',
    acceptReason: '運営者が契約内サポートを開始',
  },
  INTERNAL_ESCALATION: {
    label: '内部対応',
    description: '利用者へ案内せず、担当者が内部で対応方針を判断します。',
    acceptLabel: '担当者へ引き継ぐ',
    acceptReason: '運営者が内部対応を開始',
  },
  DISABLED: {
    label: 'アラート停止',
    description: '新しい支援候補は作成しません。',
    acceptLabel: '内部で確認',
    acceptReason: '運営者が既存候補の内部確認を開始',
  },
};

export function supportAlertModeViewModel(value: unknown) {
  const mode: SupportAlertMode =
    typeof value === 'string' && value in modeContent
      ? (value as SupportAlertMode)
      : 'INTERNAL_ESCALATION';
  return { mode, ...modeContent[mode] };
}
