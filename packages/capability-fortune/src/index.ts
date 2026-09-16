import type { CapabilityDefinition } from '@bunshin/capability-contract';
import { buildStandardFortuneKnowledgePackFromDeck } from './standard-knowledge';

export { STANDARD_FORTUNE_PROMPT_VERSION } from './standard-knowledge';

export const FORTUNE_CAPABILITY = {
  type: 'FORTUNE',
  version: '1',
} as const satisfies CapabilityDefinition;

export const FORTUNE_THEMES = ['LOVE', 'WORK', 'RELATIONSHIPS'] as const;
export type FortuneTheme = (typeof FORTUNE_THEMES)[number];

export const FORTUNE_ORIENTATIONS = ['UPRIGHT', 'REVERSED'] as const;
export type FortuneOrientation = (typeof FORTUNE_ORIENTATIONS)[number];

export interface TarotCard {
  code: string;
  nameJa: string;
  nameEn: string;
  arcana: 'MAJOR' | 'WANDS' | 'CUPS' | 'SWORDS' | 'PENTACLES';
}

const majorArcanaDefinitions = [
  ['MAJOR_00', '愚者', 'The Fool'],
  ['MAJOR_01', '魔術師', 'The Magician'],
  ['MAJOR_02', '女教皇', 'The High Priestess'],
  ['MAJOR_03', '女帝', 'The Empress'],
  ['MAJOR_04', '皇帝', 'The Emperor'],
  ['MAJOR_05', '教皇', 'The Hierophant'],
  ['MAJOR_06', '恋人', 'The Lovers'],
  ['MAJOR_07', '戦車', 'The Chariot'],
  ['MAJOR_08', '力', 'Strength'],
  ['MAJOR_09', '隠者', 'The Hermit'],
  ['MAJOR_10', '運命の輪', 'Wheel of Fortune'],
  ['MAJOR_11', '正義', 'Justice'],
  ['MAJOR_12', '吊るされた男', 'The Hanged Man'],
  ['MAJOR_13', '死神', 'Death'],
  ['MAJOR_14', '節制', 'Temperance'],
  ['MAJOR_15', '悪魔', 'The Devil'],
  ['MAJOR_16', '塔', 'The Tower'],
  ['MAJOR_17', '星', 'The Star'],
  ['MAJOR_18', '月', 'The Moon'],
  ['MAJOR_19', '太陽', 'The Sun'],
  ['MAJOR_20', '審判', 'Judgement'],
  ['MAJOR_21', '世界', 'The World'],
] as const;

const majorArcana: readonly TarotCard[] = majorArcanaDefinitions.map(([code, nameJa, nameEn]) => ({
  code,
  nameJa,
  nameEn,
  arcana: 'MAJOR',
}));

const rankNames = [
  ['ACE', 'エース', 'Ace'],
  ['02', '2', 'Two'],
  ['03', '3', 'Three'],
  ['04', '4', 'Four'],
  ['05', '5', 'Five'],
  ['06', '6', 'Six'],
  ['07', '7', 'Seven'],
  ['08', '8', 'Eight'],
  ['09', '9', 'Nine'],
  ['10', '10', 'Ten'],
  ['PAGE', 'ペイジ', 'Page'],
  ['KNIGHT', 'ナイト', 'Knight'],
  ['QUEEN', 'クイーン', 'Queen'],
  ['KING', 'キング', 'King'],
] as const;

const suits = [
  ['WANDS', 'ワンド', 'Wands'],
  ['CUPS', 'カップ', 'Cups'],
  ['SWORDS', 'ソード', 'Swords'],
  ['PENTACLES', 'ペンタクル', 'Pentacles'],
] as const;

const minorArcana: readonly TarotCard[] = suits.flatMap(([arcana, suitJa, suitEn]) =>
  rankNames.map(([rankCode, rankJa, rankEn]) => ({
    code: `${arcana}_${rankCode}`,
    nameJa: `${suitJa}の${rankJa}`,
    nameEn: `${rankEn} of ${suitEn}`,
    arcana,
  })),
);

