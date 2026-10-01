import {
  weeklySocialGoalPlanningProfile,
  type MissionBusinessProfileContext,
  type PhotoFirstPlanning,
  type SocialAccountStrategyGoal,
} from '@bunshin/capability-social';
import { describe, expect, it, vi } from 'vitest';
import { OpenAIMissionContentGenerator } from '../src/providers/openai-mission-content-generator';
import { OpenAiPhotoFirstAnalyzer } from '../src/providers/openai-photo-first-analyzer';

type AnalyzerInput = Parameters<OpenAiPhotoFirstAnalyzer['analyze']>[0];

const samePhoto = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

const analysis = {
  imageType: '手元写真',
  subjects: ['人物の手'],
  objects: ['チェックリスト', 'ペン'],
  scene: '明るい机の上でチェックリストに記入している',
  visibleText: [],
  possibleContentAngles: ['準備の流れ', '仕事で大切にしている確認'],
  qualityNotes: ['手元と用紙が見やすい'],
  uncertainElements: ['用紙の具体的な内容は読めない'],
  safetyFlags: [],
};

const outputs = {
  awarenessSalon: {
    planning: {
      theme: '美容室がカウンセリング前に確認していること',
      angle: 'チェックリストの写真から、希望を言葉にする準備を紹介する',
      recommendationReason: '店舗の丁寧な考え方を知る理由として伝えられるため',
      photoUsage: '記入する手元を主役にし、確認の丁寧さが伝わる1枚として使う',
      imageEditPrompt: null,
      confirmationQuestion: null,
    },
    content: {
      body: '美容室で希望をうまく伝えられるか不安な方へ。私たちは施術前に、なりたい雰囲気と避けたいことを一緒に確認します。チェックリストは、会話を急がず始めるための準備です。',
      threadParts: [],
      cta: '初めての方が安心できる工夫を、あとで見返せるよう保存してください。',
      caption: null,
      hashtags: ['#美容室', '#カウンセリング'],
      photoInstruction: 'チェックリストとペンを持つ手元を、机の正面から用紙全体が入るように撮る',
    },
  },
  recruitmentSalon: {
    planning: {
      theme: '新人スタッフがカウンセリングを学ぶ準備',
      angle: '同じチェックリストを使い、入社後に身につける仕事として紹介する',
      recommendationReason: '働く人、仕事内容、育成の進め方を応募前に理解できるため',
      photoUsage: '先輩と確認する新人スタッフの手元として使う',
      imageEditPrompt: null,
      confirmationQuestion: null,
    },
    content: {
      body: '入社後すぐに一人で接客するわけではありません。新人スタッフはこのチェックリストを使い、先輩と希望の聞き方を練習します。仕事の手順と、困ったときに確認できる環境を紹介します。',
      threadParts: [],
      cta: '仕事の進め方を知りたい方は、採用情報を見て店舗見学をご相談ください。',
      caption: null,
      hashtags: ['#美容師求人', '#店舗見学'],
      photoInstruction: '新人と先輩がチェックリストを一緒に指さす手元を、横から用紙まで入れて撮る',
    },
  },
  awarenessBakery: {
    planning: {
      theme: 'ベーカリーが開店前に確認している焼き上がり予定',
      angle: 'チェックリストの写真から、商品を揃える朝の準備を紹介する',
      recommendationReason: '店頭にパンが並ぶまでの仕事と店の姿勢を知ってもらえるため',
      photoUsage: '焼き上がり予定へ印を付ける手元として使う',
      imageEditPrompt: null,
      confirmationQuestion: 'この用紙は公開してよい焼き上がり予定表ですか？',
    },
    content: {
      body: 'ベーカリーの朝は、焼き上がりの順番を確認するところから始まります。チェックリストで時間を揃え、開店時に選びやすい売り場を準備しています。店頭に並ぶ前の小さな仕事をご紹介します。',
      threadParts: [],
      cta: '朝の店づくりをこれからも紹介するので、続きはフォローしてご覧ください。',
      caption: null,
      hashtags: ['#ベーカリー', '#開店準備'],
      photoInstruction: '焼き上がり予定表へ印を付ける手元を、文字が読めすぎない距離から机ごと撮る',
    },
  },
  awarenessSalonAfterHistory: {
    planning: {
      theme: '施術後に渡す自宅ケアメモの作り方',
      angle: '既出の来店前カウンセリングを繰り返さず、帰宅後まで支える準備を見せる',
      recommendationReason: '過去の店内紹介と重複せず、店舗の別の特徴を知ってもらえるため',
      photoUsage: 'お客様ごとのケア内容を整理する手元として使う',
      imageEditPrompt: null,
      confirmationQuestion: null,
    },
    content: {
      body: '施術が終わったあとも迷わないよう、髪の状態に合わせた自宅ケアを短いメモにしています。乾かし方や使う量を、今日から試せる順番でお渡しするのが私たちの工夫です。',
      threadParts: [],
      cta: '次回まで役立つケアの工夫を見逃さないよう、フォローしてください。',
      caption: null,
      hashtags: ['#美容室', '#自宅ケア'],
      photoInstruction: 'ケアメモへ一項目ずつ記入する手元を、個人名を隠して斜め上から撮る',
    },
  },
} as const;

