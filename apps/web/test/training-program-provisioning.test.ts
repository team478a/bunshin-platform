import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiTrainingV1Definition } from '@bunshin/capability-training';
import { createProgramDefinition } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { adoptedProgramSettings } from '../src/services/training-program-definition';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  manager: vi.fn(),
  admin: vi.fn(),
  workspace: vi.fn(),
  templateCreate: vi.fn(),
  versionCreate: vi.fn(),
  versionFind: vi.fn(),
  templateFind: vi.fn(),
  programFind: vi.fn(),
  programCreate: vi.fn(),
  offeringCreate: vi.fn(),
  audit: vi.fn(),
  membership: vi.fn(),
  offeringFind: vi.fn(),
  enrollmentFind: vi.fn(),
  enrollmentCreate: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: async () => ({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: m.manager }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        platformAdmin: { findFirst: m.admin },
        workspace: { findFirst: m.workspace },
        programTemplate: { create: m.templateCreate, findFirst: m.templateFind },
        programTemplateVersion: { create: m.versionCreate, findFirst: m.versionFind },
        serviceProgram: { findFirst: m.programFind, create: m.programCreate },
        programOffering: { create: m.offeringCreate, findFirst: m.offeringFind },
        groupMembership: { findFirst: m.membership },
        programEnrollment: { findFirst: m.enrollmentFind, create: m.enrollmentCreate },
        programAuditLog: { createMany: m.audit, create: m.audit },
      }),
  },
}));
import {
  createOfficialProgramResponse,
  adoptProgramResponse,
  enrollProgramResponse,
} from '../src/http/programs';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const body = {
  workspaceId,
  name: 'マナベルスタイル AI研修',
  description: '実務実践',
  category: 'AI研修',
  targetAudience: 'AI初心者',
  definitionPreset: 'AI_TRAINING_V1',
  standardDurationDays: 30,
  supportModes: ['GUIDED', 'READY_TO_USE'],
};
const adoption = {
  programTemplateVersionId: versionId,
  displayName: body.name,
  description: body.description,
  supportModes: ['GUIDED'],
};
function request(value: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/admin/programs', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'owner' });
  m.manager.mockResolvedValue({ workspaceId, serviceId: 'service' });
  m.admin.mockResolvedValue({ id: 'admin' });
  m.workspace.mockResolvedValue({ id: workspaceId });
  m.templateCreate.mockImplementation(async ({ data }) => ({ id: 'template', ...data }));
  m.versionCreate.mockImplementation(async ({ data }) => ({ id: versionId, ...data }));
  m.versionFind.mockResolvedValue({
    id: versionId,
    programTemplateId: 'template',
    definition: createAiTrainingV1Definition(),
  });
  m.templateFind.mockResolvedValue({ id: 'template' });
  m.programFind.mockResolvedValue(null);
  m.programCreate.mockImplementation(async ({ data }) => ({ id: 'program', ...data }));
  m.offeringCreate.mockImplementation(async ({ data }) => ({ id: 'offering', ...data }));
});

