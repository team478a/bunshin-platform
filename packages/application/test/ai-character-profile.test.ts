import { describe, expect, it, vi } from 'vitest';
import {
  AiCharacterProfileService,
  type AiCharacterProfileRepository,
} from '../src/ai-character-profile';

const repository = () => {
  const mocks = {
    createProfile: vi.fn<AiCharacterProfileRepository['createProfile']>(),
    createLicenseVersion: vi.fn<AiCharacterProfileRepository['createLicenseVersion']>(),
    createVersion: vi.fn<AiCharacterProfileRepository['createVersion']>(),
    addReferenceAsset: vi.fn<AiCharacterProfileRepository['addReferenceAsset']>(),
  };
  return { repo: mocks satisfies AiCharacterProfileRepository, mocks };
};

describe('AiCharacterProfileService', () => {
  it('does not allow a platform character to have a service owner', async () => {
    const { repo, mocks } = repository();
    await expect(
      new AiCharacterProfileService(repo).createProfile({
        workspaceId: 'w',
        groupId: 'g',
        ownerUserId: null,
        actorUserId: 'u',
        scope: 'PLATFORM',
        name: 'キャラクター',
        description: '説明',
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.createProfile).not.toHaveBeenCalled();
  });
  it('requires safety rules before publishing a prompt version', async () => {
    const { repo, mocks } = repository();
    await expect(
      new AiCharacterProfileService(repo).createVersion({
        workspaceId: 'w',
        groupId: 'g',
        actorUserId: 'u',
        characterProfileId: 'c',
        licenseVersionId: 'l',
        appearance: '外見',
        worldSetting: '世界観',
        basePrompt: '生成指示',
        negativePrompt: '禁止',
        safetyRules: [],
        publish: true,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });
  it('rejects unsafe or oversized reference images', async () => {
    const { repo, mocks } = repository();
    await expect(
      new AiCharacterProfileService(repo).addReferenceAsset({
        workspaceId: 'w',
        groupId: 'g',
        actorUserId: 'u',
        characterProfileVersionId: 'v',
        originalFilename: 'face.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: 21_000_000,
        sha256: 'a'.repeat(64),
        rightsConfirmedAt: new Date(),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.addReferenceAsset).not.toHaveBeenCalled();
  });
});
