import 'server-only';
import type {
  PersonalLearningTextPermit,
  SavedPersonalLearningRequest,
  SavedLearningLessonCandidate,
  LearningLessonProposal,
} from '@bunshin/application';
import { validateLearningLessonProposal } from '@bunshin/application';
import { serializeOpenAiTaskRequest } from '../ai/openai-task-compatibility';
import { generateLearningStructured, type LearningPersonaContext } from './openai-learning-lesson';
import {
  LEARNING_CONVERSATION_SAFETY_POLICY,
  learningProposalPolicy,
} from './learning-proposal-policy';

export const LEARNING_CONVERSATION_PROMPT_VERSION =
  'learning-conversation-same-thread-v4-persona-context';
export function learningConversationPromptVersion(extendedScope: boolean) {
  return extendedScope
    ? 'learning-conversation-same-thread-v5-persona-context'
    : LEARNING_CONVERSATION_PROMPT_VERSION;
}
export interface LearningConversationEnvironmentCapture {
  deviceType: 'SMARTPHONE' | 'PC' | 'BOTH' | null;
  toolDescription: string | null;
}
export interface LearningConversationReply {
  status: 'ANSWER' | 'NEEDS_CONTEXT' | 'OUT_OF_SCOPE';
  message: string;
  regeneratedProposal: LearningLessonProposal | null;
  environmentCapture: LearningConversationEnvironmentCapture | null;
}

export function validateLearningConversationReply(value: unknown): LearningConversationReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid reply');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 4 ||
    !['status', 'message', 'regeneratedProposal', 'environmentCapture'].every((key) =>
      Object.hasOwn(v, key),
    ) ||
    !['ANSWER', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'].includes(String(v.status)) ||
    typeof v.message !== 'string' ||
    !v.message.trim() ||
    v.message.length > 2400 ||
    (v.regeneratedProposal !== null &&
      (() => {
        try {
          validateLearningLessonProposal(v.regeneratedProposal);
          return false;
        } catch {
          return true;
        }
      })()) ||
    (v.environmentCapture !== null &&
      (() => {
        if (
          !v.environmentCapture ||
          typeof v.environmentCapture !== 'object' ||
          Array.isArray(v.environmentCapture)
        )
          return true;
        const capture = v.environmentCapture as Record<string, unknown>;
        return (
          Object.keys(capture).length !== 2 ||
          !['deviceType', 'toolDescription'].every((key) => Object.hasOwn(capture, key)) ||
          ![null, 'SMARTPHONE', 'PC', 'BOTH'].includes(capture.deviceType as never) ||
          (capture.toolDescription !== null &&
            (typeof capture.toolDescription !== 'string' ||
              !capture.toolDescription.trim() ||
              capture.toolDescription.length > 240))
        );
      })()) ||
    (v.environmentCapture !== null && v.regeneratedProposal === null)
  )
    throw new Error('invalid reply');
  const capture = v.environmentCapture as Record<string, unknown> | null;
  return {
    status: v.status as LearningConversationReply['status'],
    message: v.message,
    regeneratedProposal:
      v.regeneratedProposal === null ? null : validateLearningLessonProposal(v.regeneratedProposal),
    environmentCapture: capture
      ? {
          deviceType: capture.deviceType as LearningConversationEnvironmentCapture['deviceType'],
          toolDescription: capture.toolDescription as string | null,
        }
      : null,
  };
}