export const TAROT_DECK: readonly TarotCard[] = Object.freeze([...majorArcana, ...minorArcana]);

export interface SecureRandomSource {
  nextInt(maxExclusive: number): number;
}

export interface TarotDraw {
  card: TarotCard;
  orientation: FortuneOrientation;
}

export class FortunePolicyError extends Error {
  constructor(
    readonly code:
      | 'INVALID_RANDOM_VALUE'
      | 'INVALID_THEME'
      | 'INVALID_READING_OUTPUT'
      | 'INVALID_KNOWLEDGE_PACK'
      | 'UNSAFE_READING_OUTPUT'
      | 'NOT_AVAILABLE'
      | 'NOT_PARTICIPANT'
      | 'KNOWLEDGE_NOT_READY'
      | 'READING_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'FortunePolicyError';
  }
}

export type FortuneReadingState = 'GENERATING' | 'READY_AI' | 'READY_BASIC' | 'FAILED' | 'DELETED';

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
  createdAt: Date;
}

export interface FortuneParticipantView {
  id: string;
  ageConfirmedAt: Date;
  notificationEnabled: boolean;
}

export type CreateFortuneReadingResult =
  | { kind: 'READY'; reading: FortuneReadingView }
  | { kind: 'NOT_AVAILABLE' }
  | { kind: 'NOT_PARTICIPANT' }
  | { kind: 'KNOWLEDGE_NOT_READY' };

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

  async today(input: { serviceSlug: string; actorUserId: string; now?: Date }) {
    const participant = await this.repository.findParticipant(input);
    if (!participant) return { participant: null, reading: null };
    const reading = await this.repository.findReadingForDate({
      serviceSlug: input.serviceSlug,
      actorUserId: input.actorUserId,
      localDate: toJapanLocalDate(input.now ?? new Date()),
    });
    return { participant, reading };
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
    if (result.kind === 'READY') return result.reading;
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
    const reading = await this.repository.findReading(input);
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

const takeRandomIndex = (source: SecureRandomSource, maxExclusive: number) => {
  const value = source.nextInt(maxExclusive);
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new FortunePolicyError(
      'INVALID_RANDOM_VALUE',
      `Random source must return an integer from 0 through ${maxExclusive - 1}`,
    );
  }
  return value;
};

