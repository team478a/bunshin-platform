import type {
  BunshinKnowledgeGrant,
  OwnerKnowledge,
  OwnerKnowledgeType,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

import { requiredText } from './application-text-validation';

export interface OwnerKnowledgeRepository {
  create(input: {
    workspaceId: string;
    actorUserId: string;
    type: OwnerKnowledgeType;
    title: string;
    content: string;
  }): Promise<OwnerKnowledge>;
  listOwned(input: { workspaceId: string; actorUserId: string }): Promise<OwnerKnowledge[]>;
  findOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
  }): Promise<OwnerKnowledge | null>;
  updateOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
    title?: string;
    content?: string;
    type?: OwnerKnowledgeType;
  }): Promise<OwnerKnowledge | null>;
  archiveOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
  }): Promise<OwnerKnowledge | null>;
}

export interface KnowledgeGrantRepository {
  grant(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }): Promise<BunshinKnowledgeGrant | null>;
  revoke(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }): Promise<BunshinKnowledgeGrant | null>;
  listGrantedKnowledge(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<OwnerKnowledge[]>;
}

const knowledgeText = (value: string, field: string, maximum: number) =>
  requiredText(value, field, maximum);
export class CreateOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  execute(input: {
    workspaceId: string;
    actorUserId: string;
    type: OwnerKnowledgeType;
    title: string;
    content: string;
  }) {
    return this.repository.create({
      ...input,
      title: knowledgeText(input.title, 'title', 160),
      content: knowledgeText(input.content, 'content', 20000),
    });
  }
}
export class ListOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  execute(input: { workspaceId: string; actorUserId: string }) {
    return this.repository.listOwned(input);
  }
}
export class GetOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; knowledgeId: string }) {
    const value = await this.repository.findOwned(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class UpdateOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
    title?: string;
    content?: string;
    type?: OwnerKnowledgeType;
  }) {
    const normalized = {
      ...input,
      ...(input.title === undefined ? {} : { title: knowledgeText(input.title, 'title', 160) }),
      ...(input.content === undefined
        ? {}
        : { content: knowledgeText(input.content, 'content', 20000) }),
    };
    const value = await this.repository.updateOwned(normalized);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class ArchiveOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; knowledgeId: string }) {
    const value = await this.repository.archiveOwned(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class GrantKnowledgeToBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }) {
    const value = await this.repository.grant(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge grant target not found');
    return value;
  }
}
export class RevokeKnowledgeFromBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }) {
    const value = await this.repository.revoke(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge grant not found');
    return value;
  }
}
export class ListGrantedKnowledgeForBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.repository.listGrantedKnowledge(input);
  }
}
