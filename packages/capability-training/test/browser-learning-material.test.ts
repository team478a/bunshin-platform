import { describe, expect, it } from 'vitest';
import {
  browserLearningDevice,
  browserLearningTarget,
  classifyLearningIntent,
} from '../src/browser-learning-material';

describe('browser learning materials', () => {
  it.each([
    ['生成AIとはどんな仕組み？', 'knowledge'],
    ['最新ツールを比較したい', 'research'],
    ['練習用メモをプレビューしたい', 'practice'],
    ['練習用メモをプレビューする手順と仕組みを知りたい', 'combined'],
  ])('classifies %s', (text, intent) => expect(classifyLearningIntent(text)).toBe(intent));

  it('limits the legacy exercise to practice requests and a declared browser device', () => {
    const originalText = '練習用メモをプレビューしたい';
    expect(browserLearningDevice({ originalText, deviceType: 'SMARTPHONE' })).toBe('mobile');
    expect(browserLearningDevice({ originalText, deviceType: 'PC' })).toBe('desktop');
    expect(browserLearningDevice({ originalText, deviceType: null })).toBeNull();
    expect(browserLearningDevice({ originalText: 'Canvaの操作手順', deviceType: 'PC' })).toBeNull();
  });

  it('uses the verified catalogue target only for a matching request and device', () => {
    const originalText = 'スマホで研修用カタログの比較結果を見たい';
    expect(browserLearningTarget({ originalText, deviceType: 'SMARTPHONE' })).toEqual({
      kind: 'catalogue',
      device: 'mobile',
    });
    expect(browserLearningDevice({ originalText, deviceType: null })).toBeNull();
    expect(
      browserLearningTarget({
        originalText: '研修用カタログの最新情報を調べたい',
        deviceType: 'PC',
      }),
    ).toBeNull();
  });

  it('offers the form lesson only for an explicit practice form request', () => {
    const originalText = '検証用の研修申請フォームに入力して、プレビューを確認したい';
    expect(browserLearningTarget({ originalText, deviceType: 'SMARTPHONE' })).toEqual({
      kind: 'form',
      device: 'mobile',
    });
    expect(browserLearningDevice({ originalText, deviceType: null })).toBeNull();
    expect(
      browserLearningTarget({
        originalText: '会社の研修申請フォームに入力して、申請を送信したい',
        deviceType: 'PC',
      }),
    ).toBeNull();
    expect(
      browserLearningTarget({
        originalText: '検証用の研修申請フォームの設計の理由を知りたい',
        deviceType: 'PC',
      }),
    ).toBeNull();
  });
});
