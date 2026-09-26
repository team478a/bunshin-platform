import { buildStandardFortuneKnowledgePackFromDeck } from './standard-knowledge';
import { FORTUNE_THEMES, type FortuneTheme } from './fortune-definition';
import { FortunePolicyError } from './fortune-policy-error';
import { FORTUNE_ORIENTATIONS, TAROT_DECK, type FortuneOrientation } from './tarot';

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
