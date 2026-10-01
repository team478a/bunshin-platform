import { createHash } from 'node:crypto';
import {
  weeklySocialGoalPlanningProfile,
  type MissionBusinessProfileContext,
  type PhotoFirstPlanning,
  type SocialAccountStrategyGoal,
} from '@bunshin/capability-social';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { OpenAIMissionContentGenerator } from '../src/providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../src/providers/openai-mission-quality-checker';
import { OpenAiPhotoFirstAnalyzer } from '../src/providers/openai-photo-first-analyzer';

const runLive = process.env['RUN_OPENAI_PHOTO_FIRST_QUALITY'] === '1';
const apiKey = process.env['OPENAI_API_KEY'] ?? '';
const model = process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
const requestLimit = 6;

type Goal = 'BRAND_AWARENESS' | 'RECRUIT' | 'VISIT_RESERVATION' | 'INQUIRY' | 'REPEAT' | 'SALES';
type GoalPair = 'baseline' | 'conversion' | 'retention-sales' | 'sales-boundary';

const goalPairs = {
  baseline: ['BRAND_AWARENESS', 'RECRUIT'],
  conversion: ['VISIT_RESERVATION', 'INQUIRY'],
  'retention-sales': ['REPEAT', 'SALES'],
  'sales-boundary': ['INQUIRY', 'SALES'],
} as const satisfies Record<GoalPair, readonly Goal[]>;

const requestedGoalPair = process.env['PHOTO_FIRST_QUALITY_GOAL_PAIR'] ?? 'baseline';
if (
  requestedGoalPair !== 'baseline' &&
  requestedGoalPair !== 'conversion' &&
  requestedGoalPair !== 'retention-sales' &&
  requestedGoalPair !== 'sales-boundary'
) {
  throw new Error(`Unsupported PHOTO_FIRST_QUALITY_GOAL_PAIR: ${requestedGoalPair}`);
}
const goalPair: GoalPair = requestedGoalPair;
const goals = goalPairs[goalPair];

function sharedInput(goal: Goal) {
  return {
    sourceNote: '公開用に作成した架空のチェックリストへ、ペンで記入する手元の合成画像',
    company: {
      name: 'よりそう美容室（検証用架空店舗）',
      objectiveSummary: '初めての方にも相談しやすい施術を提供する',
      audienceSummary: '地域でこの美容室との関わりを検討している方',
      personalitySummary: '落ち着いた、具体的な説明',
      businessProfile: {
        industry: '美容室',
        businessName: 'よりそう美容室（検証用架空店舗）',
        region: '架空市',
        productService: 'カウンセリングと施術',
        targetAudience: '地域で美容室を探している方',
        primaryPurpose: '店舗の考え方を伝える',
        businessFeatures: '施術前の確認を大切にする',
      },
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
    recentPosts: [{ topic: 'スタッフ紹介', angle: '働く人の自己紹介' }],
  };
}

async function syntheticPhoto() {
  const svg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="#f4efe6"/>
      <rect x="180" y="130" width="600" height="760" rx="30" fill="#ffffff" stroke="#173b68" stroke-width="12"/>
      <text x="250" y="235" font-family="sans-serif" font-size="48" fill="#173b68">TODAY CHECK</text>
      <g fill="none" stroke="#54aaf5" stroke-width="16">
        <rect x="250" y="310" width="54" height="54" rx="8"/><path d="M265 335l15 15 35-42"/>
        <rect x="250" y="430" width="54" height="54" rx="8"/><path d="M265 455l15 15 35-42"/>
        <rect x="250" y="550" width="54" height="54" rx="8"/>
      </g>
      <g stroke="#8594a8" stroke-width="16" stroke-linecap="round">
        <path d="M350 337h300"/><path d="M350 457h250"/><path d="M350 577h280"/>
      </g>
      <path d="M705 690l135-215 42 26-135 215-70 47z" fill="#173b68"/>
      <path d="M677 763l28-73 42 26z" fill="#f0b68e"/>
    </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer());
}

