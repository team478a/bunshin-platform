import {
  socialGoalPlanningProfile,
  weeklySocialGoalPlanningProfile,
  type DailyMissionPlannerProviderInput,
  type WeeklyPlannerInput,
} from '@bunshin/capability-social';

export const DATASET_VERSION = 'EVO01_SYNTHETIC_V1';
export type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN';
type Constraints = {
  requiredInput: string[];
  requiredOutput: string[];
  forbiddenOutput: string[];
};
type Base = Constraints & { id: string; expected: Verdict; response: unknown };
export type EvaluationCase = Base &
  (
    | {
        task: 'DAILY_MISSION';
        input: DailyMissionPlannerProviderInput;
        body: string;
        previousBody: string | null;
      }
    | { task: 'WEEKLY_PLAN'; input: WeeklyPlannerInput }
    | {
        task: 'ASSESSMENT';
        answer: string;
        missionKey: string;
        expectedAssessment: 'PASS' | 'REVIEW' | 'UNKNOWN';
        learnerLevel: 'UNKNOWN';
      }
  );

const bunshin = {
  name: '合成投稿パートナーA',
  objectiveSummary: '抽出教室の問い合わせ',
  audienceSummary: '初めてコーヒーを淹れる人',
  personalitySummary: '短く具体的',
  personality: null,
};
export const dailyInput: DailyMissionPlannerProviderInput = {
  missionDate: '2026-10-05',
  timezone: 'Asia/Tokyo',
  platform: 'X',
  availableMinutes: 5,
  bunshin,
  approvedStrategy: {
    goal: 'INQUIRY',
    goalPlanning: socialGoalPlanningProfile('INQUIRY'),
    concept: '初心者の抽出支援',
    positioning: '地域の教室',
    targetSummary: '初心者',
    ctaStrategy: '教室への問い合わせ',
    postingPolicy: '短文',
  },
  weeklyPlanStrategySummary: '抽出方法を伝え、教室への問い合わせを助ける',
  weeklyItem: {
    goal: '抽出教室への問い合わせ',
    angle: '湯温の確認',
    recommendedFormat: 'TEXT',
    notes: null,
    campaignId: null,
    classification: 'ORGANIC',
  },
  contentPillar: { title: '抽出の基本', description: null },
  grantedKnowledge: [{ type: 'SERVICE', title: '本人Aのみ', content: 'SYNTHETIC_OWNER_A_ONLY' }],
  recentTopics: [{ missionDate: '2026-10-04', topic: '豆の保存', angle: '密閉する' }],
  businessProfile: {
    industry: '飲食',
    businessName: '合成カフェA',
    region: '合成地域',
    productService: 'コーヒー抽出教室',
    primaryPurpose: '教室への問い合わせ',
    targetAudience: '初心者',
  },
};
export const weeklyInput: WeeklyPlannerInput = {
  weekStartDate: '2026-10-05',
  timezone: 'Asia/Tokyo',
  platform: 'X',
  availableMinutes: 5,
  bunshin,
  approvedStrategy: {
    ...dailyInput.approvedStrategy,
    goalPlanning: weeklySocialGoalPlanningProfile('INQUIRY'),
  },
  contentPillars: [{ id: 'synthetic-pillar-a', title: '抽出教室', description: null, weight: 100 }],
  grantedKnowledge: dailyInput.grantedKnowledge,
  recentPlanTopics: [{ weekStartDate: '2026-09-28', goal: '問い合わせ', angle: '保存方法' }],
  recentPerformance: {
    periodDays: 28,
    postedCount: 0,
    feedback: { good: 0, neutral: 0, bad: 0 },
    formats: [],
    goalEvaluation: {
      goal: 'INQUIRY',
      status: 'NO_DATA',
      primaryOutcomeKeys: ['inquiries'],
      recordedPostCount: 0,
      primaryOutcomeTotal: 0,
      feedbackMeaning: 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT',
      limitations: ['投稿実績未入力、効果は不明'],
    },
  },
};
const dailyResponse = {
  topic: '抽出教室の湯温',
  angle: '湯温を確認してから注ぐ',
  reason: '初心者が教室へ問い合わせる前の疑問を具体化',
  estimatedMinutes: 5,
  usedTrendIdea: false,
  personalizationSourceTypes: ['BUSINESS_PROFILE'],
  personalizationReason: '抽出教室と初心者に合わせた',
};
const weeklyResponse = {
  strategySummary: '成果は未測定。抽出教室への問い合わせを助ける',
  items: [
    {
      scheduledDate: '2026-10-05',
      contentPillarId: 'synthetic-pillar-a',
      goal: '抽出教室への問い合わせ',
      angle: '湯温の測り方を一つ紹介する',
      recommendedFormat: 'TEXT',
      notes: null,
      campaignId: null,
      classification: 'ORGANIC',
      businessContentCategory: null,
    },
  ],
};
const constraints: Constraints = {
  requiredInput: ['SYNTHETIC_OWNER_A_ONLY'],
  requiredOutput: [],
  forbiddenOutput: ['SYNTHETIC_OWNER_B_ONLY', '全国一位', '成功を保証'],
};
const daily: EvaluationCase = {
  ...constraints,
  id: 'daily-aligned',
  task: 'DAILY_MISSION',
  input: dailyInput,
  response: dailyResponse,
  body: '湯温を確認して、少しずつ注いでみましょう。抽出教室の詳細はお問い合わせください。',
  previousBody: null,
  requiredInput: ['SYNTHETIC_OWNER_A_ONLY', '豆の保存', '抽出教室'],
  requiredOutput: ['抽出教室', '湯温'],
  expected: 'PASS',
};
const weekly: EvaluationCase = {
  ...constraints,
  id: 'weekly-unmeasured',
  task: 'WEEKLY_PLAN',
  input: weeklyInput,
  response: weeklyResponse,
  requiredInput: ['NO_DATA', '保存方法', 'SYNTHETIC_OWNER_A_ONLY'],
  requiredOutput: ['未測定', '問い合わせ', '湯温'],
  expected: 'PASS',
};
const assessment = (understanding: number, score: number) => ({
  understanding,
  skills: {
    promptStructure: score,
    contextSetting: score,
    constraintSetting: score,
    outputControl: score,
    businessApplication: score,
    revisionSkill: score,
  },
  strengths: ['目的を示した'],
  weaknesses: ['条件を確認する'],
  recommendedNextSkill: 'contextSetting',
});
const training: EvaluationCase = {
  id: 'assessment-correct',
  task: 'ASSESSMENT',
  answer: '初心者向けに抽出の手順を3つ、短い箇条書きで説明してください。SYNTHETIC_LEARNER_A_ONLY',
  missionKey: 'PROMPT_BASIC',
  response: assessment(85, 80),
  expectedAssessment: 'PASS',
  learnerLevel: 'UNKNOWN',
  expected: 'PASS',
  requiredInput: ['SYNTHETIC_LEARNER_A_ONLY', 'learningObjective', 'successCriteria'],
  requiredOutput: [],
  forbiddenOutput: ['SYNTHETIC_LEARNER_B_ONLY'],
};

