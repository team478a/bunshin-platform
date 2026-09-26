import { FORTUNE_THEMES, type FortuneTheme } from './fortune-definition';
import { type FortuneReadingOutput, validateFortuneReadingOutput } from './fortune-knowledge';
import { FortunePolicyError } from './fortune-policy-error';
import { drawTarotCard, type FortuneOrientation, type SecureRandomSource } from './tarot';

export type FortuneReadingState = 'GENERATING' | 'READY_AI' | 'READY_BASIC' | 'FAILED' | 'DELETED';

export const FORTUNE_FEEDBACK_RATINGS = ['HELPFUL', 'SOMEWHAT', 'NOT_HELPFUL'] as const;
export type FortuneFeedbackRating = (typeof FORTUNE_FEEDBACK_RATINGS)[number];
export const FORTUNE_FEEDBACK_ISSUES = [
  'TOO_VAGUE',
  'HARD_TO_UNDERSTAND',
  'UNCOMFORTABLE',
  'OTHER',
] as const;
export type FortuneFeedbackIssue = (typeof FORTUNE_FEEDBACK_ISSUES)[number];

export interface FortuneReadingView {
  id: string;
  localDate: string;
  theme: FortuneTheme;
  cardCode: string;
  cardNameJa: string;
  orientation: FortuneOrientation;
  status: FortuneReadingState;
  title: string | null;
  body: string | null;
  actionStep: string | null;
  feedbackRating: FortuneFeedbackRating | null;
  feedbackIssue: FortuneFeedbackIssue | null;
  createdAt: Date;
}

export interface FortuneParticipantView {
  id: string;
  ageConfirmedAt: Date;
}

export type CreateFortuneReadingResult =
  | { kind: 'READY'; reading: FortuneReadingView }
  | { kind: 'NOT_AVAILABLE' }
  | { kind: 'NOT_PARTICIPANT' }
  | { kind: 'KNOWLEDGE_NOT_READY' };

export interface FortuneAiGenerationClaim {
  workspaceId: string;
  groupId: string;
  bunshinId: string;
  reading: FortuneReadingView;
}

export interface FortuneAiReadingResult extends FortuneReadingOutput {
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface FortuneAiReadingGenerator {
  generate(input: {
    serviceSlug: string;
    actorUserId: string;
    claim: FortuneAiGenerationClaim;
  }): Promise<FortuneAiReadingResult>;
}

export interface FortuneRepository {
  joinParticipant(input: {
    serviceSlug: string;
    actorUserId: string;
    ageConfirmedAt: Date;
  }): Promise<FortuneParticipantView | null>;
  findParticipant(input: {
    serviceSlug: string;
    actorUserId: string;
  }): Promise<FortuneParticipantView | null>;
  findReadingForDate(input: {
    serviceSlug: string;
    actorUserId: string;
    localDate: string;
  }): Promise<FortuneReadingView | null>;
  createBasicReading(input: {
    serviceSlug: string;
    actorUserId: string;
    localDate: string;
    theme: FortuneTheme;
    cardCode: string;
    orientation: FortuneOrientation;
  }): Promise<CreateFortuneReadingResult>;
  claimAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneAiGenerationClaim | null>;
  completeAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    output: FortuneAiReadingResult;
  }): Promise<FortuneReadingView | null>;
  fallbackAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    failureCode: string;
  }): Promise<FortuneReadingView | null>;
  listReadings(input: {
    serviceSlug: string;
    actorUserId: string;
    limit: number;
  }): Promise<FortuneReadingView[] | null>;
  findReading(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneReadingView | null>;
  markReadingViewed(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    viewedAt: Date;
  }): Promise<FortuneReadingView | null>;
  submitFeedback(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    rating: FortuneFeedbackRating;
    issue: FortuneFeedbackIssue | null;
    submittedAt: Date;
  }): Promise<FortuneReadingView | null>;
  deleteReading(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    deletedAt: Date;
  }): Promise<boolean>;
}

export class FortuneDailyReadingService {
  constructor(
    private readonly repository: FortuneRepository,
    private readonly random: SecureRandomSource,
    private readonly aiGenerator?: FortuneAiReadingGenerator,
  ) {}

  async join(input: {
    serviceSlug: string;
    actorUserId: string;
    ageConfirmed: boolean;
    now?: Date;
  }) {
    if (!input.ageConfirmed)
      throw new FortunePolicyError('NOT_PARTICIPANT', '18歳以上の確認が必要です');
    const participant = await this.repository.joinParticipant({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      ageConfirmedAt: input.now ?? new Date(),
    });
    if (!participant) throw new FortunePolicyError('NOT_AVAILABLE', '占いサービスを利用できません');
    return participant;
  }

