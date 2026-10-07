import { describe, expect, it } from 'vitest';
import { parsePilotOperation } from '../src/personal-learning-pilot-operations';
const c = {
  action: 'STOP',
  operationId: '11111111-1111-4111-8111-111111111111',
  expectedStateToken: 'a'.repeat(64),
  confirmation: 'CONFIRM_PILOT_OPERATION',
  reviewEvidenceKey: 'human-review',
};
describe('bounded Pilot operation contract', () => {
  it.each(['STOP', 'START', 'INITIALIZE', 'CREATE_PROGRAM'])('accepts explicit %s', (action) =>
    expect(parsePilotOperation({ ...c, action })).not.toBeNull(),
  );
  it('requires explicit Enrollment references', () => {
    expect(parsePilotOperation({ ...c, action: 'PREPARE_ENROLLMENT' })).toBeNull();
    expect(
      parsePilotOperation({
        ...c,
        action: 'PREPARE_ENROLLMENT',
        groupMembershipId: c.operationId,
        programOfferingId: c.operationId,
      }),
    ).not.toBeNull();
  });
  it.each([
    { ...c, userId: c.operationId },
    { ...c, confirmation: 'automatic' },
    { ...c, expectedStateToken: '' },
    { ...c, reviewEvidenceKey: '' },
    { ...c, action: 'APPROVE' },
    { ...c, action: 'DEPLOY' },
    { ...c, action: ['START'] },
    { ...c, outcome: 'secret body' },
    { ...c, action: 'CREATE_PROGRAM', settings: {} },
    { ...c, action: 'CREATE_PROGRAM', duration: { type: 'FIXED_DAYS', days: 30 } },
    { ...c, action: 'CREATE_PROGRAM', serviceProgramId: c.operationId },
  ])('rejects extra authority, implicit confirmation and out-of-scope action', (input) =>
    expect(parsePilotOperation(input)).toBeNull(),
  );
});
