import { describe, expect, it, vi } from 'vitest';
import { RecordImprovementFeedback, type ImprovementFeedbackInput } from '../src';
const id = '00000000-0000-4000-8000-000000000001';
const input: ImprovementFeedbackInput = {
  workspaceId: id,
  serviceId: id,
  bunshinId: id,
  actorUserId: id,
  submissionKey: id,
  packageKey: 'SOCIAL',
  category: 'OPERATION',
  surface: 'TODAY',
  impact: 'BLOCKED',
};
describe('common trouble feedback contract', () => {
  it('passes the bounded owner report without inferring BUG or a candidate', async () => {
    const record = vi.fn().mockResolvedValue({ id, createdAt: new Date() });
    await new RecordImprovementFeedback({ record }).execute(input);
    expect(record).toHaveBeenCalledWith(input);
  });
  it.each([
    'workspaceId',
    'serviceId',
    'bunshinId',
    'actorUserId',
    'submissionKey',
    'packageKey',
    'category',
    'surface',
    'impact',
  ] as const)('rejects invalid %s before persistence', (field) => {
    const record = vi.fn();
    expect(() =>
      new RecordImprovementFeedback({ record }).execute({ ...input, [field]: 'invalid' }),
    ).toThrow('invalid improvement feedback');
    expect(record).not.toHaveBeenCalled();
  });
});