function contentInput(goal: Goal, planning: PhotoFirstPlanning, analysis: unknown) {
  const input = sharedInput(goal);
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

describe.runIf(runLive)('Photo First actual provider quality (manual, synthetic data only)', () => {
  it(`compares the ${goalPair} goal pair with a six-request hard cap and no retry`, async () => {
    expect(apiKey, 'OPENAI_API_KEY must be present only in the execution environment').not.toBe('');
    const photo = await syntheticPhoto();
    let requestCount = 0;
    const cappedFetch: typeof fetch = async (url, init) => {
      requestCount += 1;
      if (requestCount > requestLimit) throw new Error('LIVE_PROVIDER_REQUEST_LIMIT_EXCEEDED');
      const response = await fetch(url, init);
      if (!response.ok) {
        const value = (await response
          .clone()
          .json()
          .catch(() => null)) as {
          error?: { code?: unknown; type?: unknown; message?: unknown };
        } | null;
        console.info(
          `PHOTO_FIRST_PROVIDER_ERROR=${JSON.stringify({
            requestCount,
            status: response.status,
            code: typeof value?.error?.code === 'string' ? value.error.code : null,
            type: typeof value?.error?.type === 'string' ? value.error.type : null,
            message:
              typeof value?.error?.message === 'string' ? value.error.message.slice(0, 300) : null,
          })}`,
        );
      }
      return response;
    };
    const analyzer = new OpenAiPhotoFirstAnalyzer({ apiKey, model, fetch: cappedFetch });
    const generator = new OpenAIMissionContentGenerator({ apiKey, model, fetch: cappedFetch });
    const checker = new OpenAIMissionQualityChecker({ apiKey, model, fetch: cappedFetch });
    const results = [];

    for (const goal of goals) {
      const initial = sharedInput(goal);
      const planned = await analyzer.analyze({
        ...initial,
        bytes: photo,
        mimeType: 'image/jpeg',
      });
      const generationInput = contentInput(goal, planned.planning, planned.analysis);
      const generated = await generator.generate(generationInput);
      const checked = await checker.check({
        platform: generationInput.platform,
        brief: generationInput.brief,
        bunshin: generationInput.bunshin,
        approvedStrategy: generationInput.approvedStrategy,
        businessProfile: generationInput.businessProfile,
        selectedMemories: [],
        groupKnowledge: [],
        recentContent: generationInput.recentContent.map((item) => ({
          missionDate: item.missionDate,
          topic: item.topic,
          angle: item.angle,
          contentExcerpt: item.contentSummary,
        })),
        content: generated.output,
      });
      results.push({
        goal,
        planning: planned.planning,
        content: generated.output,
        quality: checked.output,
        telemetry: {
          analyzer: {
            model: planned.model,
            promptVersion: planned.promptVersion,
            inputTokens: planned.inputTokens,
            outputTokens: planned.outputTokens,
            latencyMs: planned.latencyMs,
          },
          generator: {
            model: generated.model,
            promptVersion: generated.promptVersion,
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
            latencyMs: generated.latencyMs,
          },
          checker: {
            model: checked.model,
            promptVersion: checked.promptVersion,
            inputTokens: checked.inputTokens,
            outputTokens: checked.outputTokens,
            latencyMs: checked.latencyMs,
          },
        },
      });
    }

    const first = results[0];
    const second = results[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(requestCount).toBe(requestLimit);
    expect(createHash('sha256').update(photo).digest('hex')).toHaveLength(64);
    expect(first?.planning.theme).not.toBe(second?.planning.theme);
    expect(first?.planning.angle).not.toBe(second?.planning.angle);
    expect(first?.planning.recommendationReason).not.toBe(second?.planning.recommendationReason);
    expect(first?.content.body).not.toBe(second?.content.body);
    expect(first?.content.photoInstruction).not.toBe(second?.content.photoInstruction);
    expect(first?.content.cta).not.toBe(second?.content.cta);

    if (goalPair === 'baseline') {
      expect(JSON.stringify(second)).toMatch(/採用|応募|働|職場|スタッフ/);
      expect(JSON.stringify(first)).toMatch(/認知|知って|フォロー|保存|特徴|考え方/);
    } else if (goalPair === 'conversion') {
      expect(JSON.stringify(first)).toMatch(/予約|来店|空き|初回|メニュー/);
      expect(JSON.stringify(second)).toMatch(/問い合わせ|相談|LINE|質問|FAQ/);
    } else if (goalPair === 'retention-sales') {
      expect(JSON.stringify(first)).toMatch(/再来店|再予約|リピート|次回|アフターケア/);
      expect(JSON.stringify(second)).toMatch(/購入|商品|販売|注文|メニュー/);
    } else {
      expect(JSON.stringify(first)).toMatch(/問い合わせ|相談|LINE|質問|FAQ/);
      expect(JSON.stringify(second)).toMatch(/購入|商品|販売|注文|メニュー/);
    }

    console.info(
      `PHOTO_FIRST_PROVIDER_QUALITY_RESULT=${JSON.stringify({
        executedAt: new Date().toISOString(),
        model,
        goalPair,
        requestCount,
        photoSha256: createHash('sha256').update(photo).digest('hex'),
        results,
      })}`,
    );
  }, 360_000);
});
