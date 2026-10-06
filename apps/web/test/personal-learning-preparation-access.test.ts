import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ environment: 'production' }));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: fake.environment }) }));
import {
  personalLearningPreparationAccess,
  recheckPersonalLearningPreparationAccess,
} from '../src/services/personal-learning-preparation-access';
const authority = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
describe('production preparation switches', () => {
  beforeEach(() => {
    fake.environment = 'production';
    vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
  });
  afterEach(() => vi.unstubAllEnvs());
  it('keeps preparation independent of runtime enablement', () => {
    expect(personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN')).toEqual(
      authority,
    );
    expect(personalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION')).toEqual(
      authority,
    );
  });
  it.each(['', '{}', 'null', 'true', '{bad'])(
    'fails closed without a valid explicit production authority',
    (json) => {
      vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', json);
      expect(() =>
        personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN'),
      ).toThrow();
    },
  );
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'refuses enabled execution switch %s',
    (flag) => {
      vi.stubEnv(flag, 'true');
      expect(() =>
        personalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION'),
      ).toThrow();
    },
  );
  it('keeps feature switches and nonproduction behavior', () => {
    vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'false');
    expect(() => personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN')).toThrow();
    fake.environment = 'staging';
    expect(
      personalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION'),
    ).toBeUndefined();
  });
  it('does not treat an unknown environment as nonproduction', () => {
    fake.environment = 'unknown';
    expect(() => personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN')).toThrow();
  });
  it('rechecks after asynchronous work, refusing authority swap and revocation', () => {
    const previous = personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN');
    vi.stubEnv(
      'PERSONAL_LEARNING_PRODUCTION_PREPARATION',
      JSON.stringify({ ...authority, serviceProgramId: authority.groupId }),
    );
    expect(() =>
      recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN', previous),
    ).toThrow();
    vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'false');
    expect(() =>
      recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN', previous),
    ).toThrow();
  });
});