describe('AI training program provisioning', () => {
  it('publishes the existing canonical training definition without provider calls', async () => {
    expect((await createOfficialProgramResponse(request(body))).status).toBe(201);
    expect(m.versionCreate.mock.calls[0][0].data.definition).toEqual(
      createAiTrainingV1Definition(),
    );
    expect(m.versionCreate.mock.calls[0][0].data.status).toBe('PUBLISHED');
    expect(m.audit).toHaveBeenCalledOnce();
  });
  it.each([
    { standardDurationDays: 90 },
    { supportModes: ['IDEA_ONLY'] },
    { moduleKey: 'AI_TRAINING_V1' },
  ])('rejects incompatible training inputs %j', async (override) => {
    expect((await createOfficialProgramResponse(request({ ...body, ...override }))).status).toBe(
      400,
    );
    expect(m.templateCreate).not.toHaveBeenCalled();
  });
  it('requires active platform administrator authority', async () => {
    m.admin.mockResolvedValue(null);
    expect((await createOfficialProgramResponse(request(body))).status).toBe(403);
    expect(m.templateCreate).not.toHaveBeenCalled();
  });
  it('requires a valid active organization', async () => {
    m.workspace.mockResolvedValue(null);
    expect((await createOfficialProgramResponse(request(body))).status).toBe(404);
    expect(m.templateCreate).not.toHaveBeenCalled();
  });
  it('rejects cross-origin creation and anonymous adoption', async () => {
    expect((await createOfficialProgramResponse(request(body, 'https://other.com'))).status).toBe(
      403,
    );
    m.actor.mockResolvedValue(null);
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(401);
    expect(m.programCreate).not.toHaveBeenCalled();
  });
  it('adopts canonical training with invitation-only settings and no Skill exposure configuration', async () => {
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(201);
    expect(m.programCreate.mock.calls[0][0].data.settings).toEqual({
      supportModes: ['GUIDED'],
      participation: 'INVITATION_ONLY',
      moduleKey: 'AI_TRAINING_V1',
    });
    expect(m.offeringCreate.mock.calls[0][0].data.isFree).toBe(true);
    expect(m.audit.mock.calls[0][0].data[0].afterData.settings.moduleKey).toBe('AI_TRAINING_V1');
    expect(m.versionFind.mock.calls[0][0].where).toEqual({
      id: versionId,
      workspaceId,
      status: 'PUBLISHED',
    });
    expect(m.templateFind.mock.calls[0][0].where.OR).toEqual([
      { visibility: 'PLATFORM' },
      { ownerGroupId: 'service' },
    ]);
  });
  it('rejects denied service access', async () => {
    m.manager.mockRejectedValue(new ApplicationError('FORBIDDEN', 'not managed'));
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(403);
    expect(m.programCreate).not.toHaveBeenCalled();
  });
  it('rejects missing or unavailable template versions and duplicate adoption', async () => {
    m.versionFind.mockResolvedValue(null);
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(404);
    m.versionFind.mockResolvedValue({
      id: versionId,
      programTemplateId: 'template',
      definition: createAiTrainingV1Definition(),
    });
    m.templateFind.mockResolvedValue(null);
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(404);
    m.templateFind.mockResolvedValue({ id: 'template' });
    m.programFind.mockResolvedValue({ id: 'existing' });
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(409);
    expect(m.programCreate).not.toHaveBeenCalled();
  });
  it('rejects unsupported modes and changed training definitions before adoption writes', async () => {
    expect(
      (
        await adoptProgramResponse(
          request({ ...adoption, supportModes: ['IDEA_ONLY'] }),
          'manaberu-style',
        )
      ).status,
    ).toBe(400);
    const changed = createAiTrainingV1Definition();
    changed.missions[0]!.title = 'changed';
    m.versionFind.mockResolvedValue({
      id: versionId,
      programTemplateId: 'template',
      definition: changed,
    });
    expect((await adoptProgramResponse(request(adoption), 'manaberu-style')).status).toBe(400);
    expect(m.programCreate).not.toHaveBeenCalled();
  });
  it.each(['SIMPLE', 'SIDE_HUSTLE_90_DAY'] as const)(
    'preserves %s without inferring module from name',
    async (preset) => {
      const definition = createProgramDefinition({
        preset,
        durationDays: preset === 'SIMPLE' ? 30 : 90,
        supportModes: ['GUIDED'],
      });
      expect(adoptedProgramSettings(definition, ['GUIDED'])).toEqual({
        supportModes: ['GUIDED'],
        participation: 'INVITATION_ONLY',
      });
      expect(
        (
          await createOfficialProgramResponse(
            request({
              ...body,
              definitionPreset: preset,
              standardDurationDays: preset === 'SIMPLE' ? 30 : 90,
            }),
          )
        ).status,
      ).toBe(201);
    },
  );
  it('does not depend on JSON object property order', () => {
    const definition = createAiTrainingV1Definition();
    expect(
      adoptedProgramSettings({ ...definition, duration: { days: 30, type: 'FIXED_DAYS' } }, [
        'GUIDED',
      ]).moduleKey,
    ).toBe('AI_TRAINING_V1');
  });
  it('awaits the parsed JSON for manual enrollment and preserves participant-only scope', async () => {
    m.membership.mockResolvedValue({ id: versionId });
    m.programFind.mockResolvedValue({ id: versionId });
    m.offeringFind.mockResolvedValue({
      id: versionId,
      version: 1,
      isFree: true,
      termsSnapshot: { participation: 'INVITATION_ONLY', supportModes: ['GUIDED'] },
    });
    m.enrollmentFind.mockResolvedValue(null);
    m.enrollmentCreate.mockImplementation(async ({ data }) => ({ id: 'enrollment', ...data }));
    const value = {
      groupMembershipId: versionId,
      programOfferingId: versionId,
      supportMode: 'GUIDED',
      goal: '',
    };
    expect((await enrollProgramResponse(request(value), 'manaberu-style', versionId)).status).toBe(
      201,
    );
    expect(m.membership.mock.calls[0][0].where).toMatchObject({
      workspaceId,
      groupId: 'service',
      status: 'ACTIVE',
      serviceRole: 'PARTICIPANT',
    });
    expect(
      (
        await enrollProgramResponse(
          request({ ...value, moduleKey: 'AI_TRAINING_V1' }),
          'manaberu-style',
          versionId,
        )
      ).status,
    ).toBe(400);
    expect(m.enrollmentCreate).toHaveBeenCalledOnce();
  });
});
