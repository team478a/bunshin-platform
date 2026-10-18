/** Attributes that may be inferred from a learner's own learning records. */
export const PERSONAL_LEARNING_PERSONA_INFERRED_KEYS = [
  'learning_purpose',
  'explanation_style',
  'learning_pace',
  'stated_goal',
  'ai_tool_familiarity',
] as const;

export type PersonalLearningPersonaInferredKey =
  (typeof PERSONAL_LEARNING_PERSONA_INFERRED_KEYS)[number];

/** These keys are explicitly entered by the learner and are never accepted from inference. */
export const PERSONAL_LEARNING_PERSONA_LEARNER_KEYS = [
  'company_name',
  'age_band',
  'industry_job',
] as const;

export function isPersonalLearningPersonaInferredKey(
  key: string,
): key is PersonalLearningPersonaInferredKey {
  return (PERSONAL_LEARNING_PERSONA_INFERRED_KEYS as readonly string[]).includes(key);
}

/**
 * Conservative local screening, not a guarantee that every sensitive value is detectable.
 * Keep the same function for AI-produced and learner-entered persona values.
 */
export function isPersonalLearningPersonaValueDisallowed(value: string): boolean {
  const text = value.normalize('NFKC').trim();
  if (!text) return true;

  const patterns = [
    // Direct contact details and Japanese postal / phone formats.
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/,
    /〒?\s*\d{3}[-−ー]?\d{4}/,
    // Health, disability, diagnosis, religion, politics, identity, income/assets, and counterparties.
    /(病|症|障害|診断|治療|服薬|うつ|鬱|糖尿|癌|がん|ADHD|自閉症|発達障害)/i,
    /(宗教|信仰|教会|政治|政党|選挙|民族|国籍|性的指向|収入|年収|資産|預金|取引先)/,
    // Japanese address cues, including prefecture/city and street-number forms.
    /(北海道|東京都|京都府|大阪府|.{2,3}県).{0,24}(市|区|町|村).{0,24}(\d|丁目|番地|号)/,
    /\d+丁目\d+番(?:地)?\d*号?/,
    // Person-like names that are explicitly identified as someone other than the learner.
    /(同僚|上司|部下|顧客|お客様|家族|友人|取引先の).{0,18}[一-龯々]{1,5}(?:さん|様|氏)/,
    /(?:田中|佐藤|鈴木|高橋|伊藤|渡辺|山本|中村|小林|加藤)[一-龯々]{1,4}(?:さん|様|氏)/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}