export function drawTarotCard(source: SecureRandomSource): TarotDraw {
  return {
    card: TAROT_DECK[takeRandomIndex(source, TAROT_DECK.length)]!,
    orientation: FORTUNE_ORIENTATIONS[takeRandomIndex(source, 2)]!,
  };
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

export interface FortuneReadingOutput {
  body: string;
  actionStep: string;
}

export interface FortuneKnowledgeMeaningInput {
  cardCode: string;
  orientation: FortuneOrientation;
  theme: FortuneTheme;
  title: string;
  body: string;
  actionStep: string;
}

export interface FortuneKnowledgePack {
  promptVersion: string;
  meanings: FortuneKnowledgeMeaningInput[];
}

const expectedMeaningKeys = new Set(
  TAROT_DECK.flatMap((card) =>
    FORTUNE_ORIENTATIONS.flatMap((orientation) =>
      FORTUNE_THEMES.map((theme) => `${card.code}:${orientation}:${theme}`),
    ),
  ),
);

/** 78枚×正逆×3テーマの完全な運営者承認用パックだけを受け入れる。 */
export function parseFortuneKnowledgePack(value: unknown): FortuneKnowledgePack {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new FortunePolicyError('INVALID_KNOWLEDGE_PACK', '解釈ファイルの形式が不正です');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !['promptVersion', 'meanings'].includes(key)) ||
    typeof record['promptVersion'] !== 'string' ||
    record['promptVersion'].trim().length < 1 ||
    record['promptVersion'].trim().length > 80 ||
    !Array.isArray(record['meanings']) ||
    record['meanings'].length !== expectedMeaningKeys.size
  )
    throw new FortunePolicyError(
      'INVALID_KNOWLEDGE_PACK',
      `解釈ファイルには${expectedMeaningKeys.size}件すべてが必要です`,
    );

  const seen = new Set<string>();
  const meanings = record['meanings'].map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new FortunePolicyError('INVALID_KNOWLEDGE_PACK', '解釈データの形式が不正です');
    const meaning = item as Record<string, unknown>;
    if (
      Object.keys(meaning).some(
        (key) => !['cardCode', 'orientation', 'theme', 'title', 'body', 'actionStep'].includes(key),
      ) ||
      typeof meaning['cardCode'] !== 'string' ||
      !FORTUNE_ORIENTATIONS.includes(meaning['orientation'] as FortuneOrientation) ||
      !FORTUNE_THEMES.includes(meaning['theme'] as FortuneTheme) ||
      typeof meaning['title'] !== 'string' ||
      typeof meaning['body'] !== 'string' ||
      typeof meaning['actionStep'] !== 'string'
    )
      throw new FortunePolicyError('INVALID_KNOWLEDGE_PACK', '解釈データの項目が不正です');
    const cardCode = meaning['cardCode'];
    const orientation = meaning['orientation'] as FortuneOrientation;
    const theme = meaning['theme'] as FortuneTheme;
    const titleValue = meaning['title'];
    const body = meaning['body'];
    const actionStep = meaning['actionStep'];
    const key = `${cardCode}:${orientation}:${theme}`;
    if (!expectedMeaningKeys.has(key) || seen.has(key))
      throw new FortunePolicyError(
        'INVALID_KNOWLEDGE_PACK',
        `未定義または重複した組み合わせです: ${key}`,
      );
    const title = titleValue.trim();
    if (title.length < 1 || title.length > 160)
      throw new FortunePolicyError('INVALID_KNOWLEDGE_PACK', `タイトルの長さが不正です: ${key}`);
    if (hasProhibitedReadingPattern(title))
      throw new FortunePolicyError(
        'UNSAFE_READING_OUTPUT',
        '断定、診断、投資判断、販売誘導を含む占い結果は公開できません',
      );
    const output = validateFortuneReadingOutput({
      body,
      actionStep,
    });
    seen.add(key);
    return {
      cardCode,
      orientation,
      theme,
      title,
      ...output,
    };
  });
  if (seen.size !== expectedMeaningKeys.size)
    throw new FortunePolicyError('INVALID_KNOWLEDGE_PACK', '解釈データに不足があります');
  return { promptVersion: record['promptVersion'].trim(), meanings };
}

export const FORTUNE_KNOWLEDGE_MEANING_COUNT = expectedMeaningKeys.size;

/** 初期運用向けの全468通りの標準解釈。返却前に公開時と同じ安全検査を行う。 */
export function buildStandardFortuneKnowledgePack(): FortuneKnowledgePack {
  return parseFortuneKnowledgePack(
    buildStandardFortuneKnowledgePackFromDeck(TAROT_DECK, FORTUNE_ORIENTATIONS, FORTUNE_THEMES),
  );
}

const prohibitedPatterns = [
  /必ず.{0,12}(起こる|叶う|成功する)/u,
  /絶対に/u,
  /(病気|障害).{0,12}(診断|確定)/u,
  /(投資|株|仮想通貨).{0,12}(買う|売る|儲かる)/u,
  /(商品|プラン).{0,12}(購入|契約)/u,
];

const hasProhibitedReadingPattern = (text: string) =>
  prohibitedPatterns.some((pattern) => pattern.test(text));

export function validateFortuneReadingOutput(output: FortuneReadingOutput): FortuneReadingOutput {
  const body = output.body.trim();
  const actionStep = output.actionStep.trim();
  if (body.length < 1 || body.length > 700 || actionStep.length < 1 || actionStep.length > 200) {
    throw new FortunePolicyError(
      'INVALID_READING_OUTPUT',
      '占い本文または行動提案の長さが規定外です',
    );
  }
  if (hasProhibitedReadingPattern(`${body}\n${actionStep}`)) {
    throw new FortunePolicyError(
      'UNSAFE_READING_OUTPUT',
      '断定、診断、投資判断、販売誘導を含む占い結果は公開できません',
    );
  }
  return { body, actionStep };
}
