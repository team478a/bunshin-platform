import {
  defineLearningScopeResult,
  type LearningScopeClassification,
  type LearningScopeResult,
} from '@bunshin/application';

export const AI_TRAINING_LEARNING_SCOPE_RULE_VERSION = 'AI_TRAINING_LEARNING_SCOPE_V1';
export const AI_TRAINING_LEARNING_SCOPE_MAX_INPUT_CHARS = 2_000;

export interface AiTrainingLearningScopeInput {
  readonly text: string;
  /** Trusted caller context, not a claim extracted from the user's text. */
  readonly hasCurrentAiLearningContext?: boolean;
}

const aiTopic = /\b(?:AI|ChatGPT|Gemini|Copilot|API)\b|プロンプト|画像生成|動画生成|自動化/i;
const learningEnd = /(?:学びたい|勉強したい|習得したい|上手くなりたい|学ぶ方法を知りたい)$/;
const supportEnd =
  /(?:分からない|わからない|よく分からない|教えて|説明して|どういう意味|って何|とは何)$/;
const automationAction =
  /(?:自動化(?:して|してください)|(?:Zapier|AIエージェント|エージェント).{0,30}(?:設定して|作って|動かして|構築して))$/i;
const consultingAction =
  /(?:集客|売上|営業戦略|採用戦略|マーケティング戦略).{0,40}(?:考えて|作って|どうしたらいい|上げたい|上げるには)$/;
const contentAction =
  /(?:画像|動画|メール|資料|Excelファイル|プログラム|コード|記事|投稿).{0,40}(?:作って|書いて|生成して|作成して)$/i;
const priority: readonly LearningScopeClassification[] = [
  'AUTOMATION_REQUEST',
  'CONSULTING',
  'CONTENT_REQUEST',
  'OUT_OF_SCOPE',
  'LEARNING_SUPPORT',
  'LEARNING',
];

function learningSuggestion(classification: LearningScopeClassification, text: string) {
  if (classification === 'AUTOMATION_REQUEST') {
    return '自動化の仕組み・必要技術・一般的な作り方を学ぶ';
  }
  if (classification !== 'CONTENT_REQUEST') return null;
  if (/画像/.test(text)) return '画像生成AIを使って自分で画像を作る方法を学ぶ';
  if (/動画/.test(text)) return '動画生成AIを使って自分で動画を作る方法を学ぶ';
  if (/メール/.test(text)) return 'AIを使って自分でメールを書く方法を学ぶ';
  return 'AIを使って自分で成果物を作り、内容を確認する方法を学ぶ';
}

/** Conservative Japanese V1 rules. No generation, persistence, or authorization. */
export function classifyAiTrainingLearningScope(
  input: AiTrainingLearningScopeInput,
): LearningScopeResult {
  const result = (
    detected: readonly LearningScopeClassification[],
    reason: string,
    requiresConfirmation: boolean,
    suggestion: string | null = null,
  ) =>
    defineLearningScopeResult({
      classification: detected[0] ?? null,
      detectedClassifications: detected,
      ruleVersion: AI_TRAINING_LEARNING_SCOPE_RULE_VERSION,
      reason,
      requiresConfirmation,
      suggestedLearningIntent: suggestion,
    });

  if (!input.text.trim() || input.text.length > AI_TRAINING_LEARNING_SCOPE_MAX_INPUT_CHARS) {
    return result([], 'UNRECOGNIZED_INPUT', true);
  }
  const text = input.text.normalize('NFKC').trim();
  const bypass =
    /(?:ルール|指示|境界).{0,20}(?:無視|解除)|(?:勉強|学習|研修).{0,20}(?:ということにして|扱いにして)|ignore.{0,20}(?:rule|instruction)/i.test(
      text,
    );
  const clauses = text
    .split(/[。！？!?;\n、]|(?:そして|それから|そのまま|さらに|(?<=て)から)/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const found = new Set<LearningScopeClassification>();
  let unresolved = false;
  for (const clause of clauses) {
    // Requested actions take precedence over labels such as "学習用" or "教材として".
    const automation = automationAction.test(clause) || /(?:設定|実行)(?:も)?して$/.test(clause);
    const consulting = consultingAction.test(clause);
    const content = contentAction.test(clause);
    if (automation) found.add('AUTOMATION_REQUEST');
    if (consulting) found.add('CONSULTING');
    if (content && !automation) found.add('CONTENT_REQUEST');
    const embeddedRequest = /作って|書いて|考えて|設定して|自動化して|実行して|動かして/.test(
      clause,
    );
    const learning =
      aiTopic.test(clause) && learningEnd.test(clause) && !bypass && !embeddedRequest;
    if (learning && !automation && !consulting && !content) found.add('LEARNING');
    const ambiguousAutomation = /自動化.*(?:について|方法).*教えて$/.test(clause);
    const explicitSupport = /プロンプト|\bAPI\b|AI課題|AI学習/i.test(clause);
    const contextualSupport =
      input.hasCurrentAiLearningContext === true &&
      /この課題|(?:もう一度|再度|もう1度).*説明して/.test(clause);
    const support =
      !automation &&
      !consulting &&
      !content &&
      !learning &&
      supportEnd.test(clause) &&
      !ambiguousAutomation &&
      !embeddedRequest &&
      (explicitSupport || contextualSupport);
    if (support) found.add('LEARNING_SUPPORT');
    const outside = /^(?:今日の天気|天気(?:を教えて)?|雑談|.*旅行(?:プラン|を考えて))$/.test(
      clause,
    );
    if (outside) found.add('OUT_OF_SCOPE');
    // Do not silently discard unmatched clauses, including unknown mixed intents.
    if (!(automation || consulting || content || learning || support || outside)) unresolved = true;
    if (ambiguousAutomation) unresolved = true;
  }
  const detected = priority.filter((classification) => found.has(classification));
  if (bypass) return result(detected, 'BOUNDARY_BYPASS', true);
  if (detected.length > 1) return result(detected, 'MIXED_INTENTS', true);
  if (unresolved || detected.length === 0)
    return result(detected, 'AMBIGUOUS_OR_UNRECOGNIZED', true);
  const classification = detected[0]!;
  if (classification === 'CONTENT_REQUEST' || classification === 'AUTOMATION_REQUEST') {
    return result(
      detected,
      'LEARNING_SUGGESTION_REQUIRES_CONFIRMATION',
      true,
      learningSuggestion(classification, text),
    );
  }
  return result(
    detected,
    classification === 'CONSULTING' || classification === 'OUT_OF_SCOPE'
      ? 'OUTSIDE_LEARNING_BOUNDARY'
      : 'EXPLICIT_LEARNING_INTENT',
    false,
  );
}
