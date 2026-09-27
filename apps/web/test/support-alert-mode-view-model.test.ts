import { describe, expect, it } from 'vitest';
import { supportAlertModeViewModel } from '../src/services/support-alert-mode-view-model';

describe('supportAlertModeViewModel', () => {
  it.each([
    ['OPTIONAL_UPSELL', '追加提案を検討'],
    ['INCLUDED_SUPPORT', '契約内で対応'],
    ['INTERNAL_ESCALATION', '担当者へ引き継ぐ'],
    ['DISABLED', '内部で確認'],
  ])('%sの対応文言を返す', (mode, acceptLabel) => {
    expect(supportAlertModeViewModel(mode)).toMatchObject({ mode, acceptLabel });
  });

  it('旧候補や不正値は安全側の内部対応にする', () => {
    expect(supportAlertModeViewModel(undefined).mode).toBe('INTERNAL_ESCALATION');
    expect(supportAlertModeViewModel('UNKNOWN').mode).toBe('INTERNAL_ESCALATION');
  });
});