/** All inputs and canned outputs are invented. Negative cases deliberately violate an oracle. */
export const evaluationCases: readonly EvaluationCase[] = [
  daily,
  {
    ...daily,
    id: 'daily-sparse-fabrication',
    input: { ...dailyInput, businessProfile: null },
    requiredInput: ['SYNTHETIC_OWNER_A_ONLY'],
    response: { ...dailyResponse, topic: '全国一位の教室' },
    expected: 'FAIL',
  },
  {
    ...daily,
    id: 'daily-rejected-long-form',
    input: {
      ...dailyInput,
      grantedKnowledge: [
        ...dailyInput.grantedKnowledge,
        { type: 'FEEDBACK', title: '本人の不採用理由', content: '長文は不採用。短文を希望' },
      ],
    },
    requiredInput: ['長文は不採用'],
    body: '抽出教室への問い合わせ。'.repeat(40),
    expected: 'FAIL',
  },
  { ...daily, id: 'daily-repeated-content', previousBody: daily.body, expected: 'FAIL' },
  {
    ...daily,
    id: 'daily-cross-owner',
    response: { ...dailyResponse, reason: 'SYNTHETIC_OWNER_B_ONLY' },
    expected: 'FAIL',
  },
  {
    ...daily,
    id: 'daily-other-user-personalization',
    input: {
      ...dailyInput,
      bunshin: { ...bunshin, name: '合成投稿パートナーB' },
      grantedKnowledge: [
        { type: 'SERVICE', title: '本人Bのみ', content: 'SYNTHETIC_OWNER_B_ONLY' },
      ],
      businessProfile: {
        ...dailyInput.businessProfile!,
        businessName: '合成工房B',
        productService: '木工教室',
      },
    },
    requiredInput: ['SYNTHETIC_OWNER_B_ONLY', '木工教室'],
    forbiddenOutput: ['SYNTHETIC_OWNER_A_ONLY', '抽出教室'],
    requiredOutput: ['木工教室'],
    response: {
      ...dailyResponse,
      topic: '木工教室の道具',
      angle: '木工道具を確認する',
      reason: '木工教室の初心者向け',
      personalizationReason: '木工教室の目的に合わせた',
    },
    body: '木工教室では、最初に道具の使い方を確認しましょう。',
    expected: 'PASS',
  },
  { ...daily, id: 'daily-invalid-output', response: { topic: 4 }, expected: 'FAIL' },
  weekly,
  {
    ...weekly,
    id: 'weekly-false-success',
    response: { ...weeklyResponse, strategySummary: '成功を保証、問い合わせが増えた' },
    expected: 'FAIL',
  },
  {
    ...weekly,
    id: 'weekly-goal-changed',
    input: {
      ...weeklyInput,
      approvedStrategy: {
        ...weeklyInput.approvedStrategy,
        goal: 'RECRUIT',
        goalPlanning: weeklySocialGoalPlanningProfile('RECRUIT'),
      },
    },
    requiredInput: ['RECRUIT'],
    requiredOutput: ['採用'],
    response: {
      ...weeklyResponse,
      strategySummary: '採用向けに、教室の職場環境を紹介する',
      items: [
        {
          ...weeklyResponse.items[0]!,
          goal: '採用への関心',
          angle: '教室スタッフの仕事を紹介する',
        },
      ],
    },
    expected: 'PASS',
  },
  {
    ...weekly,
    id: 'weekly-stale-goal',
    input: {
      ...weeklyInput,
      approvedStrategy: {
        ...weeklyInput.approvedStrategy,
        goal: 'RECRUIT',
        goalPlanning: weeklySocialGoalPlanningProfile('RECRUIT'),
      },
    },
    requiredInput: ['RECRUIT'],
    requiredOutput: ['採用'],
    expected: 'FAIL',
  },
  {
    ...weekly,
    id: 'weekly-foreign-pillar',
    response: {
      ...weeklyResponse,
      items: [{ ...weeklyResponse.items[0]!, contentPillarId: 'foreign-pillar' }],
    },
    expected: 'FAIL',
  },
  {
    ...weekly,
    id: 'weekly-duplicate-days',
    response: { ...weeklyResponse, items: [weeklyResponse.items[0], weeklyResponse.items[0]] },
    expected: 'FAIL',
  },
  { ...weekly, id: 'weekly-daily-inconsistent', requiredOutput: ['木工教室'], expected: 'FAIL' },
  training,
  {
    ...training,
    id: 'assessment-partial',
    answer: '短い文章にしてください。SYNTHETIC_LEARNER_A_ONLY',
    response: assessment(70, 45),
    expectedAssessment: 'REVIEW',
  },
  {
    ...training,
    id: 'assessment-wrong',
    answer: '条件や目的は不要。SYNTHETIC_LEARNER_A_ONLY',
    response: assessment(20, 20),
    expectedAssessment: 'REVIEW',
  },
  {
    ...training,
    id: 'assessment-false-pass',
    answer: '条件や目的は不要。SYNTHETIC_LEARNER_A_ONLY',
    response: assessment(95, 95),
    expectedAssessment: 'REVIEW',
    expected: 'FAIL',
  },
  {
    ...training,
    id: 'assessment-insufficient',
    answer: '分からない。SYNTHETIC_LEARNER_A_ONLY',
    response: assessment(10, 10),
    expectedAssessment: 'REVIEW',
  },
  {
    ...training,
    id: 'assessment-missing-evidence',
    response: null,
    expectedAssessment: 'UNKNOWN',
    expected: 'UNKNOWN',
  },
  { ...training, id: 'assessment-invalid-score', response: assessment(150, 80), expected: 'FAIL' },
  {
    ...training,
    id: 'assessment-cross-learner',
    response: { ...assessment(85, 80), strengths: ['SYNTHETIC_LEARNER_B_ONLY'] },
    expected: 'FAIL',
  },
  {
    ...training,
    id: 'assessment-artifact-not-capability',
    answer: '完成メールをAIからコピーしました。SYNTHETIC_LEARNER_A_ONLY',
    response: assessment(30, 30),
    expectedAssessment: 'REVIEW',
  },
  {
    ...training,
    id: 'assessment-level-unknown',
    response: assessment(85, 80),
    learnerLevel: 'UNKNOWN',
  },
];
