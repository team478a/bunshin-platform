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
}

export const BROWSER_FIXTURE_VERSION = 'practice-note-v1';
export const browserPreviewChoices = ['preview', 'compact-preview'] as const;
export const browserPreviewChoiceSchema = z.enum(browserPreviewChoices);
export const browserPreviewResponseSchema = z.strictObject({ id: browserPreviewChoiceSchema });
export const browserFixtureSelectionRequestSchema = z.strictObject({
  jobId: z.uuid(),
  workerId: z.uuid(),
});
