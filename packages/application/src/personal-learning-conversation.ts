import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from './personal-learning-persistence';
import { validatePersonalLearningActor } from './personal-learning-persistence';
import type { SavedPersonalLearningRequest } from './personal-learning-request';
import type {
  LearningLessonProposal,
  SavedLearningLessonCandidate,
} from './personal-learning-lesson-candidate';

export const PERSONAL_LEARNING_CONVERSATION_VERSION = 'PERSONAL_LEARNING_CONVERSATION_V1';
export const PERSONAL_LEARNING_CONVERSATION_MAX_MESSAGE_LENGTH = 1200;
export const PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS = 8;
export const PERSONAL_LEARNING_CONVERSATION_CONTEXT_MAX_BYTES = 10_000;
export type PersonalLearningConversationContextMessage = {
  role: 'USER' | 'ASSISTANT';
  text: string;
};
export interface PersonalLearningConversationEnvironmentCapture {
  deviceType: 'SMARTPHONE' | 'PC' | 'BOTH' | null;
  toolDescription: string | null;
}

/** Keeps complete recent exchanges and enforces count + UTF-8 byte limits. */
export function boundPersonalLearningConversationContext(
  exchanges: readonly (readonly PersonalLearningConversationContextMessage[])[],
) {
  const result: PersonalLearningConversationContextMessage[][] = [];
  let bytes = 0;
  for (const exchange of exchanges.slice(-PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS).reverse()) {
    const size = new TextEncoder().encode(JSON.stringify(exchange)).byteLength;
    if (bytes + size > PERSONAL_LEARNING_CONVERSATION_CONTEXT_MAX_BYTES) break;
    result.unshift([...exchange]);
    bytes += size;
  }
  return result.flat();
}

export interface PersonalLearningConversationMessage {
  id: string;
  operationId: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  status: 'PENDING' | 'READY' | 'FAILED';
  createdAt: string;
  promptVersion: string | null;
  responseStatus: 'ANSWER' | 'NEEDS_CONTEXT' | 'OUT_OF_SCOPE' | null;
}

export interface PersonalLearningConversationState {
  threadId: string;
  requestId: string;
  requestRevision: number;
  messages: PersonalLearningConversationMessage[];
  sharedAt: string | null;
}

export interface PersonalLearningConversationCommand {
  actor: PersonalLearningActor;
  requestId: string;
  requestRevision: number;
  operationId: string;
  text: string;
}

export interface PersonalLearningConversationRepository {
  readConversation(actor: PersonalLearningActor): Promise<PersonalLearningConversationState | null>;
  setConversationSharing(input: {
    actor: PersonalLearningActor;
    requestId: string;
    requestRevision: number;
    operationId: string;
    shared: boolean;
  }): Promise<PersonalLearningConversationState>;
  readSharedConversationForOperator(input: {
    workspaceId: string;
    groupId: string;
    programEnrollmentId: string;
    requestId: string;
    operatorUserId: string;
  }): Promise<PersonalLearningConversationState | null>;
  prepareTurn(input: PersonalLearningConversationCommand): Promise<{
    request: PersonalLearningConversationMessage;
    context: readonly { role: 'USER' | 'ASSISTANT'; text: string }[];
    created: boolean;
  }>;
  completeTurn(input: {
    command: PersonalLearningConversationCommand;
    response: string;
    responseStatus: 'ANSWER' | 'NEEDS_CONTEXT' | 'OUT_OF_SCOPE';
    regeneratedCandidate?: {
      expectedCandidateId: string;
      proposal: LearningLessonProposal;
      environmentCapture: PersonalLearningConversationEnvironmentCapture | null;
      toolFeatureSources?: SavedLearningLessonCandidate['toolFeatureSources'];
    };
    promptVersion: string;
    usageKey: string;
  }): Promise<PersonalLearningConversationState>;
  failTurn(input: PersonalLearningConversationCommand): Promise<void>;
}

export function validatePersonalLearningConversationCommand(
  input: PersonalLearningConversationCommand,
): void {
  validatePersonalLearningActor(input.actor);
  const uuid = (value: unknown) =>
    typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  if (
    !uuid(input.requestId) ||
    !uuid(input.operationId) ||
    !Number.isSafeInteger(input.requestRevision) ||
    input.requestRevision < 1 ||
    typeof input.text !== 'string' ||
    input.text !== input.text.trim() ||
    input.text.length < 1 ||
    input.text.length > PERSONAL_LEARNING_CONVERSATION_MAX_MESSAGE_LENGTH
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid learning conversation turn');
}

export function validatePersonalLearningConversationResponse(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > 2400
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid learning conversation response');
  return value;
}

export type PersonalLearningConversationRequest = SavedPersonalLearningRequest;
