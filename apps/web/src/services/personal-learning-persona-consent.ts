/** Keep learner-facing consent copy/version in one place for future legal review. */
export const PERSONAL_LEARNING_PERSONA_CONSENT_VERSION = '2026-10-18-v1';

export const PERSONAL_LEARNING_PERSONA_INVITATION_DEFAULT_ANSWER_COUNT = 3;

export function personalLearningPersonaInvitationAnswerCount(
  configuredValue = process.env['PERSONAL_LEARNING_PERSONA_INVITATION_AFTER_ANSWERS'],
) {
  if (configuredValue === undefined)
    return PERSONAL_LEARNING_PERSONA_INVITATION_DEFAULT_ANSWER_COUNT;
  const parsed = Number(configuredValue);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
    ? parsed
    : PERSONAL_LEARNING_PERSONA_INVITATION_DEFAULT_ANSWER_COUNT;
}

export const PERSONAL_LEARNING_PERSONA_CONSENT_COPY = {
  heading: '学び方に合わせたサポートを使う',
  summary:
    '実践や相談の記録から、学習の目的・説明の好み・ペース・目標・AIツールの慣れを推測し、今後の研修の提案に使います。推測は未確認として表示し、いつでも確認・修正・削除できます。',
  off: '「使う」を選ぶまでは推測もAIへの受け渡しも行いません。いつでも停止でき、停止時に保存済みの本人像を残すか削除するか選べます。',
  never:
    '次の情報は、選択にかかわらず保存・推測しません：他人の個人情報、健康・障害・診断、宗教・政治、民族・国籍、性的指向、収入・資産、住所、取引先名。',
  examplesHeading: '表示例（汎用例・あなたの記録から作ったものではありません）',
  examples: [
    '学習の目的：日々の業務でAIを使えるようになりたい',
    '説明の好み：短い手順で一つずつ試したい',
    '学習ペース：平日に少しずつ進めたい',
  ],
} as const;
