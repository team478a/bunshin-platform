import { describe, expect, it } from 'vitest';
import { browserLearningDevice, classifyLearningIntent } from '../src/browser-learning-material';

describe('browser learning materials', () => {
  it.each([
    ['生成AIとはどんな仕組み？', 'knowledge'],
    ['最新ツールを比較したい', 'research'],
    ['練習用メモをプレビューしたい', 'practice'],
    ['練習用メモをプレビューする手順と仕組みを知りたい', 'combined'],
  ])('classifies %s', (text, intent) => expect(classifyLearningIntent(text)).toBe(intent));

  it('limits automation to the built-in exercise and the declared browser device', () => {
    const originalText = '練習用メモをプレビューしたい';
    expect(browserLearningDevice({ originalText, deviceType: 'SMARTPHONE' })).toBe('mobile');
    expect(browserLearningDevice({ originalText, deviceType: 'PC' })).toBe('desktop');
    expect(browserLearningDevice({ originalText, deviceType: null })).toBeNull();
    expect(browserLearningDevice({ originalText: 'Canvaの操作手順', deviceType: 'PC' })).toBeNull();
  });
});
