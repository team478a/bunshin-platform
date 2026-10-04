import { describe, expect, it } from 'vitest';
import { projectHassyPhotoQuality } from '../src/improvement-photo-quality';

const input = {
  hasPhotoMetadata: true,
  status: 'SUCCEEDED',
  verdict: 'PASS',
  score: 90,
  issueCodes: [] as string[],
  repairCount: 0,
  updatedAt: new Date('2026-09-02Z'),
  cutoff: new Date('2026-10-01Z'),
  promptVersion: 'mission-content-variant-v1',
};
describe('Hassy photo quality projection', () => {
  it('attributes pre-quality failures from the recorded initiating route, never from key guesses', () => {
    const failed = {
      ...input,
      hasPhotoMetadata: false,
      status: 'FAILED',
      verdict: null,
      score: null,
    };
    expect(projectHassyPhotoQuality({ ...failed, initiatingSource: 'PHOTO_FIRST' })).toMatchObject({
      attribution: 'PHOTO_STARTED',
      qualityState: 'UNCHECKED',
    });
    expect(projectHassyPhotoQuality({ ...failed, initiatingSource: 'STANDARD' }).attribution).toBe(
      'STANDARD_STARTED',
    );
    expect(projectHassyPhotoQuality({ ...failed, initiatingSource: null }).attribution).toBe(
      'UNATTRIBUTED',
    );
  });
  it('labels the saved prompt as a recorded last stage, not necessarily the generator version', () => {
    expect(
      projectHassyPhotoQuality({
        ...input,
        promptVersion: 'mission-quality-checker-v13-photo-first-grounding',
      }).recordedPromptVersion,
    ).toBe('QUALITY_V13');
  });
  it('does not interpret incomplete verdict/score pairing as unchecked', () => {
    expect(projectHassyPhotoQuality({ ...input, verdict: null }).qualityState).toBe('INVALID');
  });
  it.each([
    { verdict: 'PASS', repairCount: 0, status: 'SUCCEEDED', expected: 'PASS' },
    { verdict: 'PASS', repairCount: 1, status: 'SUCCEEDED', expected: 'REPAIRED_PASS' },
    { verdict: 'REVISE', repairCount: 1, status: 'FAILED', expected: 'FINAL_REVISE' },
    { verdict: 'REJECT', repairCount: 0, status: 'FAILED', expected: 'FINAL_REJECT' },
    { verdict: null, repairCount: 0, status: 'FAILED', expected: 'UNCHECKED' },
    { verdict: null, repairCount: 0, status: 'PROCESSING', expected: 'PENDING' },
  ])('separates $expected without equating quality with generation success', (row) => {
    expect(
      projectHassyPhotoQuality({ ...input, ...row, score: row.verdict ? 90 : null }).qualityState,
    ).toBe(row.expected);
  });
  it('keeps an unknown code and prompt as counts/unavailable, not free text', () => {
    const projected = projectHassyPhotoQuality({
      ...input,
      hasPhotoMetadata: false,
      issueCodes: ['private-secret'],
      promptVersion: 'secret-model',
    });
    expect(projected).toMatchObject({
      attribution: 'UNATTRIBUTED',
      unknownIssueCount: 1,
      recordedPromptVersion: 'UNAVAILABLE',
    });
    expect(JSON.stringify(projected)).not.toContain('secret');
  });
  it('treats a Photo First issue code as a signal only, not provenance', () => {
    expect(
      projectHassyPhotoQuality({
        ...input,
        hasPhotoMetadata: false,
        issueCodes: ['PHOTO_FIRST_UNCONFIRMED_FACT'],
      }),
    ).toMatchObject({ attribution: 'PHOTO_ISSUE_SIGNAL', unconfirmedFact: true });
  });
  it.each([-1, 2])(
    'keeps invalid repair count %s out of safe metadata instead of replacing it by zero',
    (repairCount) => {
      const projected = projectHassyPhotoQuality({ ...input, repairCount });
      expect(projected.qualityState).toBe('INVALID');
      expect(projected).not.toHaveProperty('repairCount');
    },
  );
  it.each([-1, 101, null])('marks invalid score %s separately', (score) => {
    expect(projectHassyPhotoQuality({ ...input, score }).qualityState).toBe('INVALID');
  });
  it('does not treat current completion at the exclusive cutoff as historical quality', () => {
    expect(projectHassyPhotoQuality({ ...input, updatedAt: input.cutoff }).qualityState).toBe(
      'AFTER_CUTOFF',
    );
  });
});
