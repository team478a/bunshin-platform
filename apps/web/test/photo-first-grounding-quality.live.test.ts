import { socialGoalPlanningProfile } from '@bunshin/capability-social';
import { describe, expect, it } from 'vitest';

import { OpenAIMissionQualityChecker } from '../src/providers/openai-mission-quality-checker';

const runLive = process.env['RUN_OPENAI_PHOTO_FIRST_GROUNDING_QUALITY'] === '1';
const apiKey = process.env['OPENAI_API_KEY'] ?? '';
const model = process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
const requestLimit = 4;
const requestedCaseIds = (process.env['PHOTO_FIRST_GROUNDING_CASE_IDS'] ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const brief = {
  missionDate: '2026-10-02',
  format: 'TEXT' as const,
  topic: 'カウンセリング前の確認を丁寧に行う理由',
  angle: '仕事のプロセスから専門性を伝える',
  reason: '初めて来店する方が、相談の進め方を具体的に理解できるようにする',
  estimatedMinutes: 5,
};

const common = {
  platform: 'INSTAGRAM' as const,
  brief,
  bunshin: {
    name: 'よりそう美容室（検証用架空店舗）',
    objectiveSummary: '初めての方にも相談しやすい施術を提供する',
    audienceSummary: '地域で美容室を探している方',
    personalitySummary: '落ち着いた、具体的な説明',
    personality: null,
  },
  approvedStrategy: {
    goal: 'TRUST_EXPERTISE' as const,
    goalPlanning: socialGoalPlanningProfile('TRUST_EXPERTISE'),
    concept: '施術前の確認プロセスから専門性を伝える',
    positioning: '希望を丁寧に確認する地域の美容室',
    targetSummary: '初めての美容室で希望を伝えられるか不安な方',
    ctaStrategy: '来店前に確認したいことを整理するための保存',
    postingPolicy: '確認済みの店舗情報だけを使用する',
  },
  businessProfile: {
    industry: '美容室',
    businessName: 'よりそう美容室（検証用架空店舗）',
    region: '架空市',
    productService: 'カウンセリングと施術',
    targetAudience: '初めての美容室で希望を伝えられるか不安な方',
    primaryPurpose: '施術前の確認プロセスを伝えて信頼につなげる',
    businessFeatures: '希望を丁寧に確認する',
  },
  selectedMemories: [],
  groupKnowledge: [],
  recentContent: [],
};

const uncertainProductGrounding = {
  uncertainElements: [
    '写真の容器に書かれた商品名は判読できない',
    '販売中の商品か店内備品かは確認できない',
    '発売日と人気度は確認できない',
  ],
  pendingQuestion: '写真の容器の商品名と販売状況を教えてください。',
  answeredConfirmation: null,
};

const answeredChecklistGrounding = {
  uncertainElements: [
    'チェック項目の具体的な内容は判読できない',
    '全スタッフの利用頻度は確認できない',
    '顧客満足度への効果は確認できない',
  ],
  pendingQuestion: 'チェック項目の具体的な内容を教えてください。',
  answeredConfirmation: {
    question: 'この用紙は何に使っていますか？',
    answer: '店内でカウンセリング時に使うチェックシートです。',
  },
};

const content = (body: string, photoInstruction: string) => ({
  body,
  threadParts: [],
  cta: '来店前に確認したいことを整理するため、保存してお使いください。',
  caption: null,
  hashtags: ['#美容室選び', '#カウンセリング'],
  photoInstruction,
});

describe.runIf(runLive)('Photo First grounding quality (manual, synthetic text only)', () => {
  it('distinguishes unsupported facts, explicit examples, confirmed scope, and overreach', async () => {
    expect(apiKey, 'OPENAI_API_KEY must be present only in the execution environment').not.toBe('');
    let requestCount = 0;
    const cappedFetch: typeof fetch = async (url, init) => {
      requestCount += 1;
      if (requestCount > requestLimit) throw new Error('LIVE_PROVIDER_REQUEST_LIMIT_EXCEEDED');
      return fetch(url, init);
    };
    const checker = new OpenAIMissionQualityChecker({ apiKey, model, fetch: cappedFetch });
    const cases = [
      {
        id: 'UNCONFIRMED_ASSERTION',
        grounding: uncertainProductGrounding,
        content: content(
          '写真に写っている新商品「よりそうオイル」は本日発売。地域で人気No.1の商品です。施術前後のケアにおすすめします。',
          '写真の新商品「よりそうオイル」の商品名と容器が読めるように大きく配置する。',
        ),
      },
      {
        id: 'EXPLICIT_EXAMPLE',
        grounding: uncertainProductGrounding,
        content: content(
          '初めての美容室では、何を相談すればよいか迷いますよね。たとえば「普段のお手入れで困っていること」「仕上がりの希望」を来店前に整理すると、相談がしやすくなります。写真の容器の商品名や販売状況は確認できないため、店舗の商品としては紹介しません。',
          'アップロード済み写真をそのまま使い、容器の商品名や用途を断定する文字は追加しない。',
        ),
      },
      {
        id: 'CONFIRMED_SCOPE',
        grounding: answeredChecklistGrounding,
        content: content(
          'この写真は、店内でカウンセリング時に使うチェックシートです。具体的なチェック項目は写真から確認できないため、ここでは紹介しません。初めての美容室では、来店前に希望や困りごとをメモしておくと相談の準備に役立ちます。',
          'アップロード済みのチェックシート写真を使い、判読できない項目を補ったり書き換えたりしない。',
        ),
      },
      {
        id: 'ANSWER_OVERREACH',
        grounding: answeredChecklistGrounding,
        content: content(
          'この独自チェックシートは全スタッフが毎日必ず使い、顧客満足度No.1を実現している当店だけのメソッドです。',
          '全スタッフが毎日使う独自メソッドであることを大きな文字で写真へ追加する。',
        ),
      },
    ] as const;

    const selectedCases =
      requestedCaseIds.length === 0
        ? cases
        : cases.filter((testCase) => requestedCaseIds.includes(testCase.id));
    if (
      selectedCases.length === 0 ||
      (requestedCaseIds.length > 0 && selectedCases.length !== new Set(requestedCaseIds).size)
    )
      throw new Error('Unsupported PHOTO_FIRST_GROUNDING_CASE_IDS');
    const results = [];
    for (const testCase of selectedCases) {
      const result = await checker.check({
        ...common,
        content: testCase.content,
        photoFirstGrounding: testCase.grounding,
      });
      results.push({
        id: testCase.id,
        verdict: result.output.verdict,
        score: result.output.score,
        issues: result.output.issues,
        telemetry: {
          model: result.model,
          promptVersion: result.promptVersion,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
        },
      });
    }

    const byId = Object.fromEntries(results.map((result) => [result.id, result]));
    console.info(
      `PHOTO_FIRST_GROUNDING_QUALITY_RESULT=${JSON.stringify({
        executedAt: new Date().toISOString(),
        model,
        requestCount,
        results,
      })}`,
    );
    expect(requestCount).toBe(selectedCases.length);
    if (byId['UNCONFIRMED_ASSERTION']) {
      expect(byId['UNCONFIRMED_ASSERTION']).toMatchObject({ verdict: 'REVISE' });
      expect(byId['UNCONFIRMED_ASSERTION'].issues.map((issue) => issue.code)).toContain(
        'PHOTO_FIRST_UNCONFIRMED_FACT',
      );
    }
    if (byId['EXPLICIT_EXAMPLE']) {
      expect(byId['EXPLICIT_EXAMPLE'].issues.map((issue) => issue.code)).not.toContain(
        'PHOTO_FIRST_UNCONFIRMED_FACT',
      );
    }
    if (byId['CONFIRMED_SCOPE']) {
      expect(byId['CONFIRMED_SCOPE'].issues.map((issue) => issue.code)).not.toContain(
        'PHOTO_FIRST_UNCONFIRMED_FACT',
      );
    }
    if (byId['ANSWER_OVERREACH']) {
      expect(byId['ANSWER_OVERREACH']).toMatchObject({ verdict: 'REVISE' });
      expect(byId['ANSWER_OVERREACH'].issues.map((issue) => issue.code)).toContain(
        'PHOTO_FIRST_UNCONFIRMED_FACT',
      );
    }
  }, 240_000);
});
