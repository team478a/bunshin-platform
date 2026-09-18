import type { ResaleItemStatus, ResaleReactionState } from './index';

const allowedStatusTransitions: Readonly<Record<ResaleItemStatus, readonly ResaleItemStatus[]>> = {
  FOUND: ['PHOTOGRAPHED', 'ARCHIVED'],
  PHOTOGRAPHED: ['LISTED', 'ARCHIVED'],
  LISTED: ['SOLD', 'ARCHIVED'],
  SOLD: ['SHIPPED', 'ARCHIVED'],
  SHIPPED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionResaleItemStatus(from: ResaleItemStatus, to: ResaleItemStatus) {
  return allowedStatusTransitions[from].includes(to);
}

export interface ResaleItemState {
  status: ResaleItemStatus;
  reactionState: ResaleReactionState;
  listedAt: Date | null;
  reactionObservedAt: Date | null;
  lastImprovementType: string | null;
  lastImprovedAt: Date | null;
  soldAt: Date | null;
  soldPriceYen: number | null;
  shippedAt: Date | null;
  reevaluateAt: Date | null;
  archivedAt: Date | null;
}

export interface ResaleItemRecord extends ResaleItemState {
  id: string;
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  groupMembershipId: string;
  ownerUserId: string;
  title: string;
  foundAt: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResaleItemRepository {
  create(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    idempotencyKey: string;
    title: string;
    foundAt: Date;
  }): Promise<{ item: ResaleItemRecord; created: boolean } | null>;
  find(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    itemId: string;
  }): Promise<ResaleItemRecord | null>;
  list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    includeArchived: boolean;
  }): Promise<ResaleItemRecord[] | null>;
  update(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    itemId: string;
    expectedRevision: number;
    title: string;
    state: ResaleItemState;
  }): Promise<ResaleItemRecord | null>;
}

export class ResalePersistenceError extends Error {
  constructor(
    readonly code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'ResalePersistenceError';
  }
}

const validDate = (value: Date | null, field: string) => {
  if (value !== null && Number.isNaN(value.getTime())) {
    throw new ResalePersistenceError('VALIDATION_ERROR', `invalid ${field}`);
  }
};

const requiredText = (value: string, field: string, maxLength: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ResalePersistenceError('VALIDATION_ERROR', `invalid ${field}`);
  }
  return normalized;
};

function validateState(state: ResaleItemState, foundAt: Date) {
  validDate(foundAt, 'foundAt');
  validDate(state.listedAt, 'listedAt');
  validDate(state.reactionObservedAt, 'reactionObservedAt');
  validDate(state.lastImprovedAt, 'lastImprovedAt');
  validDate(state.soldAt, 'soldAt');
  validDate(state.shippedAt, 'shippedAt');
  validDate(state.reevaluateAt, 'reevaluateAt');
  validDate(state.archivedAt, 'archivedAt');
  if ((state.lastImprovementType === null) !== (state.lastImprovedAt === null)) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'incomplete improvement');
  }
  if (state.lastImprovementType !== null) {
    requiredText(state.lastImprovementType, 'lastImprovementType', 80);
  }
  if (
    state.soldPriceYen !== null &&
    (!Number.isInteger(state.soldPriceYen) || state.soldPriceYen < 0)
  ) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'invalid soldPriceYen');
  }
  const listed = state.listedAt !== null;
  const sold = state.soldAt !== null;
  const shipped = state.shippedAt !== null;
  const validLifecycle =
    ((state.status === 'FOUND' || state.status === 'PHOTOGRAPHED') &&
      !listed &&
      !sold &&
      !shipped) ||
    (state.status === 'LISTED' && listed && !sold && !shipped) ||
    (state.status === 'SOLD' && listed && sold && !shipped) ||
    (state.status === 'SHIPPED' && listed && sold && shipped) ||
    state.status === 'ARCHIVED';
  if (!validLifecycle) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'item lifecycle is inconsistent');
  }
  if ((state.status === 'ARCHIVED') !== (state.archivedAt !== null)) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'archive state is inconsistent');
  }
  if (state.reactionState === 'SOLD' && !['SOLD', 'SHIPPED', 'ARCHIVED'].includes(state.status)) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'sold reaction requires sold item');
  }
  if (state.reevaluateAt !== null && state.status !== 'LISTED') {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'reevaluation requires listed item');
  }
  if (state.listedAt !== null && state.listedAt < foundAt) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'listedAt precedes foundAt');
  }
  if (
    state.reactionObservedAt !== null &&
    (state.listedAt === null || state.reactionObservedAt < state.listedAt)
  ) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'reaction precedes listing');
  }
  if (
    state.lastImprovedAt !== null &&
    (state.listedAt === null || state.lastImprovedAt < state.listedAt)
  ) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'improvement precedes listing');
  }
  if (state.soldAt !== null && (state.listedAt === null || state.soldAt < state.listedAt)) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'sale precedes listing');
  }
  if (state.shippedAt !== null && (state.soldAt === null || state.shippedAt < state.soldAt)) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'shipping precedes sale');
  }
}

