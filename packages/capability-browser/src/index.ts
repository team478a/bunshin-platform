import { z } from 'zod';

const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const accessibleName = z.string().min(1).max(120);
const locator = z.discriminatedUnion('by', [
  z.strictObject({ by: z.literal('label'), text: accessibleName }),
  z.strictObject({ by: z.literal('text'), text: accessibleName }),
  z.strictObject({
    by: z.literal('role'),
    role: z.enum(['button', 'heading', 'link', 'textbox', 'status', 'checkbox', 'combobox']),
    name: accessibleName,
  }),
]);
const step = z.discriminatedUnion('action', [
  z.strictObject({ id: identifier, action: z.literal('navigate'), page: identifier }),
  z.strictObject({ id: identifier, action: z.literal('click'), target: locator }),
  z.strictObject({
    id: identifier,
    action: z.literal('fill'),
    target: locator,
    sample: identifier,
  }),
  z.strictObject({ id: identifier, action: z.literal('scroll'), target: locator }),
]);

export const browserPlanSchema = z
  .strictObject({
    version: z.literal(1),
    device: z.enum(['desktop', 'mobile']),
    startPage: identifier,
    steps: z.array(step).min(1),
    success: z.strictObject({ page: identifier, visible: locator }),
  })
  .refine(({ steps }) => new Set(steps.map(({ id }) => id)).size === steps.length, {
    message: 'Step IDs must be unique',
  });

export type BrowserPlan = z.infer<typeof browserPlanSchema>;
export type BrowserLocator = z.infer<typeof locator>;

export interface BrowserStepState {
  page: string;
  accessibility: string;
}

export const browserEvidenceTargetSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  viewportWidth: z.number().positive(),
  viewportHeight: z.number().positive(),
});

export interface BrowserStepEvidence {
  target?: z.infer<typeof browserEvidenceTargetSchema>;
  stepId: string;
  action: BrowserPlan['steps'][number]['action'];
  before: BrowserStepState;
  after: BrowserStepState;
  beforePng: Uint8Array;
  afterPng: Uint8Array;
}

export interface BrowserRun {
  browserVersion: string;
  durationMs: number;
  verifiedAt: string;
  device: BrowserPlan['device'];
  steps: BrowserStepEvidence[];
  verifiedResultText?: string;
}

export const browserMaterialVideoVersion = 3;
export const browserMaterialAzureVoices = {
  shiori: { version: 4, model: 'ja-JP-ShioriNeural', label: '志織（女性）' },
  daichi: { version: 5, model: 'ja-JP-DaichiNeural', label: '大智（男性）' },
} as const;
export type BrowserMaterialAzureVoice = keyof typeof browserMaterialAzureVoices;
export function browserMaterialAzureVoice(value: unknown): BrowserMaterialAzureVoice {
  return value === 'daichi' ? 'daichi' : 'shiori';
}
export function browserMaterialAzureProfile(version: number) {
  return Object.values(browserMaterialAzureVoices).find((voice) => voice.version === version);
}
export const browserMaterialNarrationPreviewText =
  '画面の「詳細を開く」を選びます。次に、「比較を開く」を押して、結果を確認しましょう。';
export const browserMaterialMeiVoice = {
  name: 'HTS Voice “Mei”',
  attribution: 'Nagoya Institute of Technology, MMDAgent Project Team',
  license: 'CC BY 3.0',
  source:
    'https://github.com/r9y9/pyopenjtalk/blob/v0.4.1/pyopenjtalk/htsvoice/LICENSE_mei_normal.htsvoice',
} as const;

export const BROWSER_FIXTURE_VERSION = 'practice-note-v1';
export const browserPreviewChoices = ['preview', 'compact-preview'] as const;
export const browserPreviewChoiceSchema = z.enum(browserPreviewChoices);
export const browserPreviewResponseSchema = z.strictObject({ id: browserPreviewChoiceSchema });
export const browserFixtureSelectionRequestSchema = z.strictObject({
  jobId: z.uuid(),
  workerId: z.uuid(),
});

export const browserObservedFixtureVersion = 'observed-catalogue-v1';
export const browserObservedFixtureObjective = '研修用カタログの詳細から比較結果を開く。';
export const browserObservedStepLimit = 3;
export const browserFormFixtureVersion = 'observed-form-v1';
export const browserFormStepLimit = 8;
export const browserFormFixtureObjective =
  '研修申請フォームに進み、件名と理由に練習用の文字を入力し、確認欄をチェックする。プレビューを開き、表示内容を確認する。';
export const browserFormSampleId = 'training-example';
export const trainingCatalogueDiscoveryPrefix = 'training-catalogue-discovery';

export function browserPilotEnvironment(
  appEnvironment: string | undefined,
): 'DEVELOPMENT' | 'STAGING' | null {
  if (appEnvironment === 'development') return 'DEVELOPMENT';
  if (appEnvironment === 'staging') return 'STAGING';
  return null;
}
export function browserObservedModelOperationKey(jobId: string, ordinal: number) {
  return `browser-fixture-selection:${jobId}:step-${ordinal}`;
}
export const browserObservedChoiceSchema = z.strictObject({
  id: z.string().regex(/^observed-[1-3]-\d{1,2}$/),
  role: z.enum(['button', 'link']),
  name: z.string().trim().min(1).max(120),
});
const browserFormChoiceSchema = browserObservedChoiceSchema.extend({
  id: z.string().regex(/^observed-[1-8]-\d{1,2}$/),
  role: z.enum(['button', 'link', 'textbox', 'checkbox']),
});
export const browserObservedSelectionSchema = z
  .strictObject({
    ordinal: z.int().min(1).max(browserObservedStepLimit),
    choices: z.array(browserObservedChoiceSchema).min(1).max(60),
  })
  .refine(
    ({ ordinal, choices }) =>
      choices.every(({ id }) => id.startsWith('observed-' + ordinal + '-')) &&
      new Set(choices.map(({ id }) => id)).size === choices.length,
  );
export type BrowserObservedSelection = z.infer<typeof browserObservedSelectionSchema>;
export const browserFormSelectionSchema = z
  .strictObject({
    ordinal: z.int().min(1).max(browserFormStepLimit),
    choices: z.array(browserFormChoiceSchema).min(1).max(60),
  })
  .refine(
    ({ ordinal, choices }) =>
      choices.every(({ id }) => id.startsWith('observed-' + ordinal + '-')) &&
      new Set(choices.map(({ id }) => id)).size === choices.length,
  );
export type BrowserFormSelection = z.infer<typeof browserFormSelectionSchema>;
export const browserFormResponseSchema = z.strictObject({ id: browserFormChoiceSchema.shape.id });
export const browserObservedResponseSchema = z.strictObject({
  id: browserObservedChoiceSchema.shape.id,
});
