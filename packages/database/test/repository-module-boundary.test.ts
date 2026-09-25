import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) =>
  readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');

const clusters = {
  'service-commercial-credit': [
    'service-referral-reward-repository',
    'service-credit-consumption-repository',
    'service-credit-expiration-repository',
    'service-credit-adjustment-repository',
    'service-referral-reward-rule-repository',
  ],
  'line-delivery': [
    'line-delivery-retry-repository',
    'line-message-delivery-repository',
    'line-delivery-preference-repository',
    'line-return-reminder-repository',
    'mission-deep-link-state-repository',
  ],
  'badge-line-notification': [
    'badge-line-notification-preparation-repository',
    'badge-line-job-candidate-repository',
    'badge-line-delivery-repository',
    'badge-line-delivery-retry-repository',
    'badge-line-reconciliation-repository',
  ],
  'mission-generation': [
    'line-mission-notification-summary-repository',
    'daily-mission-generation-repository',
    'mission-content-variant-repository',
    'generation-context-snapshot-repository',
  ],
} as const;

describe('database repository module boundaries', () => {
  for (const [barrel, modules] of Object.entries(clusters)) {
    it(`${barrel} remains a compatibility-only export boundary`, () => {
      const source = readSource(barrel);
      expect(source).not.toContain('export class ');
      for (const module of modules) {
        expect(source).toContain(`from './${module}'`);
        expect(readSource(module).match(/export class /g)).toHaveLength(1);
      }
    });
  }
});
