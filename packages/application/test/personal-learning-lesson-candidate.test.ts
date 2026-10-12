import { describe, it, expect } from 'vitest';
import { validateLearningLessonProposal } from '../src';
const ready = {
  status: 'READY',
  reason: '本人が行う練習',
  questions: [],
  outcome: '店の見出しを自分で直す',
  explanation: '希望をAIへ伝える',
  example: 'お店の特徴を説明する',
  practice: ['自分でAIへ入力する'],
  evidence: ['修正前後の見出し'],
  criteria: ['目的に合う変更を説明できる'],
};
describe('versioned learning proposal', () => {
  it('preserves homepage-specific outcome, without six-skill scores', () =>
    expect(validateLearningLessonProposal(ready)).toEqual(ready));
  it('handles a different wish without theme branches', () =>
    expect(
      validateLearningLessonProposal({ ...ready, outcome: '自分で発表を練習する' }).outcome,
    ).toContain('発表'));
  it('accepts questions without claiming a runnable lesson', () =>
    expect(
      validateLearningLessonProposal({
        status: 'NEEDS_CONTEXT',
        reason: '端末の確認',
        questions: ['使う端末は？'],
        outcome: '',
        explanation: '',
        example: '',
        practice: [],
        evidence: [],
        criteria: [],
      }).status,
    ).toBe('NEEDS_CONTEXT'));
  it.each([
    { ...ready, skills: {} },
    { ...ready, evidence: [] },
    { ...ready, questions: ['何？'] },
    { ...ready, practice: [''] },
    { ...ready, outcome: 'x'.repeat(1201) },
    { ...ready, status: 'NEEDS_CONTEXT' },
    { ...ready, status: 'OUT_OF_SCOPE' },
    { ...ready, status: 'PASS' },
  ])('rejects invalid or overclaiming structure %#', (v) =>
    expect(() => validateLearningLessonProposal(v)).toThrow(),
  );
  it('clones mutable AI input', () => {
    const value = validateLearningLessonProposal(ready);
    value.practice.push('another');
    expect(ready.practice).toHaveLength(1);
  });
});