type ScenarioKey = keyof typeof outputs;

function analyzerInput(key: ScenarioKey): AnalyzerInput {
  const recruitment = key === 'recruitmentSalon';
  const bakery = key === 'awarenessBakery';
  const changedHistory = key === 'awarenessSalonAfterHistory';
  const goal = recruitment ? 'RECRUIT' : 'BRAND_AWARENESS';
  return {
    bytes: samePhoto,
    mimeType: 'image/jpeg',
    sourceNote: '机の上のチェックリストへペンで記入する手元',
    company: {
      name: bakery ? 'まちの朝ベーカリー' : 'よりそう美容室',
      objectiveSummary: bakery
        ? '毎朝焼くパンと店づくりを地域へ伝える'
        : '初めての方にも相談しやすい施術を提供する',
      audienceSummary: bakery
        ? '通勤前に焼きたてのパンを選びたい地域の方'
        : '地域でこの美容室との関わりを検討している方',
      personalitySummary: '落ち着いた、具体的な説明',
      businessProfile: bakery
        ? { industry: 'ベーカリー', productService: '店内で毎朝焼くパン' }
        : { industry: '美容室', productService: 'カウンセリングと施術' },
    },
    strategy: {
      goal,
      goalPlanning: weeklySocialGoalPlanningProfile(goal),
      concept: '日々の準備から店の考え方を伝える',
      positioning: '地域との関わりを大切にする店',
      targetSummary: 'この店との関わりを検討している地域の方',
      ctaStrategy: '投稿目的に合う一つの行動を案内する',
    },
    platform: 'INSTAGRAM',
    mission: {
      topic: '店の仕事の工夫',
      angle: '手元から準備を見せる',
      reason: '店の考え方を具体的に伝える',
    },
    recentPosts: changedHistory
      ? [
          { topic: '初回来店前のカウンセリング', angle: 'チェックリストで確認すること' },
          { topic: '店内で大切にしていること', angle: '相談しやすい雰囲気' },
        ]
      : [{ topic: 'スタッフ紹介', angle: '働く人の自己紹介' }],
  };
}

function response(value: unknown) {
  return new Response(
    JSON.stringify({
      model: 'fixture-model',
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    }),
    { status: 200 },
  );
}

function scenarioMarker(key: ScenarioKey) {
  if (key === 'recruitmentSalon') return 'RECRUIT';
  if (key === 'awarenessBakery') return 'まちの朝ベーカリー';
  if (key === 'awarenessSalonAfterHistory') return '初回来店前のカウンセリング';
  return 'よりそう美容室';
}