const sameInstant = (left: Date | null, right: Date | null) => left?.getTime() === right?.getTime();

function validateHistory(current: ResaleItemRecord, state: ResaleItemState) {
  const immutableTimes = [
    ['listedAt', current.listedAt, state.listedAt],
    ['soldAt', current.soldAt, state.soldAt],
    ['shippedAt', current.shippedAt, state.shippedAt],
  ] as const;
  for (const [field, before, after] of immutableTimes) {
    if (before !== null && !sameInstant(before, after)) {
      throw new ResalePersistenceError('VALIDATION_ERROR', `${field} cannot be rewritten`);
    }
  }
  if (current.status === state.status && state.status !== 'ARCHIVED') {
    for (const [field, before, after] of immutableTimes) {
      if (!sameInstant(before, after)) {
        throw new ResalePersistenceError(
          'VALIDATION_ERROR',
          `${field} requires a status transition`,
        );
      }
    }
  }
  if (state.status === 'ARCHIVED') {
    if (
      !sameInstant(current.listedAt, state.listedAt) ||
      !sameInstant(current.soldAt, state.soldAt) ||
      !sameInstant(current.shippedAt, state.shippedAt) ||
      state.reactionState !== current.reactionState ||
      state.reevaluateAt !== null
    ) {
      throw new ResalePersistenceError('VALIDATION_ERROR', 'archive must preserve item history');
    }
  }
}

export class ResaleItemService {
  constructor(private readonly repository: ResaleItemRepository) {}

  async create(input: Parameters<ResaleItemRepository['create']>[0]) {
    validDate(input.foundAt, 'foundAt');
    const result = await this.repository.create({
      ...input,
      title: requiredText(input.title, 'title', 160),
      idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey', 200),
    });
    if (result === null)
      throw new ResalePersistenceError('NOT_FOUND', 'active enrollment not found');
    return result;
  }

  async find(input: Parameters<ResaleItemRepository['find']>[0]) {
    const item = await this.repository.find(input);
    if (item === null) throw new ResalePersistenceError('NOT_FOUND', 'resale item not found');
    return item;
  }

  async list(input: Parameters<ResaleItemRepository['list']>[0]) {
    const items = await this.repository.list(input);
    if (items === null)
      throw new ResalePersistenceError('NOT_FOUND', 'active enrollment not found');
    return items;
  }

  async update(input: Parameters<ResaleItemRepository['update']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new ResalePersistenceError('VALIDATION_ERROR', 'invalid expectedRevision');
    }
    const current = await this.repository.find(input);
    if (current === null) throw new ResalePersistenceError('NOT_FOUND', 'resale item not found');
    if (
      current.status !== input.state.status &&
      !canTransitionResaleItemStatus(current.status, input.state.status)
    ) {
      throw new ResalePersistenceError('VALIDATION_ERROR', 'invalid item status transition');
    }
    validateState(input.state, current.foundAt);
    validateHistory(current, input.state);
    const updated = await this.repository.update({
      ...input,
      title: requiredText(input.title, 'title', 160),
      state: {
        ...input.state,
        lastImprovementType:
          input.state.lastImprovementType === null
            ? null
            : requiredText(input.state.lastImprovementType, 'lastImprovementType', 80),
      },
    });
    if (updated === null) {
      throw new ResalePersistenceError('CONFLICT', 'resale item was updated concurrently');
    }
    return updated;
  }
}