export function learningConversationBody(input: {
  request: SavedPersonalLearningRequest;
  history: readonly { role: 'USER' | 'ASSISTANT'; text: string }[];
  currentMessage: string;
  candidate: SavedLearningLessonCandidate | null;
  practice: {
    startedAt: string;
    outcome: string;
    practice: readonly string[];
    latestNote: string | null;
    latestSubmission: string | null;
    latestSupport: string | null;
  } | null;
  model: string;
  permit: Pick<PersonalLearningTextPermit, 'maxRequestBytes' | 'maxOutputTokens'>;
  extendedScope?: boolean;
  personaContext?: LearningPersonaContext;
}) {
  const proposalPolicy = learningProposalPolicy(input.extendedScope === true);
  const buildBody = (personaContext: LearningPersonaContext) =>
    serializeOpenAiTaskRequest('LEARNING_CONVERSATION', {
      model: input.model,
      store: false,
      max_output_tokens: input.permit.maxOutputTokens,
      input: [
        { role: 'system', content: LEARNING_CONVERSATION_SAFETY_POLICY },
        {
          role: 'system',
          content: `提案を作成・再作成する場合は次の共通提案方針に従ってください。${proposalPolicy.instructions} personaContextは本人の研修内に限った補助情報です。LEARNER_CONFIRMEDは本人が確認した情報、UNCONFIRMED_GUESSはAIによる未確認の推測として扱い、事実と断定せず、本人の現在の希望や発言と矛盾するときは本人の発言を優先してください。personaContextに含まれない拒否・削除済み情報は参照できません。同一テーマの同じ相談スレッドで会話を続け、応答1回に扱うことを1つに絞り、最後に本人が次に試せる小さな一歩を必ず残してください。課題の開始、提出、評価、修了、次の課題への遷移は別の明示操作に委ねてください。教材候補がNEEDS_CONTEXTの場合だけcurrentMessageを確認質問への回答として評価し、十分な根拠があれば同じ共有提案方針に従ってregeneratedProposalを返してください。不足が残る場合はNEEDS_CONTEXTの質問を含む候補を返してください。本人が明示した場合だけ端末とAIツール名をenvironmentCaptureへ返し、推測は禁止です。候補再生成は教材の実行・確定や実践の切替を意味しません。候補がNEEDS_CONTEXTでない場合にregeneratedProposalまたはenvironmentCaptureを返しても、アプリケーションはこれらを適用せずmessageだけを使います。返信は自然な短い日本語の本文にしてください。`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            learningWish: {
              originalText: input.request.originalText,
              deviceType: input.request.deviceType,
              toolDescription: input.request.toolDescription,
              experienceDescription: input.request.experienceDescription,
              currentPosition: input.request.currentPosition,
            },
            history: input.history,
            currentMessage: input.currentMessage,
            candidate: input.candidate
              ? {
                  status: input.candidate.proposal.status,
                  reason: input.candidate.proposal.reason,
                  questions: input.candidate.proposal.questions,
                  outcome: input.candidate.proposal.outcome,
                  practice: input.candidate.proposal.practice,
                }
              : null,
            practice: input.practice,
            personaContext: personaContext.map((item) => ({
              attributeKey: item.attributeKey,
              value: item.value,
              epistemicStatus: item.epistemicStatus,
              evidenceType: item.evidenceType,
              evidenceCreatedAt:
                item.evidenceCreatedAt instanceof Date
                  ? item.evidenceCreatedAt.toISOString()
                  : item.evidenceCreatedAt,
            })),
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'learning_conversation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['ANSWER', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'] },
              message: { type: 'string' },
              regeneratedProposal: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      status: { type: 'string', enum: ['READY', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'] },
                      reason: { type: 'string' },
                      questions: { type: 'array', items: { type: 'string' } },
                      outcome: { type: 'string' },
                      explanation: { type: 'string' },
                      example: { type: 'string' },
                      practice: { type: 'array', items: { type: 'string' } },
                      evidence: { type: 'array', items: { type: 'string' } },
                      criteria: { type: 'array', items: { type: 'string' } },
                    },
                    required: [
                      'status',
                      'reason',
                      'questions',
                      'outcome',
                      'explanation',
                      'example',
                      'practice',
                      'evidence',
                      'criteria',
                    ],
                  },
                  { type: 'null' },
                ],
              },
              environmentCapture: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      deviceType: {
                        type: ['string', 'null'],
                        enum: ['SMARTPHONE', 'PC', 'BOTH', null],
                      },
                      toolDescription: { type: ['string', 'null'] },
                    },
                    required: ['deviceType', 'toolDescription'],
                  },
                  { type: 'null' },
                ],
              },
            },
            required: ['status', 'message', 'regeneratedProposal', 'environmentCapture'],
          },
        },
      },
    });
  let personaContext = [...(input.personaContext ?? [])];
  let body = buildBody(personaContext);
  while (
    Buffer.byteLength(body, 'utf8') > input.permit.maxRequestBytes &&
    personaContext.length > 0
  ) {
    // The repository already sorted confirmed/recent facts first; shed only the lowest priority.
    personaContext = personaContext.slice(0, -1);
    body = buildBody(personaContext);
  }
  if (Buffer.byteLength(body, 'utf8') > input.permit.maxRequestBytes)
    throw new Error('learning conversation request limit exceeded');
  return body;
}

export function generateLearningConversation(options: {
  apiKey: string;
  model: string;
  body: string;
  fetch?: typeof fetch;
}) {
  return generateLearningStructured({ ...options, validate: validateLearningConversationReply });
}