function fixtureFetch<T>(key: ScenarioKey, value: T) {
  return vi.fn<typeof fetch>().mockImplementation((_url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    expect(body).toContain(scenarioMarker(key));
    return Promise.resolve(response(value));
  });
}

function contentInput(key: ScenarioKey, planning: PhotoFirstPlanning) {
  const input = analyzerInput(key);
  return {
    platform: 'INSTAGRAM' as const,
    brief: {
      missionDate: '2026-10-01',
      format: 'TEXT' as const,
      topic: planning.theme,
      angle: planning.angle,
      reason: planning.recommendationReason,
      estimatedMinutes: 5,
    },
    bunshin: {
      name: input.company.name,
      objectiveSummary: input.company.objectiveSummary,
      audienceSummary: input.company.audienceSummary,
      personalitySummary: input.company.personalitySummary,
      personality: null,
    },
    approvedStrategy: {
      ...input.strategy,
      goal: input.strategy.goal as SocialAccountStrategyGoal,
      postingPolicy: '週3回、確認後に投稿する',
    },
    contentPillar: { title: '仕事の工夫', description: '日々の準備を具体的に見せる' },
    grantedKnowledge: [],
    businessProfile: input.company.businessProfile as MissionBusinessProfileContext,
    groupKnowledge: [],
    recentContent: input.recentPosts.map((post) => ({
      missionDate: '2026-09-30',
      topic: post.topic,
      angle: post.angle,
      contentSummary: post.topic,
      format: 'TEXT',
      cta: null,
    })),
    selectedMemories: [],
    variantSourceContent: {
      body: '既存の投稿案',
      threadParts: [],
      cta: null,
      caption: null,
      hashtags: [],
      photoInstruction: null,
    },
    variantInstructions: [
      `写真解析: ${JSON.stringify(analysis)}`,
      `投稿設計: ${JSON.stringify(planning)}`,
      'テーマ、導入、読者価値、写真の使い方、CTAを投稿設計とSNS Goalに一貫させる。CTAだけを差し替えない',
    ],
  };
}

async function runScenario(key: ScenarioKey) {
  const expected = outputs[key];
  const analyzerFetch = fixtureFetch(key, { analysis, planning: expected.planning });
  const analyzer = new OpenAiPhotoFirstAnalyzer({
    apiKey: 'fixture-key',
    model: 'fixture-model',
    fetch: analyzerFetch,
  });
  const planned = await analyzer.analyze(analyzerInput(key));
  const contentFetch = fixtureFetch(key, expected.content);
  const generated = await new OpenAIMissionContentGenerator({
    apiKey: 'fixture-key',
    model: 'fixture-model',
    fetch: contentFetch,
  }).generate(contentInput(key, planned.planning));
  const contentRequestBody = contentFetch.mock.calls[0]?.[1]?.body;
  expect(typeof contentRequestBody === 'string' ? contentRequestBody : '').toContain(
    planned.planning.theme,
  );
  expect(typeof contentRequestBody === 'string' ? contentRequestBody : '').toContain(
    'CTAだけを差し替えない',
  );
  const analyzerRequest = JSON.parse(analyzerFetch.mock.calls[0]?.[1]?.body as string) as {
    input: Array<{
      content: string | Array<{ type: string; text?: string; image_url?: string }>;
    }>;
  };
  const multimodal = analyzerRequest.input[2]?.content;
  if (!Array.isArray(multimodal)) throw new Error('expected multimodal fixture input');
  return {
    planning: planned.planning,
    content: generated.output as typeof expected.content,
    imageUrl: multimodal[1]?.image_url,
  };
}

function differentialFields(value: Awaited<ReturnType<typeof runScenario>>) {
  return {
    theme: value.planning.theme,
    angle: value.planning.angle,
    recommendationReason: value.planning.recommendationReason,
    body: value.content.body,
    photoIdea: value.content.photoInstruction,
    cta: value.content.cta,
  };
}

