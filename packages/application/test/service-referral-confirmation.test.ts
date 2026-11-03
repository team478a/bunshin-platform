import { describe, expect, it } from 'vitest';
import {
  transitionServiceReferralConfirmation,
  type ServiceReferralConfirmation,
  type ServiceReferralConfirmationCommand,
  type ServiceReferralConfirmationProof,
  type ServiceReferralConfirmationPolicy,
} from '../src/index';
const at = new Date('2026-11-02T00:00:00Z');
function setup() {
  const scope = { workspaceId: 'workspace', serviceId: 'service' };
  const current: ServiceReferralConfirmation = {
    scope: { ...scope },
    referralId: 'referral',
    revision: 0,
    state: 'UNASSESSED',
    review: 'UNKNOWN',
    confirmedPolicyVersionId: null,
    confirmedAt: null,
    revokedAt: null,
  };
  const command = {
    scope: { ...scope },
    referralId: 'referral',
    actorUserId: 'manager',
    expectedRevision: 0,
    reason: 'Reviewed existing evidence',
  };
  const policy: ServiceReferralConfirmationPolicy = {
    scope: { ...scope },
    id: 'policy-v1',
    active: true,
  };
  const proof: ServiceReferralConfirmationProof = {
    scope: { ...scope },
    referralId: 'referral',
    policyVersionId: policy.id,
    observedRevision: 0,
    asOf: at.toISOString(),
    decision: 'QUALIFIED',
  };
  const confirm = (): ServiceReferralConfirmationCommand => ({
    ...command,
    kind: 'CONFIRM',
    policy,
    proof,
  });
  const transition = (action: ServiceReferralConfirmationCommand) =>
    transitionServiceReferralConfirmation(current, action, at);
  return { scope, current, command, policy, proof, confirm, transition };
}
describe('common referral confirmation transition', () => {
  it('requires explicit clear review and fixes policy identity/time on first confirmation', () => {
    const s = setup();
    const reviewed = s.transition({ ...s.command, kind: 'REVIEW', review: 'CLEAR' });
    expect(reviewed).toMatchObject({
      changed: true,
      value: { revision: 1, state: 'UNASSESSED', review: 'CLEAR' },
    });
    const confirmed = transitionServiceReferralConfirmation(
      reviewed.value,
      {
        ...s.confirm(),
        expectedRevision: 1,
        kind: 'CONFIRM',
        policy: s.policy,
        proof: { ...s.proof, observedRevision: 1 },
      },
      at,
    );
    expect(confirmed).toMatchObject({
      changed: true,
      value: {
        revision: 2,
        state: 'CONFIRMED',
        confirmedPolicyVersionId: 'policy-v1',
        confirmedAt: at.toISOString(),
        revokedAt: null,
      },
    });
    expect(s.current.review).toBe('UNKNOWN');
  });
  it.each(['UNKNOWN', 'REQUIRED'] as const)('does not confirm %s review', (review) => {
    const s = setup();
    s.current.review = review;
    expect(() => s.transition(s.confirm())).toThrow('referral confirmation conflict');
  });
  it.each(['PENDING', 'UNKNOWN', 'REJECTED', 'REVIEW_REQUIRED', 'SUSPENDED'] as const)(
    'does not confirm %s evaluation',
    (decision) => {
      const s = setup();
      s.current.review = 'CLEAR';
      s.proof.decision = decision;
      expect(() => s.transition(s.confirm())).toThrow('referral confirmation conflict');
    },
  );
  it('does not confirm under a stopped policy', () => {
    const s = setup();
    s.current.review = 'CLEAR';
    s.policy.active = false;
    expect(() => s.transition(s.confirm())).toThrow('referral confirmation conflict');
  });
  it.each([
    'command-scope',
    'command-referral',
    'policy-scope',
    'proof-scope',
    'proof-referral',
    'proof-policy',
    'proof-revision',
    'proof-time',
    'revision',
  ])('rejects mismatched %s', (kind) => {
    const s = setup();
    s.current.review = 'CLEAR';
    const command = s.confirm();
    if (kind === 'command-scope') command.scope.serviceId = 'other';
    if (kind === 'command-referral') command.referralId = 'other';
    if (kind === 'policy-scope') s.policy.scope.workspaceId = 'other';
    if (kind === 'proof-scope') s.proof.scope.serviceId = 'other';
    if (kind === 'proof-referral') s.proof.referralId = 'other';
    if (kind === 'proof-policy') s.proof.policyVersionId = 'other';
    if (kind === 'proof-revision') s.proof.observedRevision = 1;
    if (kind === 'proof-time') s.proof.asOf = new Date(at.getTime() - 1).toISOString();
    if (kind === 'revision') command.expectedRevision = 1;
    expect(() => s.transition(command)).toThrow('referral confirmation conflict');
  });
  it('returns an isolated unchanged value when review already has the requested state', () => {
    const s = setup();
    const result = s.transition({ ...s.command, kind: 'REVIEW', review: 'UNKNOWN' });
    expect(result.changed).toBe(false);
    result.value.scope.serviceId = 'changed';
    expect(s.current.scope.serviceId).toBe('service');
  });
  it('keeps confirmed identity/time on same-policy confirmation and rejects a different version', () => {
    const s = setup();
    s.current.review = 'CLEAR';
    const confirmed = s.transition(s.confirm()).value;
    const retry = {
      ...s.confirm(),
      expectedRevision: confirmed.revision,
      kind: 'CONFIRM' as const,
      policy: s.policy,
      proof: { ...s.proof, observedRevision: confirmed.revision },
    };
    expect(transitionServiceReferralConfirmation(confirmed, retry, at)).toEqual({
      changed: false,
      value: confirmed,
    });
    retry.policy = { ...s.policy, id: 'policy-v2' };
    retry.proof = { ...retry.proof, policyVersionId: 'policy-v2' };
    expect(() => transitionServiceReferralConfirmation(confirmed, retry, at)).toThrow(
      'referral confirmation conflict',
    );
    expect(confirmed.confirmedPolicyVersionId).toBe('policy-v1');
  });
  it('revokes explicitly without changing the confirmed version/time and never restores', () => {
    const s = setup();
    s.current.review = 'CLEAR';
    const confirmed = s.transition(s.confirm()).value;
    const revoke = { ...s.command, expectedRevision: confirmed.revision, kind: 'REVOKE' as const };
    const revoked = transitionServiceReferralConfirmation(confirmed, revoke, at).value;
    expect(revoked).toMatchObject({
      state: 'REVOKED',
      confirmedPolicyVersionId: 'policy-v1',
      confirmedAt: at.toISOString(),
      revokedAt: at.toISOString(),
      revision: 2,
    });
    expect(
      transitionServiceReferralConfirmation(revoked, { ...revoke, expectedRevision: 2 }, at)
        .changed,
    ).toBe(false);
    expect(() =>
      transitionServiceReferralConfirmation(
        revoked,
        {
          ...s.confirm(),
          kind: 'CONFIRM',
          policy: s.policy,
          proof: { ...s.proof, observedRevision: 2 },
          expectedRevision: 2,
        },
        at,
      ),
    ).toThrow('referral confirmation conflict');
  });
  it('does not cancel by changing review or revoke before confirmation', () => {
    const s = setup();
    expect(() => s.transition({ ...s.command, kind: 'REVOKE' })).toThrow(
      'referral confirmation conflict',
    );
    s.current.review = 'CLEAR';
    const confirmed = s.transition(s.confirm()).value;
    expect(() =>
      transitionServiceReferralConfirmation(
        confirmed,
        {
          ...s.command,
          expectedRevision: 1,
          kind: 'REVIEW',
          review: 'REQUIRED',
        },
        at,
      ),
    ).toThrow('referral confirmation conflict');
  });
  it.each([
    'state',
    'review',
    'revision',
    'confirmedAt',
    'revokedAt',
    'confirmedPolicyVersionId',
  ] as const)('rejects malformed stored %s', (key) => {
    const s = setup();
    const values = {
      state: 'INVALID',
      review: 'INVALID',
      revision: -1,
      confirmedAt: '2026',
      revokedAt: at.toISOString(),
      confirmedPolicyVersionId: 'unexpected',
    };
    Reflect.set(s.current, key, values[key]);
    expect(() => s.transition(s.confirm())).toThrow('invalid referral confirmation');
  });
  it.each(['actorUserId', 'reason', 'kind'] as const)('rejects invalid command %s', (key) => {
    const s = setup();
    const command = s.confirm();
    Reflect.set(command, key, '');
    expect(() => s.transition(command)).toThrow('invalid referral confirmation');
  });
  it('does not retain unknown fields or perform authorisation, persistence or grant side effects', () => {
    const s = setup();
    s.current.review = 'CLEAR';
    Reflect.set(s.current, 'privateMetadata', 'SECRET');
    Reflect.set(s.current.scope, 'internal', 'SECRET');
    expect(JSON.stringify(s.transition(s.confirm()))).not.toContain('SECRET');
  });
});
