import { z } from 'zod';

export const INSTRUCTOR_REVIEW_KIND = 'instructor_review';

export const instructorReviewOfferFocus = z.enum(['STRUCTURE', 'CLARITY', 'NEXT_ACTION']);
export const instructorReviewOfferFocusLabel = {
  STRUCTURE: '文章の構成を整理する',
  CLARITY: '読み手に伝わる表現に整える',
  NEXT_ACTION: '相手に求める次の行動を明確にする',
} as const;

export const instructorReviewProduct = z
  .object({
    enabled: z.boolean(),
    programIds: z.array(z.uuid()).max(100),
    priceYen: z.number().int().min(50).max(99_999_999),
    description: z.string().trim().min(1).max(1000),
    responseHours: z
      .number()
      .int()
      .positive()
      .max(24 * 365),
    cancellationTerms: z.string().trim().min(1).max(500),
    instructorUserIds: z.array(z.uuid()).max(100),
    capacity: z.number().int().positive().max(1000),
  })
  .refine(
    (product) =>
      !product.enabled || (product.programIds.length > 0 && product.instructorUserIds.length > 0),
    '受付を開始するには対象プログラムと担当講師を選択してください',
  );

export const instructorReviewApplication = z
  .object({
    assignmentId: z.uuid(),
    productRevision: z.uuid(),
    topicId: z.uuid().nullable(),
    idempotencyKey: z.uuid(),
    focus: z.string().trim().min(1).max(500),
    excerpt: z.string().trim().min(1).max(8000),
  })
  .strict();

export const instructorReviewReply = z
  .object({
    reviewId: z.uuid(),
    answer: z.string().trim().min(1).max(8000),
  })
  .strict();

export type InstructorReviewProduct = z.output<typeof instructorReviewProduct>;
export type InstructorReviewApplication = z.output<typeof instructorReviewApplication>;
export type InstructorReviewStatus =
  | 'PENDING_PAYMENT'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'REFUND_PENDING'
  | 'ANSWERED'
  | 'CANCELLED'
  | 'REFUNDED';

export const instructorReviewOccupiesSlot = [
  'PENDING_PAYMENT',
  'ACCEPTED',
  'IN_PROGRESS',
  'REFUND_PENDING',
] as const;

export const instructorReviewStatusLabel: Record<InstructorReviewStatus, string> = {
  PENDING_PAYMENT: '決済待ち',
  ACCEPTED: '受付済み',
  IN_PROGRESS: '対応中',
  REFUND_PENDING: '返金処理中',
  ANSWERED: '回答済み',
  CANCELLED: '取消済み',
  REFUNDED: '返金済み',
};

export function instructorReviewResponseDueAt(paidAt: Date, responseHours: number): Date {
  return new Date(paidAt.getTime() + responseHours * 60 * 60 * 1000);
}
