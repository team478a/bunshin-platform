export const AI_TRAINING_AI_CONSENT_VERSION = 'AI_TRAINING_EXTERNAL_AI_V1';

export const AI_TRAINING_AI_CONSENT_TEXT = [
  '研修の回答や学習内容は、課題の提案・評価・支援のため外部AIサービスへ送信されます。',
  '氏名、顧客情報、パスワード、社外秘など、送信してはいけない情報は入力しないでください。',
  'AIの回答は誤る場合があります。内容を確認し、ご自身の判断で利用してください。',
  '同意はこの研修Enrollmentに対するものです。同意しない場合、または参加枠がない場合はAI処理を行いません。',
].join('\n');

export type AiTrainingParticipationState =
  'PROGRAM_WAITING' | 'ENROLLMENT_WAITING' | 'SEAT_WAITING' | 'CONSENT_REQUIRED' | 'READY';

export function resolveAiTrainingParticipationState(input: {
  hasProgram: boolean;
  hasEnrollment: boolean;
  hasInternalSeat: boolean;
  hasCurrentConsent: boolean;
}): AiTrainingParticipationState {
  if (!input.hasProgram) return 'PROGRAM_WAITING';
  if (!input.hasEnrollment) return 'ENROLLMENT_WAITING';
  if (!input.hasInternalSeat) return 'SEAT_WAITING';
  if (!input.hasCurrentConsent) return 'CONSENT_REQUIRED';
  return 'READY';
}

/** Preserve the existing destination for every service except AI-training services. */
export function invitationAcceptedPath(serviceSlug: string, isAiTrainingService: boolean) {
  return isAiTrainingService ? `/s/${serviceSlug}/training` : `/s/${serviceSlug}/home`;
}