function expectEveryProposalFieldToDiffer(
  before: Awaited<ReturnType<typeof runScenario>>,
  after: Awaited<ReturnType<typeof runScenario>>,
) {
  const beforeFields = differentialFields(before);
  const afterFields = differentialFields(after);
  for (const field of Object.keys(beforeFields) as Array<keyof typeof beforeFields>) {
    expect(beforeFields[field]).not.toBe(afterFields[field]);
  }
}

describe('Photo First differential fixtures', () => {
  it('changes the whole proposal when only the SNS Goal changes', async () => {
    const awarenessInput = analyzerInput('awarenessSalon');
    const recruitmentInput = analyzerInput('recruitmentSalon');
    expect({
      ...awarenessInput,
      strategy: {
        ...awarenessInput.strategy,
        goal: recruitmentInput.strategy.goal,
        goalPlanning: recruitmentInput.strategy.goalPlanning,
      },
    }).toEqual(recruitmentInput);
    const awareness = await runScenario('awarenessSalon');
    const recruitment = await runScenario('recruitmentSalon');

    expect(awareness.imageUrl).toBe(recruitment.imageUrl);
    expect(differentialFields(awareness)).not.toEqual(differentialFields(recruitment));
    expectEveryProposalFieldToDiffer(awareness, recruitment);
    expect(recruitment.planning.theme).toContain('新人スタッフ');
    expect(recruitment.content.body).toContain('仕事');
    expect(recruitment.content.cta).toContain('採用情報');
  });

  it('changes the whole proposal when only the company profile changes', async () => {
    const salonInput = analyzerInput('awarenessSalon');
    const bakeryInput = analyzerInput('awarenessBakery');
    expect({ ...salonInput, company: bakeryInput.company }).toEqual(bakeryInput);
    const salon = await runScenario('awarenessSalon');
    const bakery = await runScenario('awarenessBakery');

    expect(salon.imageUrl).toBe(bakery.imageUrl);
    expectEveryProposalFieldToDiffer(salon, bakery);
    expect(bakery.planning.theme).toContain('ベーカリー');
    expect(bakery.content.body).toContain('焼き上がり');
    expect(bakery.content.photoInstruction).toContain('焼き上がり予定表');
    expect(JSON.stringify(differentialFields(bakery))).not.toContain('美容室');
  });

  it('avoids a repeated angle when only recent history changes', async () => {
    const noMatchingHistoryInput = analyzerInput('awarenessSalon');
    const matchingHistoryInput = analyzerInput('awarenessSalonAfterHistory');
    expect({ ...noMatchingHistoryInput, recentPosts: matchingHistoryInput.recentPosts }).toEqual(
      matchingHistoryInput,
    );
    const noMatchingHistory = await runScenario('awarenessSalon');
    const withMatchingHistory = await runScenario('awarenessSalonAfterHistory');

    expect(noMatchingHistory.imageUrl).toBe(withMatchingHistory.imageUrl);
    expect(withMatchingHistory.planning.angle).toContain('繰り返さず');
    expect(withMatchingHistory.planning.theme).toContain('自宅ケア');
    expect(withMatchingHistory.content.body).toContain('施術が終わったあと');
    expect(withMatchingHistory.content.cta).toContain('フォロー');
    expectEveryProposalFieldToDiffer(noMatchingHistory, withMatchingHistory);
  });

  it('uses the exact same bytes in every comparison instead of changing the photo', async () => {
    const results = await Promise.all(
      (Object.keys(outputs) as ScenarioKey[]).map((key) => runScenario(key)),
    );
    expect(new Set(results.map(({ imageUrl }) => imageUrl))).toEqual(
      new Set([`data:image/jpeg;base64,${Buffer.from(samePhoto).toString('base64')}`]),
    );
  });
});