  async today(input: {
    serviceSlug: string;
    actorUserId: string;
    now?: Date;
    recordView?: boolean;
  }) {
    const participant = await this.repository.findParticipant(input);
    if (!participant) return { participant: null, reading: null };
    const reading = await this.repository.findReadingForDate({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      localDate: toJapanLocalDate(input.now ?? new Date()),
    });
    const visible =
      input.recordView && reading && reading.status !== 'DELETED'
        ? await this.repository.markReadingViewed({
            serviceSlug: input.serviceSlug,
            actorUserId: input.actorUserId,
            readingId: reading.id,
            viewedAt: input.now ?? new Date(),
          })
        : reading;
    return { participant, reading: visible ?? reading };
  }

  async draw(input: { serviceSlug: string; actorUserId: string; theme: unknown; now?: Date }) {
    const localDate = toJapanLocalDate(input.now ?? new Date());
    const existing = await this.repository.findReadingForDate({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      localDate,
    });
    if (existing) return existing;
    const theme = parseFortuneTheme(input.theme);
    const draw = drawTarotCard(this.random);
    const result = await this.repository.createBasicReading({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      localDate,
      theme,
      cardCode: draw.card.code,
      orientation: draw.orientation,
    });
    if (result.kind === 'READY') {
      if (!this.aiGenerator) return result.reading;
      const claim = await this.repository.claimAiGeneration({
        serviceSlug: input.serviceSlug,
        actorUserId: input.actorUserId,
        readingId: result.reading.id,
      });
      if (!claim) return result.reading;
      try {
        const generated = await this.aiGenerator.generate({
          serviceSlug: input.serviceSlug,
          actorUserId: input.actorUserId,
          claim,
        });
        const safe = validateFortuneReadingOutput(generated);
        return (
          (await this.repository.completeAiGeneration({
            serviceSlug: input.serviceSlug,
            actorUserId: input.actorUserId,
            readingId: result.reading.id,
            output: { ...generated, ...safe },
          })) ?? result.reading
        );
      } catch (error) {
        const fallback = await this.repository.fallbackAiGeneration({
          serviceSlug: input.serviceSlug,
          actorUserId: input.actorUserId,
          readingId: result.reading.id,
          failureCode:
            error instanceof FortunePolicyError &&
            ['INVALID_READING_OUTPUT', 'UNSAFE_READING_OUTPUT'].includes(error.code)
              ? 'AI_OUTPUT_REJECTED'
              : 'AI_GENERATION_FAILED',
        });
        return fallback ?? result.reading;
      }
    }
    if (result.kind === 'NOT_PARTICIPANT')
      throw new FortunePolicyError('NOT_PARTICIPANT', '占いへの参加確認が必要です');
    if (result.kind === 'KNOWLEDGE_NOT_READY')
      throw new FortunePolicyError('KNOWLEDGE_NOT_READY', '占いの解釈を準備しています');
    throw new FortunePolicyError('NOT_AVAILABLE', '占いサービスを利用できません');
  }

  async history(input: { serviceSlug: string; actorUserId: string; limit?: number }) {
    const readings = await this.repository.listReadings({
      ...input,
      limit: Math.min(Math.max(input.limit ?? 90, 1), 90),
    });
    if (!readings) throw new FortunePolicyError('NOT_PARTICIPANT', '占いへの参加確認が必要です');
    return readings;
  }

  async reading(input: { serviceSlug: string; actorUserId: string; readingId: string }) {
    const existing = await this.repository.findReading(input);
    const reading = existing
      ? await this.repository.markReadingViewed({
          ...input,
          viewedAt: new Date(),
        })
      : null;
    if (!reading) throw new FortunePolicyError('READING_NOT_FOUND', '占い結果が見つかりません');
    return reading;
  }

  async feedback(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    rating: FortuneFeedbackRating;
    issue: FortuneFeedbackIssue | null;
    now?: Date;
  }) {
    if (input.issue && input.rating !== 'NOT_HELPFUL')
      throw new FortunePolicyError(
        'INVALID_FEEDBACK',
        '気になった理由は「今回は違った」を選んだ場合だけ保存できます',
      );
    const reading = await this.repository.submitFeedback({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      readingId: input.readingId,
      rating: input.rating,
      issue: input.issue,
      submittedAt: input.now ?? new Date(),
    });
    if (!reading) throw new FortunePolicyError('READING_NOT_FOUND', '占い結果が見つかりません');
    return reading;
  }

  async delete(input: { serviceSlug: string; actorUserId: string; readingId: string; now?: Date }) {
    const deleted = await this.repository.deleteReading({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      readingId: input.readingId,
      deletedAt: input.now ?? new Date(),
    });
    if (!deleted) throw new FortunePolicyError('READING_NOT_FOUND', '占い結果が見つかりません');
  }
}

export function parseFortuneTheme(value: unknown): FortuneTheme {
  if (typeof value !== 'string' || !FORTUNE_THEMES.includes(value as FortuneTheme)) {
    throw new FortunePolicyError('INVALID_THEME', '占いテーマを選んでください');
  }
  return value as FortuneTheme;
}

export function toJapanLocalDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}
