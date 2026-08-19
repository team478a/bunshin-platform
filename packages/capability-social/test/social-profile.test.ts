import { describe, expect, it } from 'vitest';
import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import {
  ActivateSocialProfile,
  CreateSocialProfile,
  DeactivateSocialProfile,
  ListSocialProfiles,
  normalizeCreateSocialProfileInput,
  parsePreferredFormats,
  type SocialProfile,
  type SocialProfileRepository,
} from '../src';

const now = new Date('2026-08-19T00:00:00.000Z');
const base = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  platform: 'INSTAGRAM' as const,
};

class AssignmentRepository implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED') {}
  assign() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  find() {
    if (this.status === 'MISSING') return Promise.resolve(null);
    return Promise.resolve({
      id: 'assignment-1',
      workspaceId: base.workspaceId,
      bunshinId: base.bunshinId,
      capabilityType: 'SOCIAL' as const,
      status: this.status,
      config: {},
      assignedByUserId: base.actorUserId,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  setStatus() {
    return Promise.resolve(null);
  }
}

class ProfileRepository implements SocialProfileRepository {
  value: SocialProfile | null = null;
  create(input: Parameters<SocialProfileRepository['create']>[0]) {
    this.value = {
      id: 'profile-1',
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      platform: input.platform,
      handle: input.handle ?? null,
      profileUrl: input.profileUrl ?? null,
      purpose: input.purpose,
      postingFrequency: input.postingFrequency,
      preferredFormats: input.preferredFormats,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    return Promise.resolve(this.value);
  }
  list() {
    return Promise.resolve(this.value === null ? [] : [this.value]);
  }
  findByPlatform() {
    return Promise.resolve(this.value);
  }
  update() {
    return Promise.resolve(this.value);
  }
  setActive(input: Parameters<SocialProfileRepository['setActive']>[0]) {
    if (this.value === null) return Promise.resolve(null);
    this.value = { ...this.value, status: input.active ? 'ACTIVE' : 'INACTIVE' };
    return Promise.resolve(this.value);
  }
}

describe('SocialProfile', () => {
  it('normalizes manual profile input and validates HTTPS URLs', () => {
    expect(
      normalizeCreateSocialProfileInput({
        ...base,
        handle: '  bunshin  ',
        profileUrl: ' https://example.com/bunshin ',
        purpose: '  発信目的  ',
        postingFrequency: 'WEEKLY',
        preferredFormats: ['SLIDE', 'IMAGE'],
      }),
    ).toMatchObject({
      handle: 'bunshin',
      profileUrl: 'https://example.com/bunshin',
      purpose: '発信目的',
    });
    expect(() =>
      normalizeCreateSocialProfileInput({
        ...base,
        profileUrl: 'http://example.com',
        purpose: 'purpose',
        postingFrequency: 'WEEKLY',
        preferredFormats: ['SLIDE'],
      }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('rejects empty, duplicate, and unknown preferred formats', () => {
    for (const value of [[], ['SLIDE', 'SLIDE'], ['UNKNOWN']]) {
      expect(() => parsePreferredFormats(value)).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    }
  });

  it.each(['MISSING', 'SUSPENDED', 'LOCKED'] as const)(
    'denies mutation when SOCIAL assignment is %s',
    async (status) => {
      const profiles = new ProfileRepository();
      await expect(
        new CreateSocialProfile(profiles, new AssignmentRepository(status)).execute({
          ...base,
          purpose: 'purpose',
          postingFrequency: 'WEEKLY',
          preferredFormats: ['SLIDE'],
        }),
      ).rejects.toMatchObject({ code: status === 'MISSING' ? 'NOT_FOUND' : 'FORBIDDEN' });
      expect(profiles.value).toBeNull();
    },
  );

  it('creates and changes profile state only with an active assignment', async () => {
    const profiles = new ProfileRepository();
    const assignments = new AssignmentRepository('ACTIVE');
    await new CreateSocialProfile(profiles, assignments).execute({
      ...base,
      purpose: 'purpose',
      postingFrequency: 'WEEKLY',
      preferredFormats: ['SLIDE'],
    });
    await expect(
      new DeactivateSocialProfile(profiles, assignments).execute(base),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
    await expect(
      new ActivateSocialProfile(profiles, assignments).execute(base),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('distinguishes an inaccessible Bunshin from an empty profile list', async () => {
    await expect(
      new ListSocialProfiles({
        create: () => Promise.resolve(null),
        list: () => Promise.resolve(null),
        findByPlatform: () => Promise.resolve(null),
        update: () => Promise.resolve(null),
        setActive: () => Promise.resolve(null),
      }).execute(base),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(new ListSocialProfiles(new ProfileRepository()).execute(base)).resolves.toEqual(
      [],
    );
  });
});
