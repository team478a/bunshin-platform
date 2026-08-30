import { describe, expect, it } from 'vitest';
import {
  ServiceFoundationService,
  type ServiceFoundationRecord,
  type ServiceFoundationRepository,
} from '../src';

const record: ServiceFoundationRecord = {
  id: 'service-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  slug: 'side-job-support',
  displayName: '投稿副業サポート',
  description: 'SNS初心者向けの投稿支援',
  operatorName: 'ワタシワークス運営事務局',
  contactEmail: null,
  visibility: 'PRIVATE',
  poweredByEnabled: true,
  startsAt: null,
  endsAt: null,
  termsUrl: 'https://example.jp/terms',
  privacyUrl: 'https://example.jp/privacy',
  brand: {
    logoUrl: null,
    iconUrl: null,
    faviconUrl: null,
    primaryColor: '#0B356A',
    secondaryColor: '#FF3B30',
    fontFamily: 'system-ui',
  },
  registration: {
    mode: 'INVITATION_ONLY',
    emailEnabled: true,
    lineEnabled: false,
    inviteCodeEnabled: false,
    referralEnabled: false,
    onboardingConfig: {},
    surveyConfig: {},
  },
};

const repository = (save: ServiceFoundationRepository['save']): ServiceFoundationRepository => ({
  create: (input) => save({ ...input, groupId: record.groupId }),
  save,
  findByGroup: () => Promise.resolve(record),
  findPublicBySlug: () => Promise.resolve(record),
});

describe('ServiceFoundationService', () => {
  it('normalizes a safe configuration and preserves Group as the service boundary', async () => {
    let captured: Parameters<ServiceFoundationRepository['save']>[0] | null = null;
    const service = new ServiceFoundationService(
      repository((input) => {
        captured = input;
        return Promise.resolve(record);
      }),
    );

    await service.save({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'user-1',
      reason: ' 第一号サービスの初期設定 ',
      configuration: {
        ...record,
        displayName: ' 投稿副業サポート ',
        brand: { ...record.brand, primaryColor: '#0b356a' },
      },
    });

    expect(captured).toMatchObject({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      reason: '第一号サービスの初期設定',
      configuration: { displayName: '投稿副業サポート', brand: { primaryColor: '#0B356A' } },
    });
  });

  it.each([
    { name: 'unsafe slug', patch: { slug: 'Bad Slug' } },
    { name: 'http legal URL', patch: { termsUrl: 'http://example.jp/terms' } },
    {
      name: 'open redirect style legal URL',
      patch: { termsUrl: 'https://example.jp/terms?next=https://evil.example' },
    },
  ])('rejects $name', async ({ patch }) => {
    const service = new ServiceFoundationService(repository(() => Promise.resolve(record)));
    await expect(
      service.save({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'user-1',
        reason: '初期設定を保存する',
        configuration: { ...record, ...patch },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires email or LINE for registration', async () => {
    const service = new ServiceFoundationService(repository(() => Promise.resolve(record)));
    await expect(
      service.save({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'user-1',
        reason: '登録方法を変更する',
        configuration: {
          ...record,
          registration: { ...record.registration, emailEnabled: false, lineEnabled: false },
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
