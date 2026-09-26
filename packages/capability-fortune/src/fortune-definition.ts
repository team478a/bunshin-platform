import type { CapabilityDefinition } from '@bunshin/capability-contract';

export const FORTUNE_CAPABILITY = {
  type: 'FORTUNE',
  version: '1',
} as const satisfies CapabilityDefinition;

/** Common service notification topic used by the Fortune package. */
export const FORTUNE_WEEKLY_NOTIFICATION_TOPIC = 'FORTUNE_WEEKLY';

export const FORTUNE_THEMES = ['LOVE', 'WORK', 'RELATIONSHIPS'] as const;
export type FortuneTheme = (typeof FORTUNE_THEMES)[number];
