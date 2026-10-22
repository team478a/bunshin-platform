import type { PersonalLearningOfferPolicy } from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

export const AI_TRAINING_AI_CONSENT_VERSION = 'AI_TRAINING_EXTERNAL_AI_V3';

export const AI_TRAINING_AI_CONSENT_TEXT = [
  '研修の回答や学習内容は、課題の提案・評価・支援のため外部AIサービスへ送信されます。',
  '氏名、顧客情報、パスワード、社外秘など、送信してはいけない情報は入力しないでください。',
  'AIの回答は誤る場合があります。内容を確認し、ご自身の判断で利用してください。',
  '学習の状況に合わせてAIがLINEで声をかける場合があります。声かけはいつでも停止でき、学習そのものは続けられます。',
  'この同意は、この研修への参加に対するものです。同意しない場合、または参加枠がない場合は、AIを使った処理は行いません。',
].join('\n');

const AI_SKILL_COPY = {
  pageTitle: 'AI研修への参加',
  checkboxLabel: 'この研修で、外部のAIサービスを使うことに同意します',
  submitLabel: '同意して研修へ進む',
  continueLabel: '研修を続ける',
  states: {
    PROGRAM_WAITING: {
      title: '研修プログラムの準備中です',
      message: '運営が研修プログラムを準備しています。準備ができると、この画面から確認できます。',
    },
    ENROLLMENT_WAITING: {
      title: '研修参加の準備待ちです',
      message:
        'サービスへの参加は完了しています。運営が研修Enrollmentと参加枠を準備すると、ここに表示されます。',
    },
    SEAT_WAITING: {
      title: '研修参加枠の準備待ちです',
      message:
        '運営があなたのEnrollmentに内部テスター枠を付与しています。枠が確認されるまでAI処理は行われません。',
    },
    CONSENT_REQUIRED: {
      title: '研修参加の確認',
      message:
        '参加枠が確認できました。AIを使った研修を始める前に、送信される情報と注意点を確認してください。',
    },
    READY: {
      title: '研修を開始できます',
      message: '参加枠とAI利用同意を確認しました。研修を続けられます。',
    },
  },
  dynamicStates: {
    PROGRAM_WAITING: {
      title: '研修プログラムの準備中です',
      message: '運営が研修プログラムを準備しています。準備ができると、この画面から確認できます。',
    },
    ENROLLMENT_WAITING: {
      title: '研修参加の準備待ちです',
      message:
        'サービスへの参加は完了しています。運営が研修への参加手続きと参加枠を準備しています。',
    },
    SEAT_WAITING: {
      title: '研修参加枠の準備待ちです',
      message:
        '参加枠が準備できるまで、AIを使った学習は始まりません。準備ができると、この画面に表示されます。',
    },
    CONSENT_REQUIRED: {
      title: '研修参加の確認',
      message:
        '参加枠が確認できました。AIを使った研修を始める前に、送信される情報と注意点を確認してください。',
    },
    READY: {
      title: '研修を開始できます',
      message: '参加枠とAI利用同意を確認しました。研修を続けられます。',
    },
  },
} as const;
const SIDE_HUSTLE_COPY = {
  pageTitle: 'AI副業支援への参加',
  checkboxLabel: 'この副業支援で、外部のAIサービスを使うことに同意します',
  submitLabel: '同意して副業支援へ進む',
  continueLabel: '副業支援を続ける',
  states: {
    PROGRAM_WAITING: {
      title: '副業支援の準備中です',
      message: '運営が副業支援を準備しています。準備ができると、この画面から確認できます。',
    },
    ENROLLMENT_WAITING: {
      title: '副業支援の参加準備中です',
      message:
        'サービスへの参加は完了しています。運営が参加手続きと参加枠を準備すると、ここに表示されます。',
    },
    SEAT_WAITING: {
      title: '副業支援の参加枠を準備中です',
      message: '参加枠が確認されるまで、AIを使った処理は行われません。',
    },
    CONSENT_REQUIRED: {
      title: '副業支援への参加の確認',
      message:
        '参加枠が確認できました。AIを使った副業支援を始める前に、送信される情報と注意点を確認してください。',
    },
    READY: {
      title: '副業支援を始められます',
      message: '参加枠とAI利用同意を確認しました。副業支援を続けられます。',
    },
  },
  dynamicStates: {
    PROGRAM_WAITING: {
      title: '副業支援の準備中です',
      message: '運営が副業支援を準備しています。準備ができると、この画面から確認できます。',
    },
    ENROLLMENT_WAITING: {
      title: '副業支援の参加準備中です',
      message: 'サービスへの参加は完了しています。運営が参加手続きと参加枠を準備しています。',
    },
    SEAT_WAITING: {
      title: '副業支援の参加枠を準備中です',
      message:
        '参加枠が準備できるまで、AIを使った支援は始まりません。準備ができると、この画面に表示されます。',
    },
    CONSENT_REQUIRED: {
      title: '副業支援への参加の確認',
      message:
        '参加枠が確認できました。AIを使った副業支援を始める前に、送信される情報と注意点を確認してください。',
    },
    READY: {
      title: '副業支援を始められます',
      message: '参加枠とAI利用同意を確認しました。副業支援を続けられます。',
    },
  },
} as const;

export function aiTrainingConsentPolicy(offerPolicy: PersonalLearningOfferPolicy = 'AI_SKILL_V1') {
  switch (offerPolicy) {
    case 'AI_SKILL_V1':
      return {
        version: AI_TRAINING_AI_CONSENT_VERSION,
        text: AI_TRAINING_AI_CONSENT_TEXT,
        copy: AI_SKILL_COPY,
      } as const;
    case 'SIDE_HUSTLE_V1':
      return {
        version: 'SIDE_HUSTLE_EXTERNAL_AI_V1',
        text: [
          '副業の希望、ヒアリングの回答、実践の記録は、候補の提案・課題の作成・支援のため外部AIサービスへ送信されます。',
          '氏名、勤務先名、顧客情報、パスワード、口座番号など、送信してはいけない情報は入力しないでください。',
          'AIの提案や説明は誤る場合があり、収入や成果を約束するものではありません。費用・規約・税などは、ご自身でも公式情報を確認してください。',
          '実践の状況に合わせてAIがLINEで声をかける場合があります。声かけはいつでも停止でき、支援そのものは続けられます。',
          'この同意は、この副業支援への参加に対するものです。同意しない場合、または参加枠がない場合は、AIを使った処理は行いません。',
        ].join('\n'),
        copy: SIDE_HUSTLE_COPY,
      } as const;
    default: {
      const unreachable: never = offerPolicy;
      void unreachable;
      throw new ApplicationError('CONFIGURATION_ERROR', 'unknown learning offer policy');
    }
  }
}

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
