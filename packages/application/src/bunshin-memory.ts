import type { BunshinMemory, BunshinMemoryType } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

import { requiredText } from './application-text-validation';

export interface BunshinMemoryRepository {
  create(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    type: BunshinMemoryType;
    content: string;
    summary?: string | null;
    confidence: number;
    importance: number;
  }): Promise<BunshinMemory | null>;
  list(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    includeInactive?: boolean;
  }): Promise<BunshinMemory[]>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }): Promise<BunshinMemory | null>;
  update(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    type?: BunshinMemoryType;
    content?: string;
    summary?: string | null;
    confidence?: number;
    importance?: number;
  }): Promise<BunshinMemory | null>;
  setActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    active: boolean;
  }): Promise<BunshinMemory | null>;
  softDelete(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }): Promise<BunshinMemory | null>;
}
function validateMemoryValues(input: {
  content: string;
  summary?: string | null;
  confidence: number;
  importance: number;
}) {
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    throw new ApplicationError('VALIDATION_ERROR', 'confidence must be between 0 and 1');
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5)
    throw new ApplicationError('VALIDATION_ERROR', 'importance must be between 1 and 5');
  return {
    content: requiredText(input.content, 'content', 20000),
    summary: input.summary == null ? null : requiredText(input.summary, 'summary', 1000),
    confidence: input.confidence,
    importance: input.importance,
  };
}
export class CreateBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    type: BunshinMemoryType;
    content: string;
    summary?: string | null;
    confidence: number;
    importance: number;
  }) {
    const value = await this.repository.create({ ...input, ...validateMemoryValues(input) });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}
export class ListBunshinMemories {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    includeInactive?: boolean;
  }) {
    return this.repository.list(input);
  }
}
export class GetBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }) {
    const value = await this.repository.find(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class UpdateBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    type?: BunshinMemoryType;
    content?: string;
    summary?: string | null;
    confidence?: number;
    importance?: number;
  }) {
    const normalized = {
      ...input,
      ...(input.content === undefined
        ? {}
        : { content: requiredText(input.content, 'content', 20000) }),
      ...(input.summary === undefined
        ? {}
        : {
            summary: input.summary === null ? null : requiredText(input.summary, 'summary', 1000),
          }),
    };
    if (
      input.confidence !== undefined &&
      (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'confidence must be between 0 and 1');
    if (
      input.importance !== undefined &&
      (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'importance must be between 1 and 5');
    const value = await this.repository.update(normalized);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class SetBunshinMemoryActive {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    active: boolean;
  }) {
    const value = await this.repository.setActive(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class DeleteBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }) {
    const value = await this.repository.softDelete(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
