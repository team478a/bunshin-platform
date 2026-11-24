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

export interface BrowserStepEvidence {
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
