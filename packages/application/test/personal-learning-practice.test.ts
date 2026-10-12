import { describe, it, expect } from 'vitest';
import { validatePersonalLearningPracticeNote } from '../src/personal-learning-practice';
describe('practice self-report note', () => {
  it('accepts a short report without assigning completion or skills', () => {
    expect(() =>
      validatePersonalLearningPracticeNote('見出しを直せた。公開はまだしていない', 0),
    ).not.toThrow();
  });
  it.each([
    ['', 0],
    [' ', 0],
    ['報告 ', 0],
    ['a'.repeat(501), 0],
    ['報告', -1],
    ['報告', 1.5],
    ['報告', 1000],
  ] as const)('rejects invalid report/revision (%s, %s)', (text, revision) => {
    expect(() => validatePersonalLearningPracticeNote(text, revision)).toThrow();
  });
});
