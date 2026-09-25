import { ApplicationError } from '@bunshin/shared';

import type {
  SocialImageGenerationRequestRepository,
  SocialImageStorageObjectKind,
  SocialImageStoragePort,
} from './social-image-generation-contracts';
import { socialImageStorageScope as storageScope } from './social-image-generation-validation';
export class StoreSocialImageMediaFiles {
  constructor(
    private readonly requests: SocialImageGenerationRequestRepository,
    private readonly storage: SocialImageStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    source: { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } | null;
    completed: Uint8Array;
    thumbnail: Uint8Array;
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    if (request.status !== 'COMPOSING')
      throw new ApplicationError('CONFLICT', 'social image generation request is not composing');
    return this.storage.store({
      ...scope,
      source: input.source,
      completed: input.completed,
      thumbnail: input.thumbnail,
    });
  }
}

export class CreateSocialImageMediaReadUrl {
  constructor(
    private readonly requests: SocialImageGenerationRequestRepository,
    private readonly storage: SocialImageStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    kind: SocialImageStorageObjectKind;
    sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
    downloadFilename?: string;
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    const storageInput = {
      ...scope,
      kind: input.kind,
      ...(input.sourceMimeType ? { sourceMimeType: input.sourceMimeType } : {}),
      ...(input.downloadFilename ? { downloadFilename: input.downloadFilename } : {}),
    };
    return this.storage.createReadUrl(storageInput);
  }
}

export class RemoveSocialImageMediaFiles {
  constructor(
    private readonly requests: SocialImageGenerationRequestRepository,
    private readonly storage: SocialImageStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    await this.storage.remove({
      ...scope,
      ...(input.sourceMimeType ? { sourceMimeType: input.sourceMimeType } : {}),
    });
  }
}
